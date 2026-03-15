# thryx

**Launch tokens on Base for $0.01 gas.**

THRYX is the CLI for [ThryxProtocol](https://thryx.xyz) -- the AI Agent Launchpad on Base. Deploy tokens with virtual bonding curves, buy, sell, and query token info, all from the command line.

Zero cost per launch (gas only). 1 billion supply per token. Automatic bonding curve. Graduation to Aerodrome AMM at threshold.

## Quick Start

```bash
# Launch a token
npx thryx launch "My Token" MYTK --key $PRIVATE_KEY

# Check token info
npx thryx info 0x1234...abcd

# Buy tokens with ETH
npx thryx buy 0x1234...abcd 0.001 --with eth --key $PRIVATE_KEY

# Sell tokens for THRYX
npx thryx sell 0x1234...abcd all --key $PRIVATE_KEY
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

Deploy a new token on ThryxProtocol.

- **Supply**: 1,000,000,000 tokens
- **Distribution**: 80% on bonding curve, 15% LP reserve, 5% creator vested (7 days)
- **Cost**: Gas only (~$0.01 on Base)
- **Fee**: 1.5% per trade (60% protocol / 40% creator)

```bash
npx thryx launch "Doge Killer" DOGEK --key $PRIVATE_KEY
```

### `thryx info <token_address>`

Query token details and curve state. No private key needed.

```bash
npx thryx info 0x1234...abcd
```

Returns: name, symbol, spot price, THRYX raised, graduation progress, fees earned.

### `thryx buy <token> <amount> [--with eth|thryx]`

Buy tokens on the bonding curve.

```bash
# Buy with 0.01 ETH
npx thryx buy 0x1234... 0.01 --with eth --key $KEY

# Buy with 500 THRYX
npx thryx buy 0x1234... 500 --with thryx --key $KEY
```

### `thryx sell <token> [amount|all]`

Sell tokens back to the bonding curve for THRYX.

```bash
# Sell all holdings
npx thryx sell 0x1234... all --key $KEY

# Sell specific amount
npx thryx sell 0x1234... 1000000 --key $KEY
```

## Options

| Flag | Description |
|------|-------------|
| `--key <0x...>` | Private key (or set `THRYX_PRIVATE_KEY` env var) |
| `--with <eth\|thryx>` | Payment asset for buys (default: `eth`) |
| `--json` | JSON output to stdout (human text goes to stderr) |
| `--help` | Show help |

## Environment Variables

```bash
export THRYX_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
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
  "name": "AI Token",
  "symbol": "AITK",
  "token": "0xNewTokenAddress...",
  "deployer": "0xYourWallet...",
  "txHash": "0x...",
  "blockNumber": 12345678,
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
- **Zero cost** -- gas only (~$0.01 per launch on Base)

```bash
# AI agent pipeline example
TOKEN=$(npx thryx launch "Agent Token" AGTK --json --key $KEY | jq -r '.token')
npx thryx info $TOKEN --json | jq '.progress'
```

## Protocol Details

- **ThryxProtocol v2.2**: `0xcDC734c1AFC2822E0d7E332DC914c0a7311633bF`
- **THRYX Token**: `0xc07E889e1816De2708BF718683e52150C20F3BA3`
- **Network**: Base (Chain ID 8453)
- **Bonding Curve**: Virtual x*y=k with THRYX as quote token
- **Graduation**: Migrates to Aerodrome V2 AMM when 1000 THRYX raised

## License

MIT
