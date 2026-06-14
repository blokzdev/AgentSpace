// Presentation helpers + the small design system for the chat screens.
import type { Identity, Timestamp } from 'spacetimedb';

export const shortId = (id: Identity): string => `${id.toHexString().slice(0, 10)}…`;

export const fmtTime = (ts: Timestamp): string =>
  new Date(Number(ts.microsSinceUnixEpoch / 1000n)).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

/** Compact relative time for inbox rows: "now", "5m", "3h", "Yesterday", "Apr 3". */
export const relativeTime = (ts: Timestamp): string => {
  const then = Number(ts.microsSinceUnixEpoch / 1000n);
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d`;
  return new Date(then).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/** Up to two uppercase initials from a name (falls back to "?"). */
export const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// AgentSpace dark palette.
export const colors = {
  bg: '#0b0f14',
  panel: '#121821',
  panel2: '#1a212c',
  border: '#1c2530',
  text: '#e6edf3',
  dim: '#8b98a5',
  faint: '#5b6773',
  accent: '#4f9cf9',
  mine: '#1d3a5f',
  online: '#3fb950',
  danger: '#f85149',
  onAccent: '#06101d',
} as const;

// Deterministic avatar colors (indexed by an identity-hex hash).
const AVATAR_COLORS = ['#4f9cf9', '#3fb950', '#db61a2', '#e3b341', '#a371f7', '#f0883e', '#56d4dd', '#f85149'] as const;
export const avatarColor = (key: string): string => {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

/** Case-insensitive directory match over a display name + identity hex. */
export const matchesQuery = (displayName: string | undefined, hex: string, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return (displayName ?? '').toLowerCase().includes(q) || hex.toLowerCase().includes(q);
};

// Spacing / radius / type tokens.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const type = {
  h1: { fontSize: 22, fontWeight: '700' as const },
  h2: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15 },
  meta: { fontSize: 12 },
};
