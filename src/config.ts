import { getAddress } from 'viem';

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

const token = getAddress(process.env.LAPTOP_TOKEN || '0xB095274743941e953c746F9C228DA9c18Bb6ec29');

export const config = {
  chainId: 8453,
  token,
  pollMs: Math.max(500, num('SNIPER_POLL_MS', 1000)),
  rpcUrl: process.env.RPC_URL || 'https://mainnet.base.org',
  zeroXApiKey: process.env.ZEROX_API_KEY || '',
  paperMode: bool('PAPER_MODE', true),
  liveTradingEnabled: bool('LIVE_TRADING_ENABLED', false),
  liveTradingConfirm: process.env.LIVE_TRADING_CONFIRM || '',
  privateKey: process.env.PRIVATE_KEY || '',
  tradeEth: Math.max(0.0001, num('TRADE_ETH', 0.01)),
  minLiquidityUsd: Math.max(0, num('MIN_LIQUIDITY_USD', 15000)),
  maxLiquidityUsd: Math.max(0, num('MAX_LIQUIDITY_USD', 1000000)),
  minM5VolumeUsd: Math.max(0, num('MIN_M5_VOLUME_USD', 1000)),
  minBuySellRatio: Math.max(0, num('MIN_BUY_SELL_RATIO', 1.10)),
  maxPairAgeSec: Math.max(1, num('MAX_PAIR_AGE_SEC', 900)),
  maxSlippageBps: Math.max(1, num('MAX_SLIPPAGE_BPS', 150)),
  maxGasGwei: Math.max(0.01, num('MAX_GAS_GWEI', 1.0)),
  maxPriceImpactBps: Math.max(1, num('MAX_PRICE_IMPACT_BPS', 500)),
  takeProfitPct: Math.max(0.01, num('TAKE_PROFIT_PCT', 0.50)),
  stopLossPct: Math.max(0.01, num('STOP_LOSS_PCT', 0.20)),
  trailActivatePct: Math.max(0, num('TRAIL_ACTIVATE_PCT', 0.25)),
  trailPullbackPct: Math.max(0.01, num('TRAIL_PULLBACK_PCT', 0.15)),
  maxHoldMin: Math.max(1, num('MAX_HOLD_MIN', 45)),
  cooldownSec: Math.max(0, num('COOLDOWN_SEC', 30)),
  dailyLossEth: Math.max(0, num('DAILY_LOSS_ETH', 0.05)),
  logFile: process.env.LOG_FILE || 'runtime/events.jsonl',
  stateFile: process.env.STATE_FILE || 'runtime/state.json'
} as const;

export function assertConfig(): void {
  if (!config.paperMode) {
    if (!config.liveTradingEnabled) throw new Error('Live mode requires LIVE_TRADING_ENABLED=true.');
    if (config.liveTradingConfirm !== 'I_UNDERSTAND_LIVE_TRADING') {
      throw new Error('Live mode requires LIVE_TRADING_CONFIRM=I_UNDERSTAND_LIVE_TRADING.');
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(config.privateKey)) throw new Error('PRIVATE_KEY must be a 32-byte 0x-prefixed key in live mode.');
    if (!config.zeroXApiKey) throw new Error('ZEROX_API_KEY is required in live mode.');
  }
}
