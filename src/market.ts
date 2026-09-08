import { getAddress } from 'viem';
import { config } from './config.js';

export interface Pair {
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

interface ResponseBody { pairs?: Pair[] | null }

export async function fetchPairs(): Promise<Pair[]> {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${config.token}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`DexScreener HTTP ${response.status}`);
  const body = (await response.json()) as ResponseBody;
  return (body.pairs ?? [])
    .filter((p) => p.chainId === 'base')
    .filter((p) => p.baseToken?.address && getAddress(p.baseToken.address) === config.token)
    .filter((p) => p.pairAddress && p.priceUsd);
}

export function qualifies(pair: Pair): { ok: boolean; reason: string } {
  const liquidity = Number(pair.liquidity?.usd || 0);
  const m5Volume = Number(pair.volume?.m5 || 0);
  const buys = Number(pair.txns?.m5?.buys || 0);
  const sells = Number(pair.txns?.m5?.sells || 0);
  const ageSec = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 1000 : 0;
  const ratio = sells === 0 ? buys : buys / sells;

  if (liquidity < config.minLiquidityUsd) return { ok: false, reason: `liquidity ${liquidity.toFixed(0)} < ${config.minLiquidityUsd}` };
  if (liquidity > config.maxLiquidityUsd) return { ok: false, reason: `liquidity ${liquidity.toFixed(0)} > ${config.maxLiquidityUsd}` };
  if (m5Volume < config.minM5VolumeUsd) return { ok: false, reason: `m5 volume ${m5Volume.toFixed(0)} < ${config.minM5VolumeUsd}` };
  if (buys < 2) return { ok: false, reason: 'fewer than 2 buys in 5m' };
  if (ratio < config.minBuySellRatio) return { ok: false, reason: `buy/sell ratio ${ratio.toFixed(2)} < ${config.minBuySellRatio}` };
  if (pair.pairCreatedAt && ageSec > config.maxPairAgeSec) return { ok: false, reason: `pair age ${ageSec.toFixed(0)}s > ${config.maxPairAgeSec}s` };
  return { ok: true, reason: 'all market gates passed' };
}

export function pairPrice(pair: Pair): number {
  return Number(pair.priceUsd || 0);
}
