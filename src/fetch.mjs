// Off-chain daily series, all keyless. Writes data/raw/series.json.
//
//   DefiLlama   NEAR Intents volume, gross fees, revenue captured by NEAR; NEAR L1 gas fees
//   NearBlocks  NEAR price, total supply, transactions, active accounts
//
// These are third-party series: they are quoted, not recomputed, and every
// chart that uses them says so. The solvency numbers do not depend on them.

import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const OUT = new URL('../data/raw/series.json', import.meta.url);

export const SOURCES = {
  intentsVolumeUsd: 'https://api.llama.fi/summary/dexs/near-intents',
  intentsFeesUsd: 'https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees',
  intentsRevenueUsd: 'https://api.llama.fi/summary/fees/near-intents?dataType=dailyRevenue',
  l1FeesUsd: 'https://api.llama.fi/summary/fees/near?dataType=dailyFees',
  nearblocks: 'https://api.nearblocks.io/v1/charts',
};

const day = (unixSeconds) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

async function getText(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
    }
  }
}

// DefiLlama "summary" response -> { 'YYYY-MM-DD': usd }
export function llamaDaily(body) {
  const out = {};
  for (const [ts, value] of body.totalDataChart) out[day(ts)] = Number(value);
  return out;
}

// NearBlocks charts response -> per-day rows with the fields used here.
export function nearblocksDaily(body) {
  const out = {};
  for (const r of body.charts) {
    out[r.date.slice(0, 10)] = {
      priceUsd: Number(r.near_price),
      // yoctoNEAR (1e24) -> NEAR, kept to six decimals.
      totalSupplyNear: Number(BigInt(r.total_supply.split('.')[0]) / 10n ** 18n) / 1e6,
      txns: Number(r.txns),
      activeAccounts: Number(r.active_accounts),
    };
  }
  return out;
}

export async function fetchSeries() {
  const fetchedAt = new Date().toISOString();
  const sha256 = {};
  const raw = {};
  for (const [name, url] of Object.entries(SOURCES)) {
    const text = await getText(url);
    sha256[name] = createHash('sha256').update(text).digest('hex');
    raw[name] = JSON.parse(text);
  }
  const series = {
    fetchedAt,
    sources: SOURCES,
    sha256,
    methodology: {
      intentsFees: raw.intentsFeesUsd.methodology?.Fees ?? null,
      intentsRevenue: raw.intentsRevenueUsd.methodology?.Revenue ?? null,
      l1Fees: raw.l1FeesUsd.methodology?.Fees ?? null,
    },
    intentsVolumeUsd: llamaDaily(raw.intentsVolumeUsd),
    intentsFeesUsd: llamaDaily(raw.intentsFeesUsd),
    intentsRevenueUsd: llamaDaily(raw.intentsRevenueUsd),
    l1FeesUsd: llamaDaily(raw.l1FeesUsd),
    near: nearblocksDaily(raw.nearblocks),
  };
  await mkdir(new URL('.', OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(series) + '\n');
  return series;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await fetchSeries();
  const last = (o) => Object.keys(o).sort().at(-1);
  console.log(`series written: volume ${Object.keys(s.intentsVolumeUsd).length} days (to ${last(s.intentsVolumeUsd)}), fees ${Object.keys(s.intentsFeesUsd).length}, revenue ${Object.keys(s.intentsRevenueUsd).length}, L1 fees ${Object.keys(s.l1FeesUsd).length}, NearBlocks ${Object.keys(s.near).length} (to ${last(s.near)})`);
}
