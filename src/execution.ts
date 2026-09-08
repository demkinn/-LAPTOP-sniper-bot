import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  getAddress,
  erc20Abi,
  type Address,
  type Hash
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from './config.js';
import type { Quote } from './zerox.js';
import { quoteGasGwei, quoteImpactBps } from './zerox.js';

export const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) });

function account() {
  if (!config.privateKey) throw new Error('PRIVATE_KEY is required for wallet execution.');
  return privateKeyToAccount(config.privateKey as `0x${string}`);
}

export function getAccountAddress(): Address {
  return account().address;
}

const wallet = () => createWalletClient({ account: account(), chain: base, transport: http(config.rpcUrl) });

export async function assertNativeBalance(requiredEth: number): Promise<void> {
  const balance = await publicClient.getBalance({ address: getAccountAddress() });
  const required = parseEther(requiredEth.toString());
  if (balance < required) throw new Error(`Insufficient ETH balance: have ${formatEther(balance)}, need ${requiredEth}.`);
}

async function sendQuote(q: Quote): Promise<Hash> {
  const gasGwei = quoteGasGwei(q);
  const impact = quoteImpactBps(q);
  if (gasGwei > config.maxGasGwei) throw new Error(`Gas price ${gasGwei.toFixed(3)} gwei exceeds ${config.maxGasGwei}.`);
  if (impact > config.maxPriceImpactBps) throw new Error(`Price impact ${impact.toFixed(0)} bps exceeds ${config.maxPriceImpactBps}.`);

  const tx: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
    gas?: bigint;
    gasPrice?: bigint;
  } = {
    to: getAddress(q.transaction.to),
    data: q.transaction.data as `0x${string}`
  };
  if (q.transaction.value) tx.value = BigInt(q.transaction.value);
  if (q.transaction.gas) tx.gas = BigInt(q.transaction.gas);
  if (q.transaction.gasPrice) tx.gasPrice = BigInt(q.transaction.gasPrice);
  return wallet().sendTransaction(tx);
}

export async function executeNativeBuy(q: Quote): Promise<Hash> {
  return sendQuote(q);
}

export async function ensureAllowance(token: Address, spender: Address, amount: bigint): Promise<Hash | null> {
  if (getAddress(token) === getAddress('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')) return null;
  const owner = getAccountAddress();
  const allowance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] });
  if (allowance >= amount) return null;
  return wallet().writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
}

export async function executeTokenSell(q: Quote): Promise<Hash> {
  const token = getAddress(q.sellToken);
  if (getAddress(q.transaction.to) === token) throw new Error('Invalid swap transaction target equals sell token.');
  const spender = getAddress(q.allowanceTarget || q.issues?.allowance?.spender || q.transaction.to);
  if (getAddress(spender) === getAddress(q.transaction.to) && q.issues?.allowance?.spender) {
    // Allowed: 0x may use the same AllowanceHolder as transaction target; never use Settler guessed/hardcoded.
  }
  const approval = await ensureAllowance(token, spender, BigInt(q.sellAmount));
  if (approval) await publicClient.waitForTransactionReceipt({ hash: approval });
  return sendQuote(q);
}
