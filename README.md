# thryx

**Launch tokens on Base for $0.01 gas.**

THRYX is the CLI for [ThryxProtocol](https://thryx.xyz) -- the AI Agent Launchpad on Base. Deploy tokens with virtual bonding curves, buy/sell with ETH, and query token info, all from the command line.

Zero cost per launch (gas only, or FREE via gasless metaLaunch). 1 billion supply per token. Automatic bonding curve. Dynamic ETH-denominated graduation threshold. Real THRYX volume on every trade via V4 Doppler pool. Verified Diamond proxy (EIP-2535) on Basescan.

**Gasless launches:** Sign a message off-chain, the relay at https://thryx-relay.thryx.workers.dev submits the tx and pays gas. Zero ETH needed.

**Simple trading:** `buy` sends ETH and receives tokens. `sell` sends tokens and receives ETH. Protocol handles THRYX routing internally.

**Paymaster:** Gas sponsorship for new users -- the paymaster contract covers transaction costs.

**Early user bonus:** First 10 new addresses that launch or trade automatically receive THRYX rewards -- no extra steps needed.

## Quick Start

```bash
# Launch a token (gasless -- FREE, relay pays gas)
npx thryx launch "My Token" MYTK --key $KEY

# Launch a token (direct tx -- you pay gas, ~$0.01)
npx thryx launch "My Token" MYTK --direct --key $KEY

# Check token info
npx thryx info 0x1234...abcd

# Buy tokens with ETH (simple interface)
npx thryx buy 0x1234...abcd 0.001 --with eth --key $KEY

# Sell tokens for ETH
npx thryx sell 0x1234...abcd all --key $KEY
```

## Installation

No installation required -- use `npx`:

```bash
npx thryx launch "Token Name" SYMBOL --key 0xYOUR_PRIVATE_KEY
```

Or install globally:

```bash
npm install -g thryx
thryx launch "Token Name" SYMBOL --key 0xYOUR_PRIVATE_KEY
```

## Commands

### `thryx launch "Name" SYMBOL`

Deploy a new token on ThryxProtocol. **Gasless by default** -- your wallet signs an EIP-712 message off-chain and the relay at `https://thryx-relay.thryx.workers.dev` submits the transaction and pays gas. Zero ETH required.

Use `--direct` to submit the transaction yourself (costs ~$0.01 gas on Base).

- **Supply**: 1,000,000,000 tokens
- **Distribution**: 80% on bonding curve, 15% LP reserve, 5% creator vested (90 days linear)
- **Cost**: FREE (gasless) or ~$0.01 gas (direct)
- **Fee**: 0.5% per trade (30% protocol / 70% creator)

```bash
# Gasless (default) -- relay pays gas, you sign off-chain
npx thryx launch "Doge Killer" DOGEK --key $KEY

# Direct -- you pay gas (~$0.01 on Base)
npx thryx launch "Doge Killer" DOGEK --direct --key $KEY
```

### `thryx info <token_address>`

Query token details and curve state. No private key needed.

```bash
npx thryx info 0x1234...abcd
```

Returns: name, symbol, spot price, THRYX raised, graduation progress, fees earned.

### `thryx buy <token> <amount> [--with eth|thryx]`

Buy tokens on the bonding curve. Default: pay with ETH (simple interface -- protocol handles THRYX routing internally via V4 Doppler pool, generating real THRYX volume).

```bash
# Buy with 0.01 ETH (simple, recommended)
npx thryx buy 0x1234... 0.01 --with eth --key $KEY

# Buy with 500 THRYX
npx thryx buy 0x1234... 500 --with thryx --key $KEY
```

### `thryx sell <token> [amount|all]`

Sell tokens for ETH. Protocol handles THRYX routing internally -- you receive ETH directly. Falls back to THRYX output for legacy tokens.

```bash
# Sell all holdings for ETH
npx thryx sell 0x1234... all --key $KEY

# Sell specific amount
npx thryx sell 0x1234... 1000000 --key $KEY
```

## Options

| Flag | Description |
|------|-------------|
| `--key <0x...>` | Private key (or set `PRIVATE_KEY` env var) |
| `--with <eth\|thryx>` | Payment asset for buys (default: `eth`) |
| `--direct` | Launch via direct on-chain tx instead of gasless relay |
| `--json` | JSON output to stdout (human text goes to stderr) |
| `--help` | Show help |

## Environment Variables

```bash
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

When set, you can omit the `--key` flag from all commands.

## JSON Output (for AI Agents)

Every command supports `--json` for machine-readable output:

```bash
npx thryx launch "AI Token" AITK --json --key $KEY
```

```json
{
  "success": true,
  "gasless": true,
  "name": "AI Token",
  "symbol": "AITK",
  "token": "0xNewTokenAddress...",
  "deployer": "0xYourWallet...",
  "txHash": "0x...",
  "spotPrice": "0.000000001",
  "explorer": "https://basescan.org/address/0x..."
}
```

Exit codes: `0` = success, `1` = error. Errors include a `code` field in JSON mode.

## Built for AI Agents

THRYX is the first launchpad designed for autonomous operators:

- **Structured JSON output** -- pipe directly into your agent's decision engine
- **No interactive prompts** -- every parameter is a flag or env var
- **Deterministic exit codes** -- `0` success, `1` failure
- **Minimal dependencies** -- just `ethers` v6
- **Zero cost** -- gasless by default (FREE), or ~$0.01 gas with `--direct`

```bash
# AI agent pipeline example (gasless -- no ETH needed)
TOKEN=$(npx thryx launch "Agent Token" AGTK --json --key $KEY | jq -r '.token')
npx thryx info $TOKEN --json | jq '.progress'
```

## Protocol Details

- **ThryxProtocol v2.4 Diamond** (active): `0x2F77b40c124645d25782CfBdfB1f54C1d76f2cCe`
- **ThryxProtocol v2.3** (legacy): `0x4f25b9ecC67dC597f35abaE6Fa495457EC82284B`
- **ThryxProtocol v2.2** (legacy): `0xcDC734c1AFC2822E0d7E332DC914c0a7311633bF`
- **THRYX Token**: `0xc07E889e1816De2708BF718683e52150C20F3BA3`
- **Network**: Base (Chain ID 8453)
- **Relay**: https://thryx-relay.thryx.workers.dev
- **Bonding Curve**: Virtual x*y=k with THRYX as quote token
- **Graduation**: Dynamic ETH-denominated threshold, migrates to Uniswap V4 AMM with real liquidity
- **Gasless Launches**: metaLaunch() -- sign off-chain, relay pays gas
- **Paymaster**: Sponsors gas for new users

## License

MIT
