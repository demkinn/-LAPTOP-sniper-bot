# $LAPTOP Sniper Bot

Standalone **Base** $LAPTOP sniper. It is independent of `demkinn_sol`.

## What it does

The bot monitors only the configured Base contract, looks for newly created liquid pairs, applies market-flow gates, and then either paper-trades or executes a 0x Swap API v2 quote.

Live flow:

`DexScreener discovery → safety gates → 0x firm quote → gas/impact checks → wallet transaction → receipt confirmation → persistent position → TP / SL / trailing / time exit → 0x sell quote → allowance → wallet transaction`

The official project currently publishes Base contract `0xB095274743941e953c746F9C228DA9c18Bb6ec29`; the ticker alone is not enough because unrelated LAPTOP tokens exist on other chains. Verify the address independently before enabling live trading.

## Install

Node.js 22+ is required.

```bash
npm install
cp .env.example .env
npm run build
npm test
```

Start in paper mode:

```bash
npm start
```

## Live mode

Live trading is **off by default**. To enable it, configure:

- `ZEROX_API_KEY`
- `PRIVATE_KEY` for a dedicated Base trading wallet
- `PAPER_MODE=false`
- `LIVE_TRADING_ENABLED=true`
- `LIVE_TRADING_CONFIRM=I_UNDERSTAND_LIVE_TRADING`

Then review every risk limit in `.env` before starting.

The bot never guesses an ERC-20 approval target. It only approves the allowance target returned by 0x. The 0x documentation specifically separates the allowance target from the swap transaction target and warns not to approve the Settler contract.

## Risk controls

Default limits include max slippage, max gas price, max price impact, minimum liquidity/volume, buy/sell pressure, maximum pair age, take-profit, stop-loss, trailing stop, time stop, cooldown, daily loss limit, and an emergency stop file.

Create a file named `STOP` in the working directory to prevent new orders. Remove it to resume.

## Runtime state

- `runtime/state.json` — current position and realized daily PnL.
- `runtime/events.jsonl` — append-only event log.

These paths should remain local and should never contain secrets.

## Important

This software does not guarantee profit. Memecoins can lose most or all of their value, and execution can differ from quoted market data. Run paper mode first and use a dedicated wallet with only the capital you are prepared to lose.
