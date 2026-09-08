import 'dotenv/config';
import { existsSync } from 'node:fs';
import { getAddress, parseEther } from 'viem';
import { assertConfig, config } from './config.js';
import { fetchPairs, pairPrice, qualifies, type Pair } from './market.js';
import { event, loadState, saveState, type BotState } from './state.js';
import { assertNativeBalance, getAccountAddress, publicClient, executeNativeBuy, executeTokenSell } from './execution.js';
import { NATIVE_ETH, quote } from './zerox.js';

assertConfig();

const state = await loadState(config.stateFile);
const seenPairs = new Set<string>();
let running = true;

function live(): boolean { return !config.paperMode; }
function riskAllowed(): boolean { return state.realizedPnlEth > -config.dailyLossEth; }
function halted(): boolean { return existsSync(process.env.EMERGENCY_STOP_FILE || 'STOP'); }
function log(message: string): void { console.log(`[${new Date().toISOString()}] ${message}`); }
async function emit(type: string, data: Record<string, unknown>): Promise<void> { await event(config.logFile, type, data); }

function candidate(pairs: Pair[]): Pair | null {
  const eligible = pairs.filter((p) => qualifies(p).ok);
  eligible.sort((a, b) => {
    const ageA = a.pairCreatedAt ?? Number.MAX_SAFE_INTEGER;
    const ageB = b.pairCreatedAt ?? Number.MAX_SAFE_INTEGER;
    if (ageA !== ageB) return ageA - ageB;
    return Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0);
  });
  return eligible[0] ?? null;
}

async function openPosition(pair: Pair): Promise<void> {
  if (!pair.pairAddress || !pair.priceUsd || seenPairs.has(pair.pairAddress)) return;
  const price = pairPrice(pair);
  if (!price) return;
  seenPairs.add(pair.pairAddress);

  if (!live()) {
    state.position = { pairAddress: pair.pairAddress, entryPriceUsd: price, entryAmountToken: 'PAPER', entryEth: config.tradeEth, entryAt: Date.now(), peakPriceUsd: price };
    await saveState(config.stateFile, state);
    await emit('paper_buy', { pair: pair.pairAddress, dex: pair.dexId, priceUsd: price, eth: config.tradeEth });
    log(`PAPER BUY $${config.tradeEth} at $${price} on ${pair.dexId ?? 'dex'}`);
    return;
  }

  await assertNativeBalance(config.tradeEth);
  const taker = getAccountAddress();
  const q = await quote(NATIVE_ETH, config.token, parseEther(config.tradeEth.toString()), taker);
  const txHash = await executeNativeBuy(q);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  state.position = { pairAddress: pair.pairAddress, entryPriceUsd: price, entryAmountToken: q.buyAmount, entryEth: config.tradeEth, entryAt: Date.now(), peakPriceUsd: price, txHash };
  await saveState(config.stateFile, state);
  await emit('live_buy', { pair: pair.pairAddress, dex: pair.dexId, priceUsd: price, eth: config.tradeEth, txHash });
  log(`LIVE BUY $${config.tradeEth} tx=${txHash}`);
}

async function closePosition(priceUsd: number, reason: string): Promise<void> {
  const pos = state.position;
  if (!pos) return;
  const pnlPct = priceUsd / pos.entryPriceUsd - 1;
  const pnlEth = pos.entryEth * pnlPct;
  if (!live()) {
    state.realizedPnlEth += pnlEth;
    state.lastTradeAt = Date.now();
    state.position = null;
    await saveState(config.stateFile, state);
    await emit('paper_sell', { reason, priceUsd, pnlPct, pnlEth });
    log(`PAPER SELL ${reason} ${(pnlPct * 100).toFixed(2)}%`);
    return;
  }
  const taker = getAccountAddress();
  const balance = await publicClient.readContract({ address: config.token, abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] }], functionName: 'balanceOf', args: [taker] }) as bigint;
  if (balance === 0n) throw new Error('No $LAPTOP token balance available to sell.');
  const q = await quote(config.token, NATIVE_ETH, balance, taker);
  const txHash = await executeTokenSell(q);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  state.realizedPnlEth += pnlEth;
  state.lastTradeAt = Date.now();
  state.position = null;
  await saveState(config.stateFile, state);
  await emit('live_sell', { reason, priceUsd, pnlPct, pnlEth, txHash });
  log(`LIVE SELL ${reason} ${(pnlPct * 100).toFixed(2)}% tx=${txHash}`);
}

async function manage(pair: Pair): Promise<void> {
  const pos = state.position;
  if (!pos || pair.pairAddress !== pos.pairAddress) return;
  const price = pairPrice(pair);
  if (!price) return;
  pos.peakPriceUsd = Math.max(pos.peakPriceUsd, price);
  const pnlPct = price / pos.entryPriceUsd - 1;
  const drawdownFromPeak = 1 - price / pos.peakPriceUsd;
  const ageMin = (Date.now() - pos.entryAt) / 60_000;
  if (pnlPct >= config.takeProfitPct) return closePosition(price, 'TP');
  if (pnlPct <= -config.stopLossPct) return closePosition(price, 'SL');
  if (pnlPct >= config.trailActivatePct && drawdownFromPeak >= config.trailPullbackPct) return closePosition(price, 'TRAIL');
  if (ageMin >= config.maxHoldMin) return closePosition(price, 'TIME');
  await saveState(config.stateFile, state);
}

async function tick(): Promise<void> {
  if (halted()) { log('EMERGENCY STOP active; refusing all new orders.'); return; }
  if (!riskAllowed()) { log(`DAILY LOSS LIMIT reached (${state.realizedPnlEth.toFixed(6)} ETH).`); return; }
  if (state.position && Date.now() - state.lastTradeAt < config.cooldownSec * 1000) return;
  const pairs = await fetchPairs();
  for (const p of pairs) await manage(p);
  if (state.position) return;
  const next = candidate(pairs);
  if (!next) { log('No qualifying Base $LAPTOP pair.'); return; }
  await openPosition(next);
}

process.once('SIGINT', () => { running = false; });
process.once('SIGTERM', () => { running = false; });

log(`$LAPTOP Sniper 2.0 | Base 8453 | ${live() ? 'LIVE' : 'PAPER'} | token=${getAddress(config.token)}`);
log(`Trade=${config.tradeEth} ETH, max age=${config.maxPairAgeSec}s, slip=${config.maxSlippageBps}bps, TP=${config.takeProfitPct * 100}%, SL=${config.stopLossPct * 100}%`);

while (running) {
  try {
    await tick();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await emit('error', { message });
    log(`ERROR ${message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, config.pollMs));
}

await saveState(config.stateFile, state);
