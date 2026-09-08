import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface PositionState {
  pairAddress: string;
  entryPriceUsd: number;
  entryAmountToken: string;
  entryEth: number;
  entryAt: number;
  peakPriceUsd: number;
  txHash?: string;
}

export interface BotState {
  day: string;
  realizedPnlEth: number;
  lastTradeAt: number;
  position: PositionState | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export async function loadState(path: string): Promise<BotState> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BotState>;
    if (parsed.day !== today()) return { day: today(), realizedPnlEth: 0, lastTradeAt: 0, position: null };
    return {
      day: parsed.day || today(),
      realizedPnlEth: Number(parsed.realizedPnlEth || 0),
      lastTradeAt: Number(parsed.lastTradeAt || 0),
      position: parsed.position ?? null
    };
  } catch {
    return { day: today(), realizedPnlEth: 0, lastTradeAt: 0, position: null };
  }
}

export async function saveState(path: string, state: BotState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await writeFile(path, await readFile(tmp));
}

export async function event(path: string, type: string, data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify({ ts: new Date().toISOString(), type, ...data }) + '\n', 'utf8');
}
