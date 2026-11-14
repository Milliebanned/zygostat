// Turn committed raw data into every number the thesis uses.
// Pure: same inputs, same output. No network, no clock.

import { summarise, episode, economics, interruption, lastCommonDay, windowSum, addDays } from './metrics.mjs';
import { riskAdjusted, poissonRate, scenarioGrid } from './model.mjs';
import { toUnits } from './registry.mjs';

// Facts taken from the two public write-ups of the October 2026 exploit.
// They are quoted, not measured here; the solvency scan is the measurement.
export const INCIDENT = {
  postmortemUrl: 'https://x.com/AlexAuroraDev/status/2111124226962870770',
  certikUrl: 'https://www.certik.com/blog/hot-bridge-near-intents',
  official: [
    { when: '2026-01-13', what: 'Bug bounty report on a similar third-party call feature; fixed on mainnet within two days; not exploited.' },
    { when: '2026-09-29 16:14', what: 'First attacker transaction (postmortem and CertiK agree).' },
    { when: '2026-10-01 05:54', what: 'Last attacker withdrawal (postmortem; CertiK lists a last payout at 06:08).' },
    { when: '2026-10-01 08:04', what: 'Team identifies the withdrawal problem.' },
    { when: '2026-10-01 08:33', what: 'intents.near paused.' },
    { when: '2026-10-01 11:20', what: 'intents.near unpaused; affected routes stay paused and return over the following days.' },
    { when: '2026-10-02', what: 'Funds returned after negotiation (announced 15:52 UTC).' },
    { when: '2026-10-02 20:31', what: 'Fix deployed on mainnet.' },
    { when: '2026-10-07', what: 'Second critical report on the same feature (paid $300K via bug bounty); deposit notifications removed.' },
  ],
  // Three critical findings in one feature in 2026, one of them exploited.
  criticalFindings: 3,
  exploited: 1,
  // First full UTC day after the feature was removed. Kill criterion K1 counts from here.
  cleanFrom: '2026-10-08',
  // Last full UTC day before the first attacker transaction.
  lastDayBefore: '2026-09-28',
  // Pause window and the weekday-matched baseline one week earlier.
  pauseFrom: '2026-10-01',
  pauseDays: 4,
  baselineEnd: '2026-09-27',
};

// Thresholds were written on 2026-11-13, after a first look at the data.
// They describe the past; they bind on every later rebuild.
export const KILL = {
  k1MaterialReadings: 0, // any material shortfall after INCIDENT.cleanFrom triggers
  k2VolumeChange: 0, // 30-day Intents volume below the same window a year earlier triggers
  k3Coverage: 0.10, // captured revenue (90d annualised) under 10% of a year's new supply triggers
  k4Drag: 0.25, // expected security cost over 25% of captured revenue triggers
};

const day = (iso) => iso.slice(0, 10);
const slim = (s) => ({ date: day(s.time), height: s.height, time: s.time, tokensChecked: s.tokensChecked, checkedShare: s.checkedShare, creditsUsd: s.creditsUsd, heldUsd: s.heldUsd, shortfallUsd: s.shortfallUsd, shortfallShare: s.shortfallShare, surplusUsd: s.surplusUsd, tokensMaterial: s.tokensMaterial, worst: s.worst });

export function compute({ registry, series, head, seriesReadings = [], microReadings = [], fullReadings = [], refineReadings = [] }) {
  const byHeight = (a, b) => a.height - b.height;
  const headSum = summarise(head, registry);
  const daily = seriesReadings.map((r) => summarise(r, registry)).sort(byHeight);
  const full = fullReadings.map((r) => summarise(r, registry)).sort(byHeight);
  const micro = [...microReadings, ...refineReadings].map((r) => summarise(r, registry)).sort(byHeight);
  const ep = episode(micro);

  // Token most affected at the peak, followed through the micro readings.
  const hit = ep?.peak.worst?.assetId ?? null;
  const hitToken = hit ? registry.tokens.find((t) => t.assetId === hit) : null;
  const hitSeries = hit
    ? [...microReadings, ...refineReadings].filter((r) => r.credits[hit] !== undefined && r.held[hit] !== undefined).sort(byHeight)
      .map((r) => ({ height: r.height, time: r.time, credits: toUnits(r.credits[hit], hitToken.decimals), held: toUnits(r.held[hit], hitToken.decimals) }))
    : [];

  const everything = [...daily, ...full, headSum];
  const since = everything.filter((s) => day(s.time) >= INCIDENT.cleanFrom);
  const asOf = lastCommonDay(series.intentsVolumeUsd, series.intentsFeesUsd, series.intentsRevenueUsd, series.l1FeesUsd, series.near);
  const econ = economics(series, asOf);
  const pause = interruption(series, INCIDENT.pauseFrom, INCIDENT.pauseDays, INCIDENT.baselineEnd);
  // Did users come back? The latest 30 days against the 30 days that ended
  // the day before the first attacker transaction.
  const before = windowSum(series.intentsVolumeUsd, INCIDENT.lastDayBefore, 30).sum;
  const retention = { beforeTo: INCIDENT.lastDayBefore, volume30dBeforeUsd: before, volume30dNowUsd: econ.intents.volume30dUsd, change: before ? econ.intents.volume30dUsd / before - 1 : null };
  // Value of all NEAR at today's price, and captured revenue as a yield on it.
  const valuation = { allNearUsd: econ.supply.totalNear * econ.priceUsd, revenueYield90dAnnualised: econ.intents.revenueAnnualised90dUsd / (econ.supply.totalNear * econ.priceUsd) };

  // Exposure: from the first day DefiLlama records Intents volume to `asOf`.
  const firstVolumeDay = Object.keys(series.intentsVolumeUsd).sort().find((d) => series.intentsVolumeUsd[d] > 0);
  const exposureYears = (Date.parse(asOf) - Date.parse(firstVolumeDay)) / (365.25 * 86_400_000);
  const rate = poissonRate(INCIDENT.exploited, exposureYears, 0.9);

  // Custody on the day of the peak (credits for every token, at registry prices).
  const peakDay = ep ? day(ep.peak.time) : null;
  const custodyThen = ep ? (daily.find((s) => s.date === peakDay || day(s.time) === peakDay)?.creditsAllUsd ?? null) : null;
  const f = ep ? ep.peak.shortfallUsd / (custodyThen ?? headSum.creditsAllUsd) : null;

  const inputs = {
    R: econ.intents.revenueAnnualised90dUsd,
    C: headSum.creditsAllUsd,
    f,
    D: pause.feesLostUsd * (econ.intents.captureShare30d ?? 0),
    h: 1,
  };
  const model = f === null ? null : {
    inputs: { ...inputs, lambda: rate.point, rho: 0.5 },
    custodyOnPeakDayUsd: custodyThen,
    rate,
    exposureFrom: firstVolumeDay,
    base: riskAdjusted({ ...inputs, lambda: rate.point, rho: 0.5 }),
    grid: scenarioGrid(inputs, rate),
  };

  const kill = [
    {
      id: 'K1', title: 'Solvency',
      rule: `No reading after ${INCIDENT.cleanFrom} shows a material shortfall (at least $100 and 1 basis point of a token's credits).`,
      value: since.reduce((n, s) => n + (s.tokensMaterial > 0 ? 1 : 0), 0),
      display: `${since.reduce((n, s) => n + (s.tokensMaterial > 0 ? 1 : 0), 0)} of ${since.length} readings`,
      status: since.length === 0 ? 'not measured' : since.some((s) => s.tokensMaterial > 0) ? 'triggered' : 'holds',
    },
    {
      id: 'K2', title: 'Usage',
      rule: 'Intents volume over the last 30 days is not below the same 30 days a year earlier.',
      value: econ.intents.volume30dChange,
      status: econ.intents.volume30dChange === null ? 'not measured' : econ.intents.volume30dChange < KILL.k2VolumeChange ? 'triggered' : 'holds',
    },
    {
      id: 'K3', title: 'Value capture',
      rule: `Revenue captured by NEAR (90 days, annualised) is at least ${KILL.k3Coverage * 100}% of the dollar value of one year of new NEAR supply.`,
      value: econ.supply.revenueCoverage90dAnnualised,
      status: econ.supply.revenueCoverage90dAnnualised < KILL.k3Coverage ? 'triggered' : 'holds',
    },
    {
      id: 'K4', title: 'Security cost',
      rule: `Expected yearly cost of loss events (observed rate, half recovered) is at most ${KILL.k4Drag * 100}% of captured revenue.`,
      value: model?.base.drag ?? null,
      status: !model ? 'not measured' : model.base.drag > KILL.k4Drag ? 'triggered' : 'holds',
    },
  ];

  return {
    asOf,
    sources: { registryFetchedAt: registry.fetchedAt, seriesFetchedAt: series.fetchedAt, registryTokens: registry.tokens.length, checkableTokens: registry.tokens.filter((t) => t.checkable).length },
    solvency: {
      head: { ...slim(headSum), creditsAllUsd: headSum.creditsAllUsd, tokensShort: headSum.tokensShort },
      daily: daily.map(slim),
      full: full.map(slim),
      micro: micro.map((s) => ({ height: s.height, time: s.time, creditsUsd: s.creditsUsd, heldUsd: s.heldUsd, shortfallUsd: s.shortfallUsd, shortfallShare: s.shortfallShare, tokensMaterial: s.tokensMaterial })),
      episode: ep,
      hitToken: hitToken && { assetId: hitToken.assetId, symbol: hitToken.symbol, blockchain: hitToken.blockchain },
      hitSeries,
      readings: { head: 1, daily: daily.length, full: full.length, micro: micro.length, total: 1 + daily.length + full.length + micro.length },
      tokenChecks: [headSum, ...daily, ...full, ...micro].reduce((n, s) => n + s.tokensChecked, 0),
      sinceFix: { from: INCIDENT.cleanFrom, readings: since.length, material: since.filter((s) => s.tokensMaterial > 0).length, maxShortfallUsd: since.reduce((m, s) => Math.max(m, s.shortfallUsd), 0) },
      firstReading: [...daily, ...full, ...micro].sort(byHeight)[0]?.time ?? head.time,
    },
    economics: econ,
    valuation,
    retention,
    pause,
    incident: INCIDENT,
    model,
    kill,
    killSummary: { holds: kill.filter((k) => k.status === 'holds').length, triggered: kill.filter((k) => k.status === 'triggered').length, notMeasured: kill.filter((k) => k.status === 'not measured').length, total: kill.length },
  };
}

export { addDays };
