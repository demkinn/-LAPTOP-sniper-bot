# $LAPTOP Sniper Bot

Standalone Base-chain $LAPTOP monitoring and paper-sniping bot. It is completely independent of `demkinn_sol`.

## V1

- Monitors the configured $LAPTOP contract through DexScreener.
- Restricts candidates to Base pairs where $LAPTOP is the base token.
- Applies liquidity, 5-minute volume and buy/sell pressure gates.
- Simulates entry with configurable paper capital.
- Takes profit at the configured threshold and stops loss at the configured threshold.
- Defaults to **paper mode only**. Live wallet signing and transaction submission are not included.

## Run

```bash
npm install
cp .env.example .env
npm run build
npm start
```

The token contract is configurable via `LAPTOP_TOKEN`; verify the contract before using the bot for any decision-making. Crypto trading is highly risky and paper results do not imply future profitability.
