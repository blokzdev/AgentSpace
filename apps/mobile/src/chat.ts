// Small presentation helpers for the chat screens.
import type { Identity, Timestamp } from 'spacetimedb';

export const shortId = (id: Identity): string => `${id.toHexString().slice(0, 10)}…`;

export const fmtTime = (ts: Timestamp): string =>
  new Date(Number(ts.microsSinceUnixEpoch / 1000n)).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

// AgentSpace dark palette (shared by the screens).
export const colors = {
  bg: '#0b0f14',
  panel: '#121821',
  border: '#1c2530',
  text: '#e6edf3',
  dim: '#8b98a5',
  faint: '#5b6773',
  accent: '#4f9cf9',
  mine: '#1d3a5f',
} as const;
