import { ethers } from 'ethers';

// ── Constants ────────────────────────────────────────────────────────
export const PROTOCOL_ADDRESS = '0x2F77b40c124645d25782CfBdfB1f54C1d76f2cCe'; // ThryxProtocol v2.4 Diamond (active)
// v2.3 legacy: '0x4f25b9ecC67dC597f35abaE6Fa495457EC82284B'
// v2.2 legacy: '0xcDC734c1AFC2822E0d7E332DC914c0a7311633bF'
// v2.1 legacy: '0xDfCC0341484C7890b3C96c3013EfDb4D2FD5a45a'
export const THRYX_ADDRESS = '0xc07E889e1816De2708BF718683e52150C20F3BA3';
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
export const RPC_URL = 'https://mainnet.base.org';
export const CHAIN_ID = 8453;
export const ADDRESS_ZERO = ethers.ZeroAddress;
export const RELAY_URL = 'https://thryx-relay.thryx.workers.dev';

// ── Minimal ABIs ─────────────────────────────────────────────────────
const PROTOCOL_ABI = [
  'function launch(string name, string symbol) external returns (address)',
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) external payable returns (uint256)',
  'function estimateSwap(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256)',
  'function getCurveInfo(address token) external view returns (address deployer, uint256 spotPrice, uint256 raised, uint256 threshold, uint256 progressBps, uint256 tokensSold, uint256 tokensAvailable, bool graduated, address aeroPool, uint256 creatorFees, uint256 protocolFees)',
  'function getProtocolStats() external view returns (uint256 launched, uint256 graduated, uint256 lifetimeFees, uint256 thryxReserves, uint256 ethReserves, uint256 ethRate, uint256 thryxBurned, uint256 gradTreasuryCollected)',
  // v2.4 Diamond simple buy/sell
  'function buy(address token, uint256 minOut) external payable returns (uint256 amountOut)',
  'function sell(address token, uint256 amount, uint256 minOut) external returns (uint256 ethOut)',
  // Gasless metaLaunch support
  'function metaNonce(address user) external view returns (uint256)',
  // v2.2 additions
  'function setReferrer(address referrer) external',
  'function claimReferralFees() external',
  'function getTokenEthReserve(address token) external view returns (uint256)',
  'function referralFees(address account) view returns (uint256)',
  'function totalThryxBurned() view returns (uint256)',
  'event Launched(address indexed token, address indexed deployer, string name, string symbol)',
  'event Swapped(address indexed token, address indexed trader, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

// ── Helpers ──────────────────────────────────────────────────────────

function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
}

function getWallet(privateKey, provider) {
  return new ethers.Wallet(privateKey, provider || getProvider());
}

function getProtocol(signerOrProvider) {
  return new ethers.Contract(PROTOCOL_ADDRESS, PROTOCOL_ABI, signerOrProvider);
}

function getERC20(address, signerOrProvider) {
  return new ethers.Contract(address, ERC20_ABI, signerOrProvider);
}

/**
 * Parse an amount string to wei. Accepts:
 * - "0.1" -> parseEther("0.1")
 * - "100000000000000000" (raw wei as string of digits)
 * - "all" -> returns null (caller must handle)
 */
function parseAmount(amount) {
  if (amount === 'all') return null;
  // If it contains a decimal point or is a small number, treat as ether
  if (amount.includes('.') || (amount.length < 15 && !amount.startsWith('0x'))) {
    return ethers.parseEther(amount);
  }
  // Otherwise treat as raw wei
  return BigInt(amount);
}

/**
 * Apply slippage to an expected output amount.
 * Default: 10% slippage tolerance.
 */
function applySlippage(amount, slippagePct = 10) {
  return amount * BigInt(100 - slippagePct) / 100n;
}

// ── Launch ───────────────────────────────────────────────────────────

export async function launch(name, symbol, privateKey) {
  const provider = getProvider();
  const wallet = getWallet(privateKey, provider);
  const protocol = getProtocol(wallet);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  if (balance === 0n) {
    throw new Error(`Wallet ${wallet.address} has 0 ETH. You need a small amount for gas (~$0.01 on Base).`);
  }

  const tx = await protocol.launch(name, symbol);
  const receipt = await tx.wait();

  // Parse Launched event to get token address
  const launchedTopic = ethers.id('Launched(address,address,string,string)');
  const launchLog = receipt.logs.find(l => l.topics[0] === launchedTopic);

  const result = {
    success: true,
    name,
    symbol,
    deployer: wallet.address,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };

  if (launchLog) {
    result.token = ethers.getAddress('0x' + launchLog.topics[1].slice(26));
  } else {
    // Fallback: find token from Transfer (mint from 0x0)
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const mintLog = receipt.logs.find(
      l => l.topics[0] === transferTopic && l.topics[1] === ethers.zeroPadValue('0x00', 32)
    );
    if (mintLog) {
      result.token = ethers.getAddress(mintLog.address);
    }
  }

  result.explorer = result.token
    ? `https://basescan.org/address/${result.token}`
    : `https://basescan.org/tx/${receipt.hash}`;

  // Fetch curve info
  if (result.token) {
    try {
      const readProtocol = getProtocol(provider);
      const info = await readProtocol.getCurveInfo(result.token);
      result.spotPrice = ethers.formatEther(info.spotPrice);
      result.graduated = info.graduated;
    } catch {
      // Curve info may not be available immediately
    }
  }

  return result;
}

// ── Gasless Launch (metaLaunch via Relay) ────────────────────────────

export async function gaslessLaunch(name, symbol, privateKey) {
  const provider = getProvider();
  const wallet = getWallet(privateKey, provider);
  const protocol = getProtocol(provider);

  // 1. Get the user's metaNonce from the contract
  const nonce = await protocol.metaNonce(wallet.address);

  // 2. Set deadline to 10 minutes from now
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  // 3. Sign EIP-712 typed data
  const domain = {
    name: 'ThryxProtocol',
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: PROTOCOL_ADDRESS,
  };

  const types = {
    MetaLaunch: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'user', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const value = {
    name,
    symbol,
    user: wallet.address,
    nonce,
    deadline,
  };

  const signature = await wallet.signTypedData(domain, types, value);
  const { v, r, s } = ethers.Signature.from(signature);

  // 4. POST to relay
  const body = {
    name,
    symbol,
    user: wallet.address,
    deadline: deadline.toString(),
    v,
    r,
    s,
  };

  const response = await fetch(`${RELAY_URL}/relay/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Relay returned ${response.status}: ${text || response.statusText}`);
  }

  const data = await response.json();

  if (!data.success && data.error) {
    throw new Error(`Relay error: ${data.error}`);
  }

  const result = {
    success: true,
    gasless: true,
    name,
    symbol,
    deployer: wallet.address,
    token: data.token || data.tokenAddress || null,
    txHash: data.txHash || data.transactionHash || null,
  };

  result.explorer = result.token
    ? `https://basescan.org/address/${result.token}`
    : result.txHash
      ? `https://basescan.org/tx/${result.txHash}`
      : null;

  // Fetch curve info if we got a token address
  if (result.token) {
    try {
      const readProtocol = getProtocol(provider);
      const info = await readProtocol.getCurveInfo(result.token);
      result.spotPrice = ethers.formatEther(info.spotPrice);
      result.graduated = info.graduated;
    } catch {
      // Curve info may not be available immediately after relay submission
    }
  }

  return result;
}

// ── Info ─────────────────────────────────────────────────────────────

export async function getInfo(tokenAddress) {
  const provider = getProvider();
  const protocol = getProtocol(provider);
  const token = getERC20(tokenAddress, provider);

  // Parallel reads
  const [curveInfo, tokenName, tokenSymbol, totalSupply] = await Promise.all([
    protocol.getCurveInfo(tokenAddress).catch(() => null),
    token.name().catch(() => 'Unknown'),
    token.symbol().catch(() => '???'),
    token.totalSupply().catch(() => 0n),
  ]);

  const result = {
    success: true,
    token: tokenAddress,
    name: tokenName,
    symbol: tokenSymbol,
    totalSupply: ethers.formatEther(totalSupply),
    explorer: `https://basescan.org/address/${tokenAddress}`,
  };

  if (curveInfo && curveInfo.deployer !== ADDRESS_ZERO) {
    result.protocol = 'ThryxProtocol v2.4 Diamond';
    result.deployer = curveInfo.deployer;
    result.spotPrice = ethers.formatEther(curveInfo.spotPrice) + ' THRYX/token';
    result.raised = ethers.formatEther(curveInfo.raised) + ' THRYX';
    result.threshold = ethers.formatEther(curveInfo.threshold) + ' THRYX';
    result.progress = (Number(curveInfo.progressBps) / 100).toFixed(2) + '%';
    result.tokensSold = ethers.formatEther(curveInfo.tokensSold);
    result.tokensAvailable = ethers.formatEther(curveInfo.tokensAvailable);
    result.graduated = curveInfo.graduated;
    if (curveInfo.aeroPool !== ADDRESS_ZERO) {
      result.aeroPool = curveInfo.aeroPool;
    }
    result.creatorFees = ethers.formatEther(curveInfo.creatorFees) + ' THRYX';
    result.protocolFees = ethers.formatEther(curveInfo.protocolFees) + ' THRYX';
  } else {
    result.protocol = null;
    result.note = 'Token not found on ThryxProtocol. May be external or on a different factory.';
  }

  return result;
}

// ── Buy ──────────────────────────────────────────────────────────────

export async function buy(tokenAddress, amount, withAsset, privateKey) {
  const provider = getProvider();
  const wallet = getWallet(privateKey, provider);
  const protocol = getProtocol(wallet);

  const asset = (withAsset || 'eth').toLowerCase();

  // Use the simple buy() function for ETH buys (v2.4 Diamond)
  if (asset === 'eth') {
    const amountIn = parseAmount(amount);
    if (amountIn === null) throw new Error('Cannot use "all" with ETH buys. Specify an amount.');

    // Estimate output for slippage via the swap estimator
    let minOut = 0n;
    try {
      const readProtocol = getProtocol(provider);
      const estimated = await readProtocol.estimateSwap(ADDRESS_ZERO, tokenAddress, amountIn);
      minOut = applySlippage(estimated, 10);
    } catch {
      // estimateSwap failed — proceed with minOut=0 (protocol enforces 10% floor)
    }

    const tx = await protocol.buy(tokenAddress, minOut, { value: amountIn });
    const receipt = await tx.wait();

    // Parse Swapped event for output amount
    const swappedTopic = ethers.id('Swapped(address,address,address,address,uint256,uint256)');
    const swapLog = receipt.logs.find(l => l.topics[0] === swappedTopic);

    const result = {
      success: true,
      action: 'buy',
      token: tokenAddress,
      amountIn: ethers.formatEther(amountIn),
      asset: 'ETH',
      txHash: receipt.hash,
    };

    if (swapLog) {
      const iface = new ethers.Interface(PROTOCOL_ABI);
      const decoded = iface.parseLog({ topics: swapLog.topics, data: swapLog.data });
      result.amountOut = ethers.formatEther(decoded.args.amountOut);
    }

    return result;
  }

  // THRYX buys use the swap() function
  if (asset === 'thryx') {
    let amountIn = parseAmount(amount);
    if (amountIn === null) {
      // "all" = entire THRYX balance
      const thryx = getERC20(THRYX_ADDRESS, wallet);
      amountIn = await thryx.balanceOf(wallet.address);
      if (amountIn === 0n) throw new Error('Wallet has 0 THRYX.');
    }
    // Approve THRYX (DERC20 requires approve(0) before approve(newAmount))
    const thryx = getERC20(THRYX_ADDRESS, wallet);
    const allowance = await thryx.allowance(wallet.address, PROTOCOL_ADDRESS);
    if (allowance < amountIn) {
      if (allowance > 0n) {
        const resetTx = await thryx.approve(PROTOCOL_ADDRESS, 0);
        await resetTx.wait();
      }
      const approveTx = await thryx.approve(PROTOCOL_ADDRESS, ethers.MaxUint256);
      await approveTx.wait();
    }

    // Estimate output for slippage
    let minOut = 0n;
    try {
      const readProtocol = getProtocol(provider);
      const estimated = await readProtocol.estimateSwap(THRYX_ADDRESS, tokenAddress, amountIn);
      minOut = applySlippage(estimated, 10);
    } catch {
      // estimateSwap failed — proceed with minOut=0 (protocol enforces 10% floor)
    }

    const tx = await protocol.swap(THRYX_ADDRESS, tokenAddress, amountIn, minOut);
    const receipt = await tx.wait();

    // Parse Swapped event
    const swappedTopic = ethers.id('Swapped(address,address,address,address,uint256,uint256)');
    const swapLog = receipt.logs.find(l => l.topics[0] === swappedTopic);

    const result = {
      success: true,
      action: 'buy',
      token: tokenAddress,
      amountIn: ethers.formatEther(amountIn),
      asset: 'THRYX',
      txHash: receipt.hash,
    };

    if (swapLog) {
      const iface = new ethers.Interface(PROTOCOL_ABI);
      const decoded = iface.parseLog({ topics: swapLog.topics, data: swapLog.data });
      result.amountOut = ethers.formatEther(decoded.args.amountOut);
    }

    return result;
  }

  throw new Error(`Unsupported asset "${withAsset}". Use "eth" or "thryx".`);
}

// ── Sell ─────────────────────────────────────────────────────────────

export async function sell(tokenAddress, amount, privateKey) {
  const provider = getProvider();
  const wallet = getWallet(privateKey, provider);
  const protocol = getProtocol(wallet);
  const token = getERC20(tokenAddress, wallet);

  // Determine amount
  let amountIn;
  const parsed = parseAmount(amount);
  if (parsed === null) {
    // "all"
    amountIn = await token.balanceOf(wallet.address);
    if (amountIn === 0n) throw new Error('Wallet holds 0 tokens.');
  } else {
    amountIn = parsed;
  }

  // Approve token (DERC20 requires approve(0) before approve(newAmount))
  const allowance = await token.allowance(wallet.address, PROTOCOL_ADDRESS);
  if (allowance < amountIn) {
    if (allowance > 0n) {
      const resetTx = await token.approve(PROTOCOL_ADDRESS, 0);
      await resetTx.wait();
    }
    const approveTx = await token.approve(PROTOCOL_ADDRESS, ethers.MaxUint256);
    await approveTx.wait();
  }

  // Try the v2.4 Diamond sell(token, amount, minOut) which returns ETH
  try {
    // Estimate output for slippage
    let minOut = 0n;
    try {
      const readProtocol = getProtocol(provider);
      const estimated = await readProtocol.estimateSwap(tokenAddress, ADDRESS_ZERO, amountIn);
      minOut = applySlippage(estimated, 10);
    } catch {
      // estimateSwap failed — proceed with minOut=0 (protocol enforces 10% floor)
    }

    const tx = await protocol.sell(tokenAddress, amountIn, minOut);
    const receipt = await tx.wait();

    // Parse Swapped event
    const swappedTopic = ethers.id('Swapped(address,address,address,address,uint256,uint256)');
    const swapLog = receipt.logs.find(l => l.topics[0] === swappedTopic);

    const result = {
      success: true,
      action: 'sell',
      token: tokenAddress,
      amountIn: ethers.formatEther(amountIn),
      txHash: receipt.hash,
    };

    if (swapLog) {
      const iface = new ethers.Interface(PROTOCOL_ABI);
      const decoded = iface.parseLog({ topics: swapLog.topics, data: swapLog.data });
      result.amountOut = ethers.formatEther(decoded.args.amountOut) + ' ETH';
    }

    return result;
  } catch (sellErr) {
    // Fallback to swap(token -> THRYX) for legacy tokens or if sell() not available
    const tokenOut = THRYX_ADDRESS;

    let minOut = 0n;
    try {
      const readProtocol = getProtocol(provider);
      const estimated = await readProtocol.estimateSwap(tokenAddress, tokenOut, amountIn);
      minOut = applySlippage(estimated, 10);
    } catch {
      // Proceed without slippage protection
    }

    const tx = await protocol.swap(tokenAddress, tokenOut, amountIn, minOut);
    const receipt = await tx.wait();

    // Parse Swapped event
    const swappedTopic = ethers.id('Swapped(address,address,address,address,uint256,uint256)');
    const swapLog = receipt.logs.find(l => l.topics[0] === swappedTopic);

    const result = {
      success: true,
      action: 'sell',
      token: tokenAddress,
      amountIn: ethers.formatEther(amountIn),
      txHash: receipt.hash,
    };

    if (swapLog) {
      const iface = new ethers.Interface(PROTOCOL_ABI);
      const decoded = iface.parseLog({ topics: swapLog.topics, data: swapLog.data });
      result.amountOut = ethers.formatEther(decoded.args.amountOut) + ' THRYX';
    }

    return result;
  }
}

// ── Set Referrer (v2.2) ─────────────────────────────────────────────

export async function setReferrer(tokenAddress, referrerAddress, privateKey) {
  const provider = getProvider();
  const wallet = getWallet(privateKey, provider);
  const protocol = getProtocol(wallet);

  const tx = await protocol.setReferrer(referrerAddress);
  const receipt = await tx.wait();

  return {
    success: true,
    action: 'set-referrer',
    token: tokenAddress,
    referrer: referrerAddress,
    txHash: receipt.hash,
  };
}

// ── Claim Referral Fees (v2.2) ──────────────────────────────────────

export async function claimReferralFees(privateKey) {
  const provider = getProvider();
  const wallet = getWallet(privateKey, provider);
  const protocol = getProtocol(wallet);

  // Check pending referral fees first
  const readProtocol = getProtocol(provider);
  const pending = await readProtocol.referralFees(wallet.address);
  if (pending === 0n) {
    throw new Error('No referral fees to claim.');
  }

  const tx = await protocol.claimReferralFees();
  const receipt = await tx.wait();

  return {
    success: true,
    action: 'claim-referral',
    claimedAmount: ethers.formatEther(pending) + ' THRYX',
    wallet: wallet.address,
    txHash: receipt.hash,
  };
}

// ── Protocol Stats (v2.2) ───────────────────────────────────────────

export async function getProtocolStats() {
  const provider = getProvider();
  const protocol = getProtocol(provider);

  // All stats now in single getProtocolStats() call (v2.4 Diamond — 8 fields)
  const baseStats = await protocol.getProtocolStats();

  return {
    success: true,
    protocol: PROTOCOL_ADDRESS,
    version: 'v2.4',
    launched: Number(baseStats.launched),
    graduated: Number(baseStats.graduated),
    lifetimeFees: ethers.formatEther(baseStats.lifetimeFees) + ' THRYX',
    thryxReserves: ethers.formatEther(baseStats.thryxReserves) + ' THRYX',
    ethReserves: ethers.formatEther(baseStats.ethReserves) + ' ETH',
    ethRate: ethers.formatEther(baseStats.ethRate),
    totalThryxBurned: ethers.formatEther(baseStats.thryxBurned) + ' THRYX',
    graduationTreasuryCollected: ethers.formatEther(baseStats.gradTreasuryCollected) + ' THRYX',
  };
}
