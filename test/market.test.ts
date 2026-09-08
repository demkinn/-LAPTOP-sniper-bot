import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifies } from '../src/market.js';

const base = {
  chainId: 'base',
  dexId: 'uniswap',
  pairAddress: '0xpair',
  baseToken: { address: '0xB095274743941e953c746F9C228DA9c18Bb6ec29' },
  priceUsd: '1',
  liquidity: { usd: 50000 },
  volume: { m5: 5000 },
  txns: { m5: { buys: 20, sells: 10 } }
};

test('accepts a liquid, buy-heavy pair', () => {
  const result = qualifies(base);
  assert.equal(result.ok, true);
});

test('rejects thin liquidity', () => {
  const result = qualifies({ ...base, liquidity: { usd: 100 } });
  assert.equal(result.ok, false);
});

test('rejects sell pressure', () => {
  const result = qualifies({ ...base, txns: { m5: { buys: 5, sells: 10 } } });
  assert.equal(result.ok, false);
});

test('rejects stale pairs', () => {
  const result = qualifies({ ...base, pairCreatedAt: Date.now() - 2_000_000 });
  assert.equal(result.ok, false);
});
