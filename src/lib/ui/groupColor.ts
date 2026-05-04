// Stable color from group id (rotative palette of 10 tones).
const PALETTE = [
  "var(--g-1)",
  "var(--g-2)",
  "var(--g-3)",
  "var(--g-4)",
  "var(--g-5)",
  "var(--g-6)",
  "var(--g-7)",
  "var(--g-8)",
  "var(--g-9)",
  "var(--g-10)",
];

function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

export function getGroupColor(id: string): string {
  return PALETTE[hash(id) % PALETTE.length];
}

export function getProfileAvatarColor(id: string): string {
  return PALETTE[hash(id) % PALETTE.length];
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
