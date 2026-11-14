// Rebuild every output from the committed raw data. No network, no clock.
//
//   node src/build.mjs           write out/results.json, THESIS.md, docs/index.html and the README results block
//   node src/build.mjs --check   rebuild in memory and fail if any committed output differs
//
// Raw data in:  data/raw/registry.json, data/raw/series.json, data/raw/scan/**
// Outputs:      out/results.json   every number, with nothing rounded
//               THESIS.md          from src/thesis.tmpl.md
//               docs/index.html    the dashboard
//               README.md          only the block between the results markers

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile, writeFile, readdir, mkdir, access } from 'node:fs/promises';
import { compute } from './results.mjs';
import { usd, pct, signedPct, full, compact } from './charts.mjs';
import { renderPage } from './page.mjs';
import { renderLanding } from './landing.mjs';
import { renderDocs } from './docs.mjs';

const ROOT = new URL('../', import.meta.url);
const RAW = new URL('data/raw/', ROOT);
const exists = (u) => access(u).then(() => true, () => false);
const json = async (u) => JSON.parse(await readFile(u, 'utf8'));

async function readings(dir) {
  const d = new URL(`scan/${dir}/`, RAW);
  if (!(await exists(d))) return [];
  const names = (await readdir(d)).filter((n) => n.endsWith('.json')).sort();
  return Promise.all(names.map((n) => json(new URL(n, d))));
}

export async function load() {
  return {
    registry: await json(new URL('registry.json', RAW)),
    series: await json(new URL('series.json', RAW)),
    major: await json(new URL('major.json', RAW)),
    head: await json(new URL('scan/head/latest.json', RAW)),
    seriesReadings: await readings('series'),
    microReadings: await readings('micro'),
    refineReadings: await readings('refine'),
    fullReadings: await readings('full'),
  };
}

// ---------- formatted numbers for the templates ----------

const utc = (iso) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const NM = 'not measured';
const STATUS = { holds: 'HOLDS', triggered: 'TRIGGERED', 'not measured': 'NOT MEASURED' };

export function numbers(r) {
  const s = r.solvency, e = r.economics, ep = s.episode, m = r.model;
  const n = {
    as_of: r.asOf,
    registry_tokens: full(r.sources.registryTokens),
    checkable_tokens: full(r.sources.checkableTokens),
    uncheckable_tokens: full(r.sources.registryTokens - r.sources.checkableTokens),
    registry_date: r.sources.registryFetchedAt.slice(0, 10),
    series_date: r.sources.seriesFetchedAt.slice(0, 10),

    head_block: full(s.head.height),
    head_time: utc(s.head.time),
    head_tokens: full(s.head.tokensChecked),
    head_credits: usd(s.head.creditsUsd, 2),
    head_held: usd(s.head.heldUsd, 2),
    head_credits_exact: `$${full(s.head.creditsUsd)}`,
    head_held_exact: `$${full(s.head.heldUsd)}`,
    head_shortfall: `$${full(s.head.shortfallUsd)}`,
    head_surplus: `$${full(s.head.surplusUsd)}`,
    head_tokens_short: full(s.head.tokensShort),

    readings_total: full(s.readings.total),
    readings_daily: full(s.readings.daily),
    readings_micro: full(s.readings.micro),
    readings_full: full(s.readings.full),
    token_checks: full(s.tokenChecks),
    first_reading_date: s.firstReading.slice(0, 10),
    since_from: s.sinceFix.from,
    since_readings: full(s.sinceFix.readings),
    since_material: full(s.sinceFix.material),
    since_max_shortfall: `$${full(s.sinceFix.maxShortfallUsd)}`,

    ep_token: ep ? `${s.hitToken.symbol} on ${s.hitToken.blockchain.toUpperCase()}` : NM,
    ep_token_id: ep ? s.hitToken.assetId : NM,
    ep_last_clean_time: ep?.lastCleanBefore ? utc(ep.lastCleanBefore.time) : NM,
    ep_last_clean_block: ep?.lastCleanBefore ? full(ep.lastCleanBefore.height) : NM,
    ep_first_short_time: ep ? utc(ep.firstShort.time) : NM,
    ep_first_short_block: ep ? full(ep.firstShort.height) : NM,
    ep_first_short_usd: ep ? usd(ep.firstShort.shortfallUsd, 2) : NM,
    ep_peak_usd: ep ? usd(ep.peak.shortfallUsd, 2) : NM,
    ep_peak_usd_exact: ep ? `$${full(ep.peak.shortfallUsd)}` : NM,
    ep_peak_time: ep ? utc(ep.peak.time) : NM,
    ep_peak_block: ep ? full(ep.peak.height) : NM,
    ep_peak_unbacked: ep ? pct(ep.peak.worst.unbackedShare, 1) : NM,
    ep_peak_credits_units: ep ? full(ep.peak.worst.creditsUnits) : NM,
    ep_peak_held_units: ep ? full(ep.peak.worst.heldUnits) : NM,
    ep_last_short_time: ep ? utc(ep.lastShort.time) : NM,
    ep_last_short_block: ep ? full(ep.lastShort.height) : NM,
    ep_first_clean_after_time: ep?.firstCleanAfter ? utc(ep.firstCleanAfter.time) : NM,
    ep_first_clean_after_block: ep?.firstCleanAfter ? full(ep.firstCleanAfter.height) : NM,
    ep_min_hours: ep ? full(ep.minHours, 1) : NM,
    ep_max_hours: ep?.maxHours != null ? full(ep.maxHours, 1) : NM,
    ep_readings_short: ep ? full(ep.readingsShort) : NM,

    price: `$${e.priceUsd.toFixed(2)}`,
    year_ago: e.yearAgo,
    vol30: usd(e.intents.volume30dUsd, 2),
    vol30_prev: usd(e.intents.volume30dYearAgoUsd, 2),
    vol30_change: signedPct(e.intents.volume30dChange),
    vol365: usd(e.intents.volume365dUsd, 1),
    fees30: usd(e.intents.fees30dUsd, 2),
    fees365: usd(e.intents.fees365dUsd, 1),
    fee_rate_bps: (e.intents.feeRate30d * 1e4).toFixed(1),
    rev30: usd(e.intents.revenue30dUsd, 2),
    rev90: usd(e.intents.revenue90dUsd, 2),
    rev365: usd(e.intents.revenue365dUsd, 2),
    rev_ann30: usd(e.intents.revenueAnnualised30dUsd, 1),
    rev_ann90: usd(e.intents.revenueAnnualised90dUsd, 1),
    capture_share: pct(e.intents.captureShare30d, 1),
    l1_tx: compact(e.l1.txnsPerDay30d, 2),
    l1_tx_prev: compact(e.l1.txnsPerDay30dYearAgo, 2),
    l1_tx_change: signedPct(e.l1.txnsChange),
    l1_acc: compact(e.l1.activeAccounts30d, 1),
    l1_acc_prev: compact(e.l1.activeAccounts30dYearAgo, 1),
    l1_acc_change: signedPct(e.l1.activeAccountsChange),
    l1_fees30: usd(e.l1.fees30dUsd, 1),
    intents_fee_multiple: `${e.l1.intentsFeesMultiple.toFixed(0)}x`,
    supply_total: compact(e.supply.totalNear, 2),
    issued_near: compact(e.supply.issuedNear365d, 2),
    inflation: pct(e.supply.inflation365d, 2),
    issuance_usd: usd(e.supply.issuanceUsd365d, 1),
    cov_ann30: pct(e.supply.revenueCoverage30dAnnualised, 1),
    cov_ann90: pct(e.supply.revenueCoverage90dAnnualised, 1),
    cov_365: pct(e.supply.revenueCoverage365d, 1),

    all_near_usd: usd(r.valuation.allNearUsd, 2),
    rev_yield: pct(r.valuation.revenueYield90dAnnualised, 2),
    net_dilution_usd: usd(e.supply.issuanceUsd365d - e.intents.revenueAnnualised90dUsd, 1),
    retention_before: usd(r.retention.volume30dBeforeUsd, 2),
    retention_before_to: r.retention.beforeTo,
    retention_change: signedPct(r.retention.change),

    pause_from: r.pause.from,
    pause_to: r.pause.to,
    pause_baseline: `${r.pause.baselineFrom} to ${r.pause.baselineTo}`,
    pause_volume: usd(r.pause.during.volume, 1),
    pause_volume_base: usd(r.pause.baseline.volume, 1),
    pause_volume_change: signedPct(r.pause.volumeChange, 1),
    pause_fees_lost: usd(r.pause.feesLostUsd, 2),

    m_R: m ? usd(m.inputs.R, 1) : NM,
    m_C: m ? usd(m.inputs.C, 1) : NM,
    m_f: m ? pct(m.inputs.f, 2) : NM,
    m_custody_then: m?.custodyOnPeakDayUsd ? usd(m.custodyOnPeakDayUsd, 1) : NM,
    m_loss_per_event: m ? usd(m.base.grossLossPerEvent, 2) : NM,
    m_D: m ? usd(m.inputs.D, 2) : NM,
    m_lambda: m ? m.rate.point.toFixed(2) : NM,
    m_lambda_low: m ? m.rate.low.toFixed(2) : NM,
    m_lambda_high: m ? m.rate.high.toFixed(2) : NM,
    m_exposure_years: m ? m.rate.years.toFixed(2) : NM,
    m_exposure_from: m ? m.exposureFrom : NM,
    m_base_cost: m ? usd(m.base.expectedAnnualCost, 2) : NM,
    m_base_drag: m ? pct(m.base.drag, 1) : NM,
    m_base_adj_rev: m ? usd(m.base.riskAdjustedRevenue, 1) : NM,
    m_breakeven: m ? m.base.breakEvenLambda.toFixed(1) : NM,
    m_event_months: m ? (m.base.yearsOfRevenuePerEvent * 12).toFixed(1) : NM,

    v_usage: e.intents.volume30dChange >= 0 ? 'Usage is growing.' : 'Usage is shrinking.',
    v_capture: e.supply.revenueCoverage90dAnnualised < 1 ? 'Value capture is real but small.' : 'Value capture exceeds dilution.',
    v_capture_tail: e.supply.revenueCoverage90dAnnualised < 1 ? 'Holders are still being diluted.' : 'Captured revenue now exceeds the value of new supply.',
    v_solvent: s.head.tokensShort > 0 && s.head.shortfallUsd >= 100 ? 'The contract is short now.' : 'The contract is solvent now.',
    v_risk: m && m.base.drag <= 0.25 ? 'The risk is affordable at the observed rate, and that rate is uncertain.' : 'The risk is not affordable at the observed rate.',
    dilution_line: e.supply.revenueCoverage90dAnnualised < 1
      ? `Until captured revenue at least matches the value of new issuance, a NEAR holder is paying for security with dilution; today Intents offsets ${pct(e.supply.revenueCoverage90dAnnualised, 1)} of it.`
      : 'Captured revenue now exceeds the value of new issuance, so Intents more than offsets dilution at today\'s price.',
    rate_line: m ? `${m.grid[1].cells[1].drag <= 0.25 ? 'The thesis survives the middle of that range' : 'The thesis is strained even in the middle of that range'} and ${m.grid[2].cells[2].drag <= 0.25 ? 'holds even at the top of it' : 'is strained at the top of it'}.` : '',
    history_line: s.otherMaterial === 0 ? 'Apart from the October exploit, no reading shows a material shortfall.' : `Apart from the October exploit, ${full(s.otherMaterial)} reading(s) show a material shortfall.`,
    head_state: s.head.shortfallUsd >= 100 ? 'At that block the contract held less than it owed.' : 'The contract holds slightly more than it owes, which is normal: people sometimes send tokens to it directly.',
    head_brief: s.head.shortfallUsd >= 100 ? 'the contract holding users\' money is short' : 'the contract holding users\' money holds every token it owes',
    kill_holds: full(r.killSummary.holds),
    kill_triggered: full(r.killSummary.triggered),
    kill_not_measured: full(r.killSummary.notMeasured),
    kill_total: full(r.killSummary.total),
    k1_status: STATUS[r.kill[0].status], k1_value: r.kill[0].display,
    k2_status: STATUS[r.kill[1].status], k2_value: signedPct(r.kill[1].value),
    k3_status: STATUS[r.kill[2].status], k3_value: pct(r.kill[2].value, 1),
    k4_status: STATUS[r.kill[3].status], k4_value: r.kill[3].value === null ? NM : pct(r.kill[3].value, 1),
  };
  if (m) {
    for (const row of m.grid) for (const c of row.cells) {
      const k = `g_${row.label}_${Math.round(c.rho * 100)}`;
      n[`${k}_cost`] = usd(c.expectedAnnualCost, 2);
      n[`${k}_drag`] = pct(c.drag, 1);
    }
  } else {
    for (const l of ['low', 'observed', 'high']) for (const p of [100, 50, 0]) { n[`g_${l}_${p}_cost`] = NM; n[`g_${l}_${p}_drag`] = NM; }
  }
  return n;
}

// Replace {{key}} with n[key]; an unknown key is an error, never a blank.
export function fill(template, n) {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, k) => {
    if (!(k in n)) throw new Error(`template uses unknown number {{${k}}}`);
    return n[k];
  });
}

const START = '<!-- results:start -->', END = '<!-- results:end -->';
export function spliceReadme(readme, block) {
  const a = readme.indexOf(START), b = readme.indexOf(END);
  if (a === -1 || b === -1) throw new Error('README.md is missing the results markers');
  return `${readme.slice(0, a + START.length)}\n${block.trim()}\n${readme.slice(b)}`;
}

export async function build() {
  const data = await load();
  const results = compute(data);
  const n = numbers(results);
  const thesis = fill(await readFile(new URL('src/thesis.tmpl.md', ROOT), 'utf8'), n);
  const page = renderPage(results, n, data);
  const landing = renderLanding(results, n);
  const docs = renderDocs(results, n);
  const readme = spliceReadme(await readFile(new URL('README.md', ROOT), 'utf8'), fill(await readFile(new URL('src/readme-results.tmpl.md', ROOT), 'utf8'), n));
  return {
    results,
    files: {
      'out/results.json': JSON.stringify(results, null, 1) + '\n',
      'THESIS.md': thesis,
      'docs/index.html': landing,
      'docs/app.html': page,
      'docs/docs.html': docs,
      'README.md': readme,
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { results, files } = await build();
  if (process.argv.includes('--check')) {
    let bad = 0;
    for (const [name, text] of Object.entries(files)) {
      const onDisk = (await exists(new URL(name, ROOT))) ? await readFile(new URL(name, ROOT), 'utf8') : null;
      const same = onDisk === text;
      console.log(`${same ? 'PASS' : 'FAIL'}  ${name} ${same ? 'matches a fresh rebuild' : 'differs from a fresh rebuild (run: node src/build.mjs)'}`);
      if (!same) bad++;
    }
    process.exit(bad ? 1 : 0);
  }
  await mkdir(new URL('out/', ROOT), { recursive: true });
  await mkdir(new URL('docs/', ROOT), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(new URL(name, ROOT), text);
  const s = results.solvency;
  console.log(`built from ${s.readings.total} readings (${s.tokenChecks.toLocaleString('en-US')} token checks), series as of ${results.asOf}`);
  for (const k of results.kill) console.log(`${k.id} ${k.title}: ${k.status}`);
}
