import { config } from './config.js';

export const NATIVE_ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

interface Tx { to: string; data: string; value?: string; gas?: string; gasPrice?: string }
export interface Quote {
  allowanceTarget?: string;
  buyAmount: string;
  sellAmount: string;
  buyToken: string;
  sellToken: string;
  liquidityAvailable?: boolean;
  priceImpactPercentage?: string | null;
  issues?: { allowance?: { actual: string; spender: string }; balance?: { actual: string; expected: string } };
  transaction: Tx;
}

export async function quote(sellToken: string, buyToken: string, sellAmount: bigint, taker: string): Promise<Quote> {
  if (!config.zeroXApiKey) throw new Error('ZEROX_API_KEY is not configured.');
  const params = new URLSearchParams({
    chainId: String(config.chainId),
    sellToken,
    buyToken,
    sellAmount: sellAmount.toString(),
    taker,
    slippageBps: String(config.maxSlippageBps)
  });
  const response = await fetch(`https://api.0x.org/swap/allowance-holder/quote?${params}`, {
    headers: { '0x-api-key': config.zeroXApiKey, '0x-version': 'v2', accept: 'application/json' }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`0x quote HTTP ${response.status}: ${text.slice(0, 500)}`);
  const body = JSON.parse(text) as Quote;
  if (!body.transaction?.to || !body.transaction?.data) throw new Error('0x returned no executable transaction.');
  if (body.liquidityAvailable === false) throw new Error('0x reports no liquidity for the requested trade.');
  return body;
}

export function quoteGasGwei(q: Quote): number {
  if (!q.transaction.gasPrice) return 0;
  return Number(q.transaction.gasPrice) / 1e9;
}

export function quoteImpactBps(q: Quote): number {
  if (q.priceImpactPercentage == null) return 0;
  return Math.abs(Number(q.priceImpactPercentage)) * 100;
}
