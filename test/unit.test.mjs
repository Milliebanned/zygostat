// Offline unit tests: no network, no clock. Run with `node --test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAssetId, normalise, toUnits } from '../src/registry.mjs';
import { blockAtTime, blockSoonAfter, utcDays, isoDay } from '../src/blocks.mjs';
import { tokenRows, summarise, isMaterial, episode, windowSum, windowMean, change, lastCommonDay, economics, interruption, addDays } from '../src/metrics.mjs';
import { riskAdjusted, poissonRate, scenarioGrid } from '../src/model.mjs';
import { chooseMajors } from '../src/scan.mjs';
import { llamaDaily, nearblocksDaily } from '../src/fetch.mjs';

// ---------- registry ----------

test('parseAssetId: fungible token', () => {
  assert.deepEqual(parseAssetId('nep141:wrap.near'), { standard: 'nep141', contract: 'wrap.near', tokenId: null, checkable: true });
});

test('parseAssetId: multi token keeps colons inside the token id', () => {
  assert.deepEqual(parseAssetId('nep245:v2_1.omni.hot.tg:56_abc:def'), { standard: 'nep245', contract: 'v2_1.omni.hot.tg', tokenId: '56_abc:def', checkable: true });
});

test('parseAssetId: assets with no NEAR-side token are not checkable', () => {
  assert.equal(parseAssetId('1cs_v1:sol:spl:A7bd').checkable, false);
});

test('normalise: removes duplicates and sorts by asset id', () => {
  const r = normalise([
    { assetId: 'nep141:b.near', symbol: 'B', blockchain: 'near', decimals: 6, price: 1 },
    { assetId: 'nep141:a.near', symbol: 'A', blockchain: 'near', decimals: 6, price: '2.5' },
    { assetId: 'nep141:b.near', symbol: 'B', blockchain: 'near', decimals: 6, price: 1 },
  ], '2026-01-01T00:00:00.000Z');
  assert.deepEqual(r.tokens.map((t) => t.assetId), ['nep141:a.near', 'nep141:b.near']);
  assert.equal(r.tokens[0].priceUsd, 2.5);
});

test('toUnits: exact for values far above 2^53', () => {
  assert.equal(toUnits('3859218719267476366071629', 18), 3859218.7192674764);
  assert.equal(toUnits('1', 6), 0.000001);
  assert.equal(toUnits('0', 18), 0);
  assert.equal(toUnits(null, 18), null);
});

// ---------- block search ----------

// A fake chain: one block every 600 ms, with some heights skipped.
function fakeChain({ skipped = new Set(), start = 1000, t0 = 1_000_000, n = 100_000 } = {}) {
  const calls = [];
  const probe = async (height) => {
    calls.push(height);
    let h = height;
    while (skipped.has(h)) h++;
    return { height: h, timeMs: t0 + (h - start) * 600, totalSupplyYocto: '0' };
  };
  return { probe, calls, top: { height: start + n, timeMs: t0 + n * 600 }, timeOf: (h) => t0 + (h - start) * 600 };
}

test('blockAtTime: finds the first block at or after a time', async () => {
  const c = fakeChain();
  const target = c.timeOf(51_234) - 100; // just before block 51,234
  const got = await blockAtTime(target, { probe: c.probe, top: c.top, known: [{ height: 1000, timeMs: 1_000_000 }] });
  assert.equal(got.height, 51_234);
  assert.ok(c.calls.length <= 12, `too many probes: ${c.calls.length}`);
});

test('blockAtTime: exact timestamp returns that block', async () => {
  const c = fakeChain();
  const got = await blockAtTime(c.timeOf(70_000), { probe: c.probe, top: c.top, known: [{ height: 1000, timeMs: 1_000_000 }] });
  assert.equal(got.height, 70_000);
});

test('blockAtTime: steps over skipped heights', async () => {
  const skipped = new Set([40_000, 40_001, 40_002]);
  const c = fakeChain({ skipped });
  const got = await blockAtTime(c.timeOf(40_000) - 50, { probe: c.probe, top: c.top, known: [{ height: 1000, timeMs: 1_000_000 }] });
  assert.equal(got.height, 40_003);
});

test('blockAtTime: refuses a time after the head', async () => {
  const c = fakeChain();
  await assert.rejects(blockAtTime(c.top.timeMs + 1, { probe: c.probe, top: c.top }), /after the chain head/);
});

test('blockSoonAfter: lands within the window after the time, in few probes', async () => {
  const c = fakeChain();
  const target = c.timeOf(60_000) + 7;
  const got = await blockSoonAfter(target, { probe: c.probe, top: c.top, known: [{ height: 1000, timeMs: 1_000_000 }], windowMs: 120_000 });
  assert.ok(got.timeMs >= target && got.timeMs - target <= 120_000);
  assert.ok(c.calls.length <= 3, `too many probes: ${c.calls.length}`);
});

test('blockSoonAfter: corrects a wrong block-time guess', async () => {
  // Blocks every 1,000 ms here, against the 600 ms the first guess assumes.
  const probe = async (h) => ({ height: h, timeMs: 5_000_000 + (h - 1000) * 1000 });
  const top = { height: 2_000_000, timeMs: 5_000_000 + 1_999_000 * 1000 };
  const target = 5_000_000 + 500_000 * 1000;
  const got = await blockSoonAfter(target, { probe, top, known: [{ height: 1000, timeMs: 5_000_000 }], windowMs: 60_000 });
  assert.ok(got.timeMs >= target && got.timeMs - target <= 60_000);
});

test('utcDays and isoDay', () => {
  assert.deepEqual(utcDays('2026-10-01', '2026-10-08', 7).map(isoDay), ['2026-10-01', '2026-10-08']);
  assert.equal(utcDays('2026-02-27', '2026-03-02').length, 4);
});

// ---------- solvency ----------

const registry = {
  tokens: [
    { assetId: 'nep141:usdt.near', symbol: 'USDT', blockchain: 'near', standard: 'nep141', decimals: 6, priceUsd: 1, checkable: true },
    { assetId: 'nep245:hot:56_x', symbol: 'USDT', blockchain: 'bsc', standard: 'nep245', decimals: 18, priceUsd: 1, checkable: true },
    { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', standard: 'nep141', decimals: 24, priceUsd: 4, checkable: true },
    { assetId: 'nep141:unread.near', symbol: 'X', blockchain: 'near', standard: 'nep141', decimals: 6, priceUsd: 1, checkable: true },
  ],
};
const reading = (hot = ['3859218719267476366071629', '57386097751568487509891']) => ({
  height: 218_030_000,
  time: '2026-10-01T08:00:00.000Z',
  scope: 'all',
  backing: 'all',
  credits: { 'nep141:usdt.near': '480876682312', 'nep245:hot:56_x': hot[0], 'nep141:wrap.near': '1000000000000000000000000', 'nep141:unread.near': '5' },
  held: { 'nep141:usdt.near': '480897112038', 'nep245:hot:56_x': hot[1], 'nep141:wrap.near': '1000000000000000000000000' },
  errors: {},
});

test('tokenRows: only tokens with both numbers; gap sign and unbacked share', () => {
  const rows = tokenRows(reading(), registry);
  assert.equal(rows.length, 3);
  const hot = rows.find((r) => r.assetId === 'nep245:hot:56_x');
  assert.equal(hot.gap, (3859218719267476366071629n - 57386097751568487509891n).toString());
  assert.ok(Math.abs(hot.gapUsd - 3_801_832.62) < 0.01);
  assert.ok(Math.abs(hot.unbackedShare - 0.98513) < 1e-5);
  const usdt = rows.find((r) => r.assetId === 'nep141:usdt.near');
  assert.ok(BigInt(usdt.gap) < 0n); // more held than credited
  assert.equal(usdt.unbackedShare, 0);
});

test('summarise: totals, shortfall and material count', () => {
  const s = summarise(reading(), registry);
  assert.equal(s.tokensChecked, 3);
  assert.equal(s.tokensShort, 1);
  assert.equal(s.tokensMaterial, 1);
  assert.equal(s.worst.assetId, 'nep245:hot:56_x');
  assert.ok(Math.abs(s.shortfallUsd - 3_801_832.62) < 0.01);
  assert.ok(Math.abs(s.surplusUsd - 20.429726) < 1e-6);
  // Credits: 480,876.68 + 3,859,218.72 + 1 NEAR at $4 = 4,340,099.40.
  assert.ok(Math.abs(s.creditsUsd - 4_340_099.4) < 0.01);
  assert.ok(Math.abs(s.shortfallShare - 3_801_832.62 / 4_340_099.4) < 1e-6);
});

test('isMaterial: needs both $100 and 1 basis point', () => {
  assert.equal(isMaterial({ gapUsd: 99, unbackedShare: 0.5 }), false);
  assert.equal(isMaterial({ gapUsd: 5000, unbackedShare: 0.00005 }), false);
  assert.equal(isMaterial({ gapUsd: 100, unbackedShare: 0.0001 }), true);
});

test('summarise: a fully backed reading has no shortfall', () => {
  const s = summarise(reading(['5', '5']), registry);
  assert.equal(s.tokensShort, 0);
  assert.equal(s.shortfallUsd, 0);
  assert.equal(s.worst, null);
});

test('episode: bounds the start, peak and end', () => {
  const mk = (height, hour, shortfallUsd) => ({ height, time: `2026-10-0${1 + Math.floor(hour / 24)}T${String(hour % 24).padStart(2, '0')}:00:00.000Z`, shortfallUsd, shortfallShare: shortfallUsd / 1e8, creditsUsd: 1e8, tokensMaterial: shortfallUsd > 0 ? 1 : 0, worst: shortfallUsd ? { symbol: 'USDT' } : null });
  const e = episode([mk(5, 30, 0), mk(1, 0, 0), mk(2, 6, 1_000_000), mk(3, 12, 3_800_000), mk(4, 24, 3_800_000)]);
  assert.equal(e.lastCleanBefore.height, 1);
  assert.equal(e.firstShort.height, 2);
  assert.equal(e.peak.height, 3);
  assert.equal(e.lastShort.height, 4);
  assert.equal(e.firstCleanAfter.height, 5);
  assert.equal(e.readingsShort, 3);
  assert.equal(e.minHours, 18);
  assert.equal(e.maxHours, 30);
});

test('episode: null when every reading is clean', () => {
  assert.equal(episode([{ height: 1, time: '2026-10-01T00:00:00.000Z', shortfallUsd: 0, tokensMaterial: 0 }]), null);
});

test('chooseMajors: largest tokens first until coverage is reached', () => {
  const reg = { tokens: ['a', 'b', 'c', 'd'].map((x) => ({ assetId: `nep141:${x}`, standard: 'nep141', decimals: 0, priceUsd: 1 })) };
  const head = { credits: { 'nep141:a': '900', 'nep141:b': '80', 'nep141:c': '15', 'nep141:d': '5' } };
  const m = chooseMajors(head, reg, { coverage: 0.97, min: 1, max: 10 });
  assert.deepEqual(m.assetIds, ['nep141:a', 'nep141:b']);
  assert.ok(Math.abs(m.coveredShare - 0.98) < 1e-9);
});

// ---------- series ----------

test('windowSum: inclusive window, missing days counted', () => {
  const d = { '2026-01-01': 1, '2026-01-02': 2, '2026-01-04': 4 };
  assert.deepEqual(windowSum(d, '2026-01-04', 4), { sum: 7, missing: 1, from: '2026-01-01', to: '2026-01-04' });
  assert.equal(windowMean(d, '2026-01-04', 4).mean, 7 / 3);
});

test('change, addDays, lastCommonDay', () => {
  assert.equal(change(150, 100), 0.5);
  assert.equal(change(1, 0), null);
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(lastCommonDay({ '2026-01-01': 1, '2026-01-02': 1 }, { '2026-01-01': 1 }), '2026-01-01');
});

function flatSeries() {
  const s = { intentsVolumeUsd: {}, intentsFeesUsd: {}, intentsRevenueUsd: {}, l1FeesUsd: {}, near: {} };
  for (let i = 0; i < 800; i++) {
    const d = addDays('2024-10-01', i);
    const recent = d > '2026-01-01';
    s.intentsVolumeUsd[d] = recent ? 200 : 100;
    s.intentsFeesUsd[d] = recent ? 2 : 1;
    s.intentsRevenueUsd[d] = recent ? 1 : 0.5;
    s.l1FeesUsd[d] = 0.5;
    s.near[d] = { priceUsd: 2, totalSupplyNear: 1e9 + i * (25e6 / 365), txns: recent ? 50 : 100, activeAccounts: recent ? 10 : 40 };
  }
  return s;
}

test('economics: windows, year-on-year change and coverage of issuance', () => {
  const e = economics(flatSeries(), '2026-10-31');
  assert.equal(e.intents.volume30dUsd, 6000);
  assert.equal(e.intents.volume30dChange, 1);
  assert.equal(e.intents.captureShare30d, 0.5);
  assert.equal(e.l1.txnsChange, -0.5);
  assert.equal(e.l1.activeAccountsChange, -0.75);
  assert.equal(e.l1.intentsFeesMultiple, 4);
  assert.ok(Math.abs(e.supply.issuedNear365d - 25e6) < 1);
  // 365 of revenue a year against 25M NEAR * $2 of new supply.
  assert.ok(Math.abs(e.supply.revenueCoverage30dAnnualised - 365 / 50e6) < 1e-12);
});

test('interruption: pause days against the days before', () => {
  const s = flatSeries();
  for (const d of ['2026-10-01', '2026-10-02']) { s.intentsVolumeUsd[d] = 100; s.intentsFeesUsd[d] = 1; s.intentsRevenueUsd[d] = 0.25; }
  const r = interruption(s, '2026-10-01', 2, '2026-09-30');
  assert.equal(r.volumeChange, -0.5);
  assert.equal(r.feesLostUsd, 2);
  assert.equal(r.revenueLostUsd, 1.5);
  assert.equal(r.baselineFrom, '2026-09-29');
});

test('source parsers: DefiLlama days and NearBlocks units', () => {
  assert.deepEqual(llamaDaily({ totalDataChart: [[1794441600, 176440686]] }), { '2026-11-12': 176440686 });
  const d = nearblocksDaily({ charts: [{ date: '2026-11-12T00:00:00.000Z', near_price: '3.58539248', total_supply: '1311549122982004139095931101595325', txns: '891523', active_accounts: '85370' }] });
  // 1.3115e33 yoctoNEAR is 1,311,549,122.98 NEAR (not millions of NEAR).
  assert.equal(d['2026-11-12'].totalSupplyNear, 1311549122.982004);
  assert.equal(d['2026-11-12'].txns, 891523);
  assert.equal(d['2026-11-12'].priceUsd, 3.58539248);
});

// ---------- model ----------

test('riskAdjusted: hand-checked case', () => {
  const r = riskAdjusted({ R: 20e6, C: 100e6, f: 0.04, lambda: 0.5, rho: 0.5, D: 0.2e6, h: 1 });
  assert.equal(r.grossLossPerEvent, 4e6);
  assert.equal(r.netCostPerEvent, 2.2e6);
  assert.equal(r.expectedAnnualCost, 1.1e6);
  assert.equal(r.riskAdjustedRevenue, 18.9e6);
  assert.ok(Math.abs(r.drag - 0.055) < 1e-12);
  assert.ok(Math.abs(r.breakEvenLambda - 20 / 2.2) < 1e-9);
});

test('riskAdjusted: full recovery leaves only the pause cost', () => {
  const r = riskAdjusted({ R: 10e6, C: 100e6, f: 0.04, lambda: 1, rho: 1, D: 0.5e6, h: 1 });
  assert.equal(r.expectedAnnualCost, 0.5e6);
});

test('riskAdjusted: no cost per event means no break-even rate', () => {
  assert.equal(riskAdjusted({ R: 1, C: 1, f: 0, lambda: 1, rho: 1, D: 0, h: 1 }).breakEvenLambda, Infinity);
});

test('poissonRate: exact 90% interval for one event (0.0513 to 4.744)', () => {
  const r = poissonRate(1, 1, 0.9);
  assert.equal(r.point, 1);
  assert.ok(Math.abs(r.low - 0.05129) < 1e-4, String(r.low));
  assert.ok(Math.abs(r.high - 4.74386) < 1e-4, String(r.high));
});

test('poissonRate: zero events has a zero lower bound and scales with exposure', () => {
  const r = poissonRate(0, 2, 0.9);
  assert.equal(r.low, 0);
  assert.ok(Math.abs(r.high - 2.99573 / 2) < 1e-4);
});

test('scenarioGrid: three rates by three recovery rates, cost falls as recovery rises', () => {
  const g = scenarioGrid({ R: 20e6, C: 100e6, f: 0.04, D: 0.2e6, h: 1 }, { low: 0.1, point: 0.5, high: 2 });
  assert.equal(g.length, 3);
  for (const row of g) {
    assert.equal(row.cells.length, 3);
    assert.ok(row.cells[0].expectedAnnualCost < row.cells[1].expectedAnnualCost);
    assert.ok(row.cells[1].expectedAnnualCost < row.cells[2].expectedAnnualCost);
  }
});
