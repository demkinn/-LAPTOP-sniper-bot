import 'dotenv/config';

const TOKEN = (process.env.LAPTOP_TOKEN || '0xB095274743941e953c746F9C228DA9c18Bb6ec29').toLowerCase();
const POLL_MS = Math.max(750, Number(process.env.SNIPER_POLL_MS || 1500));
const ENTRY_USD = Math.max(1, Number(process.env.PAPER_ENTRY_USD || 100));
const MIN_LIQUIDITY_USD = Math.max(0, Number(process.env.MIN_LIQUIDITY_USD || 25_000));
const MAX_LIQUIDITY_USD = Math.max(MIN_LIQUIDITY_USD, Number(process.env.MAX_LIQUIDITY_USD || 500_000));
const MIN_M5_VOLUME_USD = Math.max(0, Number(process.env.MIN_M5_VOLUME_USD || 250));
const TAKE_PROFIT_PCT = Number(process.env.TAKE_PROFIT_PCT || 0.50);
const STOP_LOSS_PCT = Number(process.env.STOP_LOSS_PCT || 0.20);
const PAPER_MODE = (process.env.PAPER_MODE ?? 'true').toLowerCase() !== 'false';

if (!PAPER_MODE) throw new Error('Live execution is disabled in this standalone V1. Set PAPER_MODE=true.');

interface Pair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { m5?: number };
  txns?: { m5?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
}

interface DexResponse { pairs?: Pair[] | null }
interface Position { pairAddress: string; entryPrice: number; entryAt: number; lastPrice: number; url: string }

let position: Position | null = null;
let seenPair = '';

async function getPairs(): Promise<Pair[]> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
  const body = (await res.json()) as DexResponse;
  return (body.pairs ?? [])
    .filter((p) => p.chainId === 'base')
    .filter((p) => p.baseToken?.address?.toLowerCase() === TOKEN)
    .filter((p) => !!p.pairAddress && !!p.priceUsd);
}

function qualifies(pair: Pair): { ok: boolean; reason: string } {
  const liquidity = Number(pair.liquidity?.usd || 0);
  const m5Volume = Number(pair.volume?.m5 || 0);
  const buys = Number(pair.txns?.m5?.buys || 0);
  const sells = Number(pair.txns?.m5?.sells || 0);
  if (liquidity < MIN_LIQUIDITY_USD) return { ok: false, reason: `liquidity ${liquidity.toFixed(0)} < ${MIN_LIQUIDITY_USD}` };
  if (liquidity > MAX_LIQUIDITY_USD) return { ok: false, reason: `liquidity ${liquidity.toFixed(0)} > ${MAX_LIQUIDITY_USD}` };
  if (m5Volume < MIN_M5_VOLUME_USD) return { ok: false, reason: `m5 volume ${m5Volume.toFixed(0)} < ${MIN_M5_VOLUME_USD}` };
  if (buys < 1) return { ok: false, reason: 'no buys in 5m' };
  if (buys < sells) return { ok: false, reason: `sell pressure ${buys}/${sells}` };
  return { ok: true, reason: 'all entry gates passed' };
}

function log(pair: Pair): void {
  const liquidity = Number(pair.liquidity?.usd || 0);
  const volume = Number(pair.volume?.m5 || 0);
  const buys = Number(pair.txns?.m5?.buys || 0);
  const sells = Number(pair.txns?.m5?.sells || 0);
  const price = Number(pair.priceUsd || 0);
  console.log(`[${new Date().toISOString()}] ${pair.dexId ?? 'dex'} price=$${price.toPrecision(8)} liq=$${liquidity.toFixed(0)} m5=$${volume.toFixed(0)} buys/sells=${buys}/${sells}`);
}

function enter(pair: Pair): void {
  const price = Number(pair.priceUsd || 0);
  if (!pair.pairAddress || !price) return;
  position = { pairAddress: pair.pairAddress, entryPrice: price, entryAt: Date.now(), lastPrice: price, url: pair.url || '' };
  console.log(`🚀 PAPER SNIPE: $${ENTRY_USD.toFixed(2)} @ $${price.toPrecision(10)} | ${pair.url || pair.pairAddress}`);
}

function manage(pair: Pair): void {
  if (!position || position.pairAddress !== pair.pairAddress) return;
  const price = Number(pair.priceUsd || 0);
  if (!price) return;
  position.lastPrice = price;
  const pnl = price / position.entryPrice - 1;
  if (pnl >= TAKE_PROFIT_PCT || pnl <= -STOP_LOSS_PCT) {
    console.log(`🏁 PAPER EXIT ${pnl >= 0 ? 'TP' : 'SL'} ${(pnl * 100).toFixed(2)}% | $${position.entryPrice.toPrecision(10)} → $${price.toPrecision(10)}`);
    position = null;
  }
}

async function tick(): Promise<void> {
  const pairs = await getPairs();
  if (!pairs.length) {
    console.log(`[${new Date().toISOString()}] no Base $LAPTOP pair found`);
    return;
  }
  pairs.sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));
  const pair = pairs[0]!;
  log(pair);
  manage(pair);
  if (position || pair.pairAddress === seenPair) return;
  const gate = qualifies(pair);
  console.log(`  → ${gate.ok ? 'QUALIFIED' : 'REJECTED'}: ${gate.reason}`);
  if (gate.ok) enter(pair);
  seenPair = pair.pairAddress || '';
}

console.log(`Standalone $LAPTOP Sniper V1 — PAPER MODE ONLY\nToken=${TOKEN}\nPoll=${POLL_MS}ms Entry=$${ENTRY_USD} TP=${TAKE_PROFIT_PCT * 100}% SL=${STOP_LOSS_PCT * 100}%`);
await tick();
setInterval(() => void tick().catch((e: unknown) => console.error('[tick error]', e)), POLL_MS);
