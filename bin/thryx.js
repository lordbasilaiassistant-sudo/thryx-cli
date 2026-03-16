#!/usr/bin/env node

import { launch, gaslessLaunch, getInfo, buy, sell, setReferrer, claimReferralFees, getProtocolStats, PROTOCOL_ADDRESS, THRYX_ADDRESS, RELAY_URL } from '../lib/protocol.js';

// ── ANSI Colors (no dependencies) ───────────────────────────────────
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
};

// ── CLI Parsing ─────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && i + 1 < args.length) {
      flags.key = args[++i];
    } else if (args[i] === '--with' && i + 1 < args.length) {
      flags.with = args[++i];
    } else if (args[i] === '--json') {
      flags.json = true;
    } else if (args[i] === '--direct') {
      flags.direct = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      flags.help = true;
    } else if (args[i].startsWith('--')) {
      // Unknown flag — ignore
    } else {
      positional.push(args[i]);
    }
  }

  return { flags, positional, command: positional[0] };
}

function getPrivateKey(flags) {
  const key = flags.key || process.env.PRIVATE_KEY || process.env.EVM_PRIVATE_KEY;
  if (!key) {
    error('No private key provided.');
    console.error(`  Use ${c.cyan}--key 0x...${c.reset} or set ${c.cyan}PRIVATE_KEY${c.reset} env var.`);
    process.exit(1);
  }
  return key;
}

// ── Output Helpers ──────────────────────────────────────────────────

function banner() {
  console.error('');
  console.error(`${c.bold}${c.magenta}  THRYX${c.reset} ${c.dim}— The AI Agent Launchpad on Base${c.reset}`);
  console.error('');
}

function success(msg) {
  console.error(`${c.green}  [OK]${c.reset} ${msg}`);
}

function info(msg) {
  console.error(`${c.cyan}  [i]${c.reset} ${msg}`);
}

function error(msg) {
  console.error(`${c.red}  [!]${c.reset} ${msg}`);
}

function field(label, value) {
  console.error(`  ${c.dim}${label}:${c.reset} ${value}`);
}

function divider() {
  console.error(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
}

// ── Commands ────────────────────────────────────────────────────────

async function cmdLaunch(positional, flags) {
  const name = positional[1];
  const symbol = positional[2];

  if (!name || !symbol) {
    error('Usage: thryx launch "Token Name" SYMBOL [--key 0x...] [--direct]');
    console.error('');
    console.error(`  ${c.dim}Example:${c.reset} npx thryx launch "My Token" MYTK --key $PRIVATE_KEY`);
    console.error(`  ${c.dim}Direct:${c.reset} npx thryx launch "My Token" MYTK --direct --key $PRIVATE_KEY`);
    process.exit(1);
  }

  const privateKey = getPrivateKey(flags);
  const isDirect = !!flags.direct;

  banner();
  if (isDirect) {
    info(`Launching "${c.bold}${name}${c.reset}" (${c.yellow}$${symbol}${c.reset}) on ThryxProtocol ${c.dim}(direct tx)${c.reset}...`);
    info('Cost: gas only (~$0.01 on Base)');
  } else {
    info(`Launching "${c.bold}${name}${c.reset}" (${c.yellow}$${symbol}${c.reset}) on ThryxProtocol ${c.green}(gasless via relay)${c.reset}...`);
    info('Cost: FREE -- relay pays gas. Your wallet signs off-chain only.');
  }
  info('Supply: 1,000,000,000 tokens (80% curve, 15% LP reserve, 5% creator vested)');
  console.error('');

  try {
    const result = isDirect
      ? await launch(name, symbol, privateKey)
      : await gaslessLaunch(name, symbol, privateKey);

    divider();
    success(result.gasless ? 'Token launched (gasless)!' : 'Token launched!');
    console.error('');
    field('Token', `${c.bold}${c.green}${result.token || 'check tx'}${c.reset}`);
    field('Name', result.name);
    field('Symbol', `$${result.symbol}`);
    field('Deployer', result.deployer);
    if (result.gasless) {
      field('Mode', `${c.green}Gasless${c.reset} (relay paid gas)`);
    }
    field('Tx', result.txHash || 'pending');
    if (result.blockNumber) {
      field('Block', result.blockNumber);
    }
    if (result.spotPrice) {
      field('Spot Price', `${result.spotPrice} THRYX/token`);
    }
    if (result.explorer) {
      field('Explorer', result.explorer);
    }
    console.error('');
    if (result.token) {
      info(`Share your token: ${c.cyan}npx thryx info ${result.token}${c.reset}`);
    }
    divider();
    console.error('');

    if (flags.json) {
      console.log(JSON.stringify(result));
    }
  } catch (err) {
    error(`Launch failed: ${err.message}`);
    if (flags.json) {
      console.log(JSON.stringify({ success: false, error: err.message, code: 'LAUNCH_FAILED' }));
    }
    process.exit(1);
  }
}

async function cmdInfo(positional, flags) {
  const tokenAddress = positional[1];

  if (!tokenAddress || !tokenAddress.startsWith('0x')) {
    error('Usage: thryx info <token_address>');
    console.error('');
    console.error(`  ${c.dim}Example:${c.reset} npx thryx info 0x1234...abcd`);
    process.exit(1);
  }

  banner();
  info(`Fetching info for ${c.cyan}${tokenAddress}${c.reset}...`);
  console.error('');

  try {
    const result = await getInfo(tokenAddress);

    divider();
    field('Name', `${c.bold}${result.name}${c.reset}`);
    field('Symbol', `$${result.symbol}`);
    field('Token', result.token);
    field('Total Supply', result.totalSupply);
    field('Explorer', result.explorer);

    if (result.protocol) {
      console.error('');
      field('Protocol', `${c.magenta}${result.protocol}${c.reset}`);
      field('Deployer', result.deployer);
      field('Spot Price', result.spotPrice);
      field('Raised', result.raised);
      field('Threshold', result.threshold);
      field('Progress', result.progress);
      field('Tokens Sold', result.tokensSold);
      field('Available', result.tokensAvailable);
      field('Graduated', result.graduated ? `${c.green}Yes` : `${c.yellow}No${c.reset}`);
      if (result.aeroPool) {
        field('Aero Pool', result.aeroPool);
      }
      field('Creator Fees', result.creatorFees);
      field('Protocol Fees', result.protocolFees);
    } else {
      console.error('');
      info(result.note);
    }

    divider();
    console.error('');

    if (flags.json) {
      console.log(JSON.stringify(result));
    }
  } catch (err) {
    error(`Info failed: ${err.message}`);
    if (flags.json) {
      console.log(JSON.stringify({ success: false, error: err.message, code: 'INFO_FAILED' }));
    }
    process.exit(1);
  }
}

async function cmdBuy(positional, flags) {
  const tokenAddress = positional[1];
  const amount = positional[2];

  if (!tokenAddress || !amount) {
    error('Usage: thryx buy <token> <amount> [--with eth|thryx] [--key 0x...]');
    console.error('');
    console.error(`  ${c.dim}Examples:${c.reset}`);
    console.error(`    npx thryx buy 0x1234... 0.01 --with eth`);
    console.error(`    npx thryx buy 0x1234... 100 --with thryx`);
    process.exit(1);
  }

  const privateKey = getPrivateKey(flags);
  const withAsset = flags.with || 'eth';

  banner();
  info(`Buying ${c.cyan}${tokenAddress.slice(0, 10)}...${c.reset} with ${c.yellow}${amount} ${withAsset.toUpperCase()}${c.reset}...`);
  console.error('');

  try {
    const result = await buy(tokenAddress, amount, withAsset, privateKey);

    divider();
    success('Buy executed!');
    console.error('');
    field('Token', result.token);
    field('Spent', `${result.amountIn} ${result.asset}`);
    if (result.amountOut) {
      field('Received', `${result.amountOut} tokens`);
    }
    field('Tx', result.txHash);
    divider();
    console.error('');

    if (flags.json) {
      console.log(JSON.stringify(result));
    }
  } catch (err) {
    error(`Buy failed: ${err.message}`);
    if (flags.json) {
      console.log(JSON.stringify({ success: false, error: err.message, code: 'BUY_FAILED' }));
    }
    process.exit(1);
  }
}

async function cmdSell(positional, flags) {
  const tokenAddress = positional[1];
  const amount = positional[2] || 'all';

  if (!tokenAddress) {
    error('Usage: thryx sell <token> [amount|all] [--key 0x...]');
    console.error('');
    console.error(`  ${c.dim}Examples:${c.reset}`);
    console.error(`    npx thryx sell 0x1234... all`);
    console.error(`    npx thryx sell 0x1234... 1000000`);
    process.exit(1);
  }

  const privateKey = getPrivateKey(flags);

  banner();
  info(`Selling ${c.yellow}${amount}${c.reset} of ${c.cyan}${tokenAddress.slice(0, 10)}...${c.reset} for ETH...`);
  console.error('');

  try {
    const result = await sell(tokenAddress, amount, privateKey);

    divider();
    success('Sell executed!');
    console.error('');
    field('Token', result.token);
    field('Sold', `${result.amountIn} tokens`);
    if (result.amountOut) {
      field('Received', result.amountOut);
    }
    field('Tx', result.txHash);
    divider();
    console.error('');

    if (flags.json) {
      console.log(JSON.stringify(result));
    }
  } catch (err) {
    error(`Sell failed: ${err.message}`);
    if (flags.json) {
      console.log(JSON.stringify({ success: false, error: err.message, code: 'SELL_FAILED' }));
    }
    process.exit(1);
  }
}

async function cmdSetReferrer(positional, flags) {
  const tokenAddress = positional[1];
  const referrerAddress = positional[2];

  if (!tokenAddress || !referrerAddress || !tokenAddress.startsWith('0x') || !referrerAddress.startsWith('0x')) {
    error('Usage: thryx set-referrer <token_address> <referrer_address> [--key 0x...]');
    console.error('');
    console.error(`  ${c.dim}Example:${c.reset} npx thryx set-referrer 0xToken... 0xReferrer... --key $KEY`);
    process.exit(1);
  }

  const privateKey = getPrivateKey(flags);

  banner();
  info(`Setting referrer ${c.cyan}${referrerAddress.slice(0, 10)}...${c.reset} for token ${c.cyan}${tokenAddress.slice(0, 10)}...${c.reset}...`);
  console.error('');

  try {
    const result = await setReferrer(tokenAddress, referrerAddress, privateKey);

    divider();
    success('Referrer set!');
    console.error('');
    field('Token', result.token);
    field('Referrer', result.referrer);
    field('Tx', result.txHash);
    divider();
    console.error('');

    if (flags.json) {
      console.log(JSON.stringify(result));
    }
  } catch (err) {
    error(`Set referrer failed: ${err.message}`);
    if (flags.json) {
      console.log(JSON.stringify({ success: false, error: err.message, code: 'SET_REFERRER_FAILED' }));
    }
    process.exit(1);
  }
}

async function cmdClaimReferral(positional, flags) {
  const privateKey = getPrivateKey(flags);

  banner();
  info('Claiming referral fees...');
  console.error('');

  try {
    const result = await claimReferralFees(privateKey);

    divider();
    success('Referral fees claimed!');
    console.error('');
    field('Wallet', result.wallet);
    field('Claimed', result.claimedAmount);
    field('Tx', result.txHash);
    divider();
    console.error('');

    if (flags.json) {
      console.log(JSON.stringify(result));
    }
  } catch (err) {
    error(`Claim referral failed: ${err.message}`);
    if (flags.json) {
      console.log(JSON.stringify({ success: false, error: err.message, code: 'CLAIM_REFERRAL_FAILED' }));
    }
    process.exit(1);
  }
}

async function cmdStats(positional, flags) {
  banner();
  info('Fetching ThryxProtocol v2.4 Diamond stats...');
  console.error('');

  try {
    const result = await getProtocolStats();

    divider();
    field('Protocol', `${c.bold}${c.magenta}ThryxProtocol v2.4 Diamond${c.reset}`);
    field('Contract', result.protocol);
    console.error('');
    field('Tokens Launched', result.launched);
    field('Tokens Graduated', result.graduated);
    field('Lifetime Fees', result.lifetimeFees);
    field('THRYX Reserves', result.thryxReserves);
    field('ETH Reserves', result.ethReserves);
    field('ETH Rate', result.ethRate);
    field('Total THRYX Burned', result.totalThryxBurned);
    if (result.graduationTreasuryCollected) {
      field('Graduation Treasury', result.graduationTreasuryCollected);
    }
    divider();
    console.error('');

    if (flags.json) {
      console.log(JSON.stringify(result));
    }
  } catch (err) {
    error(`Stats failed: ${err.message}`);
    if (flags.json) {
      console.log(JSON.stringify({ success: false, error: err.message, code: 'STATS_FAILED' }));
    }
    process.exit(1);
  }
}

function showHelp() {
  banner();
  console.error(`${c.bold}  Usage:${c.reset} thryx <command> [options]`);
  console.error('');
  console.error(`${c.bold}  Commands:${c.reset}`);
  console.error(`    ${c.green}launch${c.reset}          "Name" SYMBOL       Launch a new token (gasless by default)`);
  console.error(`    ${c.green}info${c.reset}            <token_address>     Query token and curve info`);
  console.error(`    ${c.green}buy${c.reset}             <token> <amount>    Buy tokens with ETH (or THRYX)`);
  console.error(`    ${c.green}sell${c.reset}            <token> [amount]    Sell tokens for ETH`);
  console.error(`    ${c.green}set-referrer${c.reset}    <token> <referrer>  Set referrer for a token (v2.4)`);
  console.error(`    ${c.green}claim-referral${c.reset}                      Claim accumulated referral fees (v2.4)`);
  console.error(`    ${c.green}stats${c.reset}                               Protocol stats incl. burns & graduation (v2.4)`);
  console.error('');
  console.error(`${c.bold}  Options:${c.reset}`);
  console.error(`    ${c.cyan}--key${c.reset} <0x...>             Private key (or set PRIVATE_KEY env)`);
  console.error(`    ${c.cyan}--with${c.reset} <eth|thryx>        Payment asset for buys (default: eth)`);
  console.error(`    ${c.cyan}--direct${c.reset}                  Launch via direct tx instead of gasless relay`);
  console.error(`    ${c.cyan}--json${c.reset}                    Output JSON to stdout (for AI agents)`);
  console.error(`    ${c.cyan}--help${c.reset}                    Show this help`);
  console.error('');
  console.error(`${c.bold}  Examples:${c.reset}`);
  console.error(`    ${c.dim}# Launch a token (gasless -- FREE, relay pays gas)${c.reset}`);
  console.error(`    npx thryx launch "My Token" MYTK --key $PRIVATE_KEY`);
  console.error('');
  console.error(`    ${c.dim}# Launch a token (direct tx -- you pay gas)${c.reset}`);
  console.error(`    npx thryx launch "My Token" MYTK --direct --key $PRIVATE_KEY`);
  console.error('');
  console.error(`    ${c.dim}# Check token info${c.reset}`);
  console.error(`    npx thryx info 0x1234...abcd`);
  console.error('');
  console.error(`    ${c.dim}# Buy with 0.001 ETH (simple interface)${c.reset}`);
  console.error(`    npx thryx buy 0x1234...abcd 0.001 --with eth`);
  console.error('');
  console.error(`    ${c.dim}# Sell all tokens for ETH${c.reset}`);
  console.error(`    npx thryx sell 0x1234...abcd all`);
  console.error('');
  console.error(`    ${c.dim}# Set a referrer for your token${c.reset}`);
  console.error(`    npx thryx set-referrer 0xToken... 0xReferrer... --key $KEY`);
  console.error('');
  console.error(`    ${c.dim}# Claim referral fees${c.reset}`);
  console.error(`    npx thryx claim-referral --key $KEY`);
  console.error('');
  console.error(`    ${c.dim}# View protocol stats${c.reset}`);
  console.error(`    npx thryx stats`);
  console.error('');
  console.error(`    ${c.dim}# JSON output (for AI agents / scripts)${c.reset}`);
  console.error(`    npx thryx launch "AI Token" AITK --json --key $KEY`);
  console.error('');
  console.error(`${c.bold}  Features:${c.reset}`);
  console.error(`    ${c.dim}Gasless launches via metaLaunch() — sign off-chain, relay pays gas${c.reset}`);
  console.error(`    ${c.dim}Simple buy/sell — send ETH to buy, sell for ETH. Protocol handles THRYX routing.${c.reset}`);
  console.error(`    ${c.dim}Real THRYX volume on every trade via V4 Doppler pool${c.reset}`);
  console.error(`    ${c.dim}Dynamic graduation threshold (ETH-denominated)${c.reset}`);
  console.error(`    ${c.dim}Paymaster sponsors gas for new users${c.reset}`);
  console.error(`    ${c.dim}Relay: https://thryx-relay.thryx.workers.dev${c.reset}`);
  console.error('');
  console.error(`${c.bold}  Protocol:${c.reset} ${c.dim}${PROTOCOL_ADDRESS} (v2.4 Diamond)${c.reset}`);
  console.error(`${c.bold}  THRYX:${c.reset}    ${c.dim}${THRYX_ADDRESS}${c.reset}`);
  console.error(`${c.bold}  Network:${c.reset}  ${c.dim}Base (Chain ID 8453)${c.reset}`);
  console.error(`${c.bold}  Relay:${c.reset}    ${c.dim}https://thryx-relay.thryx.workers.dev${c.reset}`);
  console.error(`${c.bold}  Docs:${c.reset}     ${c.dim}https://thryx.xyz${c.reset}`);
  console.error('');
}

// ── Main ────────────────────────────────────────────────────────────

const { flags, positional, command } = parseArgs(process.argv);

if (flags.help || !command) {
  showHelp();
  process.exit(command ? 0 : 1);
}

switch (command) {
  case 'launch':
    await cmdLaunch(positional, flags);
    break;
  case 'info':
    await cmdInfo(positional, flags);
    break;
  case 'buy':
    await cmdBuy(positional, flags);
    break;
  case 'sell':
    await cmdSell(positional, flags);
    break;
  case 'set-referrer':
    await cmdSetReferrer(positional, flags);
    break;
  case 'claim-referral':
    await cmdClaimReferral(positional, flags);
    break;
  case 'stats':
    await cmdStats(positional, flags);
    break;
  default:
    error(`Unknown command: "${command}"`);
    console.error(`  Run ${c.cyan}thryx --help${c.reset} for usage.`);
    process.exit(1);
}
