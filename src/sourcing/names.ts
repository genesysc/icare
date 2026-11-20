const SUFFIX = /\b(limited|ltd|llp|plc|lp|cic|inc)\b/g;

/** Canonical form used for de-duplicating companies and matching the register. */
export function normaliseName(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(SUFFIX, " ")
    .replace(/^\s*the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = trigrams(a), B = trigrams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export function matchRegister(
  name: string,
  register: string[],
  threshold = 0.9,
): { matched: string; score: number } | null {
  const n = normaliseName(name);
  if (!n) return null;
  let best: { matched: string; score: number } | null = null;
  for (const r of register) {
    const score = similarity(n, normaliseName(r));
    if (score >= threshold && (!best || score > best.score)) best = { matched: r, score };
  }
  return best;
}
