// Token registry: which assets are checked, and how each one's backing is read.
//
// Source: the NEAR Intents 1Click API token list (keyless). It is the list of
// assets Intents routes. Fungible tokens that sit in intents.near but are not
// on this list, and NFTs (nep171), are out of scope; README "Limits" says so.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const REGISTRY_PATH = new URL('../data/raw/registry.json', import.meta.url);
const TOKENS_URL = 'https://1click.chaindefuser.com/v0/tokens';

// assetId formats seen in the list:
//   nep141:<contract>              NEAR fungible token; backing = ft_balance_of(intents.near) on <contract>
//   nep245:<contract>:<token id>   multi token (HOT Omni); backing = mt_balance_of(intents.near, <token id>) on <contract>
//   1cs_v1:<chain>:...             routed without a NEAR-side token; nothing to read on NEAR
export function parseAssetId(assetId) {
  const i = assetId.indexOf(':');
  const standard = assetId.slice(0, i);
  const rest = assetId.slice(i + 1);
  if (standard === 'nep141') return { standard, contract: rest, tokenId: null, checkable: true };
  if (standard === 'nep245') {
    const j = rest.indexOf(':');
    return { standard, contract: rest.slice(0, j), tokenId: rest.slice(j + 1), checkable: true };
  }
  return { standard, contract: null, tokenId: null, checkable: false };
}

export function normalise(list, fetchedAt) {
  const seen = new Set();
  const tokens = [];
  for (const t of list) {
    if (seen.has(t.assetId)) continue;
    seen.add(t.assetId);
    tokens.push({
      assetId: t.assetId,
      symbol: t.symbol,
      blockchain: t.blockchain,
      decimals: t.decimals,
      priceUsd: typeof t.price === 'number' ? t.price : Number(t.price) || 0,
      ...parseAssetId(t.assetId),
    });
  }
  tokens.sort((a, b) => (a.assetId < b.assetId ? -1 : 1));
  return { source: TOKENS_URL, fetchedAt, tokens };
}

export async function fetchRegistry() {
  const res = await fetch(TOKENS_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`token list HTTP ${res.status}`);
  const registry = normalise(await res.json(), new Date().toISOString());
  await mkdir(dirname(REGISTRY_PATH.pathname), { recursive: true });
  await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 1) + '\n');
  return registry;
}

export async function loadRegistry() {
  return JSON.parse(await readFile(REGISTRY_PATH, 'utf8'));
}

// Whole units as a JS number (display and USD only; comparisons use BigInt).
export function toUnits(raw, decimals) {
  if (raw == null) return null;
  const s = BigInt(raw).toString().padStart(decimals + 1, '0');
  return Number(s.slice(0, s.length - decimals) + '.' + s.slice(s.length - decimals));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const r = await fetchRegistry();
  const by = {};
  for (const t of r.tokens) by[t.standard] = (by[t.standard] || 0) + 1;
  console.log(`registry: ${r.tokens.length} tokens`, by, '->', REGISTRY_PATH.pathname);
}
