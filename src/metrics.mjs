// Pure functions: readings and series in, numbers out. No network, no clock.
// Every figure in THESIS.md and on the dashboard comes from this file.

import { toUnits } from './registry.mjs';

// ---------- solvency ----------

// A shortfall counts as material when it is both worth at least $100 and at
// least 1 basis point of the token's credits. Smaller gaps are reported but
// do not trip the kill criterion (dust and rounding).
export const MATERIAL_USD = 100;
export const MATERIAL_SHARE = 1e-4;

// Per-token rows for one reading. Only tokens with both numbers are returned.
export function tokenRows(reading, registry) {
  const rows = [];
  for (const t of registry.tokens) {
    const c = reading.credits[t.assetId];
    const h = reading.held[t.assetId];
    if (c === undefined || h === undefined) continue;
    const gap = BigInt(c) - BigInt(h); // > 0: users are owed more than is held
    const creditsUnits = toUnits(c, t.decimals);
    const heldUnits = toUnits(h, t.decimals);
    const gapUnits = creditsUnits - heldUnits;
    rows.push({
      assetId: t.assetId,
      symbol: t.symbol,
      blockchain: t.blockchain,
      standard: t.standard,
      credits: c,
      held: h,
      gap: gap.toString(),
      creditsUnits,
      heldUnits,
      gapUnits,
      creditsUsd: creditsUnits * t.priceUsd,
      heldUsd: heldUnits * t.priceUsd,
      gapUsd: gapUnits * t.priceUsd,
      // Share of the credits that is not backed (0 when fully backed).
      unbackedShare: gap > 0n && BigInt(c) > 0n ? Number((gap * 1_000_000n) / BigInt(c)) / 1e6 : 0,
    });
  }
  return rows;
}

export const isMaterial = (row) => row.gapUsd >= MATERIAL_USD && row.unbackedShare >= MATERIAL_SHARE;

// One line per reading.
export function summarise(reading, registry) {
  const rows = tokenRows(reading, registry);
  let creditsUsd = 0, heldUsd = 0, shortfallUsd = 0, surplusUsd = 0;
  for (const r of rows) {
    creditsUsd += r.creditsUsd;
    heldUsd += r.heldUsd;
    if (r.gapUsd > 0) shortfallUsd += r.gapUsd; else surplusUsd -= r.gapUsd;
  }
  const short = rows.filter((r) => BigInt(r.gap) > 0n).sort((a, b) => b.gapUsd - a.gapUsd);
  const material = short.filter(isMaterial);
  // Credits are read for every token; backing only for some in the series
  // plan. `checkedShare` says how much of the credited value was checked.
  let creditsAllUsd = 0;
  for (const t of registry.tokens) {
    const c = reading.credits[t.assetId];
    if (c !== undefined) creditsAllUsd += toUnits(c, t.decimals) * t.priceUsd;
  }
  return {
    height: reading.height,
    time: reading.time,
    scope: reading.scope,
    backing: reading.backing,
    tokensChecked: rows.length,
    creditsAllUsd,
    checkedShare: creditsAllUsd ? creditsUsd / creditsAllUsd : 1,
    creditsUsd,
    heldUsd,
    shortfallUsd,
    surplusUsd,
    shortfallShare: creditsUsd ? shortfallUsd / creditsUsd : 0,
    tokensShort: short.length,
    tokensMaterial: material.length,
    worst: short[0] ? pick(short[0]) : null,
    material: material.map(pick),
    errors: Object.keys(reading.errors || {}).length,
  };
}

const pick = (r) => ({ assetId: r.assetId, symbol: r.symbol, blockchain: r.blockchain, creditsUnits: r.creditsUnits, heldUnits: r.heldUnits, gapUnits: r.gapUnits, gapUsd: r.gapUsd, unbackedShare: r.unbackedShare });

// Reconstruct an under-backing episode from readings sorted by height.
// Returns null when no reading in the window has a material shortfall.
export function episode(summaries) {
  const s = [...summaries].sort((a, b) => a.height - b.height);
  const first = s.findIndex((x) => x.tokensMaterial > 0);
  if (first === -1) return null;
  let last = first;
  for (let i = first; i < s.length; i++) if (s[i].tokensMaterial > 0) last = i;
  let peak = s[first];
  for (let i = first; i <= last; i++) if (s[i].shortfallUsd > peak.shortfallUsd) peak = s[i];
  const before = s[first - 1] ?? null;
  const after = s[last + 1] ?? null;
  const t = (x) => Date.parse(x.time);
  return {
    lastCleanBefore: before && { height: before.height, time: before.time },
    firstShort: { height: s[first].height, time: s[first].time, shortfallUsd: s[first].shortfallUsd },
    peak: { height: peak.height, time: peak.time, shortfallUsd: peak.shortfallUsd, shortfallShare: peak.shortfallShare, creditsUsd: peak.creditsUsd, worst: peak.worst },
    lastShort: { height: s[last].height, time: s[last].time, shortfallUsd: s[last].shortfallUsd },
    firstCleanAfter: after && { height: after.height, time: after.time },
    readingsShort: s.slice(first, last + 1).filter((x) => x.tokensMaterial > 0).length,
    // The episode lasted at least minHours (first to last short reading) and
    // at most maxHours (last clean reading before to first clean one after).
    minHours: (t(s[last]) - t(s[first])) / 3.6e6,
    maxHours: before && after ? (t(after) - t(before)) / 3.6e6 : null,
  };
}

// ---------- daily series ----------

const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

// Sum of `days` daily values ending on `endDay` inclusive.
// `missing` counts days with no value; they add nothing to the sum.
export function windowSum(daily, endDay, days, get = (v) => v) {
  let sum = 0, missing = 0;
  for (let i = 0; i < days; i++) {
    const v = daily[addDays(endDay, -i)];
    if (v === undefined || v === null || Number.isNaN(get(v))) missing++;
    else sum += get(v);
  }
  return { sum, missing, from: addDays(endDay, -(days - 1)), to: endDay };
}

export const windowMean = (daily, endDay, days, get) => {
  const w = windowSum(daily, endDay, days, get);
  return { ...w, mean: days - w.missing ? w.sum / (days - w.missing) : null };
};

export const change = (now, then) => (then ? now / then - 1 : null);

// Last day present in every listed series.
export function lastCommonDay(...series) {
  const sets = series.map((s) => new Set(Object.keys(s)));
  return [...sets[0]].filter((d) => sets.every((x) => x.has(d))).sort().at(-1);
}

// Usage, value capture and dilution, as of `asOf` (a UTC day).
export function economics(series, asOf) {
  const yearAgo = addDays(asOf, -365);
  const vol30 = windowSum(series.intentsVolumeUsd, asOf, 30);
  const vol30Prev = windowSum(series.intentsVolumeUsd, yearAgo, 30);
  const vol365 = windowSum(series.intentsVolumeUsd, asOf, 365);
  const fees30 = windowSum(series.intentsFeesUsd, asOf, 30);
  const fees365 = windowSum(series.intentsFeesUsd, asOf, 365);
  const rev30 = windowSum(series.intentsRevenueUsd, asOf, 30);
  const rev90 = windowSum(series.intentsRevenueUsd, asOf, 90);
  const rev365 = windowSum(series.intentsRevenueUsd, asOf, 365);
  const l1Fees30 = windowSum(series.l1FeesUsd, asOf, 30);
  const tx30 = windowMean(series.near, asOf, 30, (r) => r.txns);
  const tx30Prev = windowMean(series.near, yearAgo, 30, (r) => r.txns);
  const acc30 = windowMean(series.near, asOf, 30, (r) => r.activeAccounts);
  const acc30Prev = windowMean(series.near, yearAgo, 30, (r) => r.activeAccounts);
  const now = series.near[asOf];
  const then = series.near[yearAgo];
  const issuedNear = now.totalSupplyNear - then.totalSupplyNear;
  const issuanceUsd = issuedNear * now.priceUsd;
  return {
    asOf,
    yearAgo,
    priceUsd: now.priceUsd,
    intents: {
      volume30dUsd: vol30.sum,
      volume30dYearAgoUsd: vol30Prev.sum,
      volume30dChange: change(vol30.sum, vol30Prev.sum),
      volume365dUsd: vol365.sum,
      fees30dUsd: fees30.sum,
      fees365dUsd: fees365.sum,
      feeRate30d: vol30.sum ? fees30.sum / vol30.sum : null,
      revenue30dUsd: rev30.sum,
      revenue90dUsd: rev90.sum,
      revenue365dUsd: rev365.sum,
      revenueAnnualised30dUsd: rev30.sum * (365 / 30),
      revenueAnnualised90dUsd: rev90.sum * (365 / 90),
      captureShare30d: fees30.sum ? rev30.sum / fees30.sum : null,
    },
    l1: {
      txnsPerDay30d: tx30.mean,
      txnsPerDay30dYearAgo: tx30Prev.mean,
      txnsChange: change(tx30.mean, tx30Prev.mean),
      activeAccounts30d: acc30.mean,
      activeAccounts30dYearAgo: acc30Prev.mean,
      activeAccountsChange: change(acc30.mean, acc30Prev.mean),
      fees30dUsd: l1Fees30.sum,
      intentsFeesMultiple: l1Fees30.sum ? fees30.sum / l1Fees30.sum : null,
    },
    supply: {
      totalNear: now.totalSupplyNear,
      totalNearYearAgo: then.totalSupplyNear,
      issuedNear365d: issuedNear,
      inflation365d: change(now.totalSupplyNear, then.totalSupplyNear),
      issuanceUsd365d: issuanceUsd,
      // Share of a year's new supply (at today's price) that captured revenue equals.
      revenueCoverage30dAnnualised: issuanceUsd ? (rev30.sum * (365 / 30)) / issuanceUsd : null,
      revenueCoverage90dAnnualised: issuanceUsd ? (rev90.sum * (365 / 90)) / issuanceUsd : null,
      revenueCoverage365d: issuanceUsd ? rev365.sum / issuanceUsd : null,
    },
  };
}

// What a pause cost: the `days` days starting at `from`, against the same
// number of days ending the day before `baselineEnd`.
export function interruption(series, from, days, baselineEnd) {
  const end = addDays(from, days - 1);
  const during = { volume: windowSum(series.intentsVolumeUsd, end, days).sum, fees: windowSum(series.intentsFeesUsd, end, days).sum, revenue: windowSum(series.intentsRevenueUsd, end, days).sum };
  const base = { volume: windowSum(series.intentsVolumeUsd, baselineEnd, days).sum, fees: windowSum(series.intentsFeesUsd, baselineEnd, days).sum, revenue: windowSum(series.intentsRevenueUsd, baselineEnd, days).sum };
  return {
    from, to: end, days, baselineFrom: addDays(baselineEnd, -(days - 1)), baselineTo: baselineEnd,
    during, baseline: base,
    volumeChange: change(during.volume, base.volume),
    feesLostUsd: Math.max(0, base.fees - during.fees),
    revenueLostUsd: Math.max(0, base.revenue - during.revenue),
  };
}

export { addDays };
