// The dashboard: one static HTML file built from results. No framework.
// CSS and browser script live beside this file and are inlined.

import { readFileSync } from 'node:fs';
import { lineChart, usd, pct } from './charts.mjs';
import { windowSum, addDays } from './metrics.mjs';
import { PRIMARY } from './rpc.mjs';
import { MARK, FONTS } from './landing.mjs';

const CSS = readFileSync(new URL('./page.css', import.meta.url), 'utf8');
const JS = readFileSync(new URL('./page-client.js', import.meta.url), 'utf8');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const embed = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const ms = (iso) => Date.parse(iso.length === 10 ? iso + 'T00:00:00Z' : iso);

const STATUS = {
  holds: ['holds', '✓', 'Holds'],
  triggered: ['triggered', '✕', 'Triggered'],
  'not measured': ['pending', '–', 'Not measured'],
};
const chip = (status) => { const [cls, icon, label] = STATUS[status]; return `<span class="status ${cls}"><i aria-hidden="true">${icon}</i>${label}</span>`; };

const query = (label, text) => `<details><summary>${esc(label)}</summary><pre>${esc(text)}</pre></details>`;

// A JSON-RPC view call as a curl line anyone can paste.
function curl(account, method, args, block) {
  const body = { jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', account_id: account, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'), block_id: block } };
  return `curl -s ${PRIMARY} -H 'content-type: application/json' \\\n  -d '${JSON.stringify(body)}'`;
}

// Daily points [timeMs, value] for the `days` days ending at `asOf`.
function dailyPoints(asOf, days, fn) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(asOf, -i);
    const v = fn(d);
    if (v !== null && v !== undefined && !Number.isNaN(v)) out.push([ms(d), v]);
  }
  return out;
}

export function renderPage(r, n, data) {
  const s = r.solvency, e = r.economics, ep = s.episode, m = r.model, series = data.series;

  // ---------- chart data ----------
  const hit = s.hitSeries;
  const exploitChart = hit.length > 1 ? lineChart({
    id: 'chart-exploit',
    title: `${n.ep_token}: credited to users against held by the contract`,
    subtitle: `Whole tokens, ${hit[0].time.slice(0, 10)} to ${hit.at(-1).time.slice(0, 10)}, one reading about every 30 minutes (${hit.length} readings)`,
    series: [
      { name: 'Credited to users (intents.near ledger)', slot: 1, points: hit.map((p) => [ms(p.time), p.credits]) },
      { name: 'Held by intents.near (token contract)', slot: 2, points: hit.map((p) => [ms(p.time), p.held]) },
    ],
    format: 'compact',
    events: [{ t: ms('2026-10-01T08:33:00Z'), label: 'Paused 08:33 (official)' }, { t: ms('2026-10-02T20:31:00Z'), label: 'Fix deployed 20:31 (official)' }],
    tableEvery: 6,
    source: 'Source: NEAR mainnet state at each block, read from a public archival node. Event times are from the official postmortem.',
  }) : '<p class="meta">The exploit-week readings are not in this build.</p>';

  const yearPoints = [...s.daily, ...s.full, s.head].map((x) => [ms(x.time), x.shortfallUsd]).sort((a, b) => a[0] - b[0]);
  const yearChart = lineChart({
    id: 'chart-year',
    title: 'Shortfall across every token checked',
    subtitle: `US dollars owed to users but not held, ${s.daily.length + s.full.length + 1} readings from ${n.first_reading_date} to ${s.head.time.slice(0, 10)}`,
    series: [{ name: 'Shortfall (USD)', slot: 2, points: yearPoints }],
    format: 'usd',
    area: true,
    events: [{ t: ms('2026-10-07T00:00:00Z'), label: 'Feature removed 7 Oct (official)' }],
    source: 'Source: NEAR mainnet state at UTC midnight blocks. Token amounts are valued at the prices in data/raw/registry.json.',
  });

  const span = 420;
  const volChart = lineChart({
    id: 'chart-volume',
    title: 'NEAR Intents volume, trailing 30 days',
    subtitle: 'US dollars swapped through Intents in the 30 days ending each day',
    series: [{ name: 'Intents volume (30d)', slot: 1, points: dailyPoints(r.asOf, span, (d) => { const w = windowSum(series.intentsVolumeUsd, d, 30); return w.missing ? null : w.sum; }) }],
    format: 'usd',
    area: true,
    tableEvery: 14,
    source: 'Source: DefiLlama, quoted (not recomputed here).',
  });
  const txChart = lineChart({
    id: 'chart-tx',
    title: 'NEAR base-layer transactions, 30-day average',
    subtitle: 'Transactions per day on NEAR mainnet',
    series: [{ name: 'Transactions per day (30d mean)', slot: 1, points: dailyPoints(r.asOf, span, (d) => { const w = windowSum(series.near, d, 30, (x) => x.txns); return w.missing ? null : w.sum / 30; }) }],
    format: 'compact',
    area: true,
    tableEvery: 14,
    source: 'Source: NearBlocks, quoted (not recomputed here).',
  });
  const covChart = lineChart({
    id: 'chart-coverage',
    title: 'Captured revenue as a share of new NEAR supply',
    subtitle: 'Revenue NEAR captured from Intents (30 days, annualised) divided by the dollar value of the NEAR issued over the previous 365 days',
    series: [{ name: 'Coverage of issuance', slot: 3, points: dailyPoints(r.asOf, 400, (d) => {
      const rev = windowSum(series.intentsRevenueUsd, d, 30);
      const now = series.near[d], then = series.near[addDays(d, -365)];
      if (rev.missing || !now || !then) return null;
      const issued = (now.totalSupplyNear - then.totalSupplyNear) * now.priceUsd;
      return issued > 0 ? (rev.sum * (365 / 30)) / issued : null;
    }) }],
    format: 'pct',
    area: true,
    tableEvery: 14,
    source: 'Source: revenue from DefiLlama; supply and price from NearBlocks. Both quoted.',
  });

  // ---------- small blocks ----------
  const killRows = r.kill.map((k, i) => `<tr><td><strong>${k.id}</strong> ${esc(k.title)}</td><td>${esc(k.rule)}</td><td class="num">${esc(n[`k${i + 1}_value`])}</td><td>${chip(k.status)}</td></tr>`).join('');

  const gridTable = m ? `<div class="tablewrap"><table>
<thead><tr><th>Loss events a year</th><th>Fully recovered</th><th>Half recovered</th><th>Nothing recovered</th></tr></thead>
<tbody>${m.grid.map((row) => `<tr><td>${row.lambda.toFixed(2)} (${row.label === 'observed' ? 'observed rate' : row.label === 'low' ? 'low end of 90% interval' : 'high end of 90% interval'})</td>${row.cells.map((c) => `<td>${usd(c.expectedAnnualCost, 2)} <span class="meta">(${pct(c.drag, 1)})</span></td>`).join('')}</tr>`).join('')}</tbody>
</table></div>` : '';

  const timeline = `<div class="tablewrap"><table class="plain">
<thead><tr><th>When (UTC)</th><th>What the official write-ups say</th></tr></thead>
<tbody>${r.incident.official.map((o) => `<tr><td>${esc(o.when)}</td><td>${esc(o.what)}</td></tr>`).join('')}</tbody>
</table></div>`;

  const measured = ep ? `<div class="tablewrap"><table class="plain">
<thead><tr><th>What the chain shows (this repository)</th><th>Block</th><th>Time (UTC)</th></tr></thead>
<tbody>
<tr><td>Last reading with the token fully backed</td><td>${n.ep_last_clean_block}</td><td>${n.ep_last_clean_time}</td></tr>
<tr><td>First reading with a material shortfall (${n.ep_first_short_usd})</td><td>${n.ep_first_short_block}</td><td>${n.ep_first_short_time}</td></tr>
<tr><td>Largest shortfall: ${n.ep_peak_usd_exact}, ${n.ep_peak_unbacked} of the token's credits unbacked</td><td>${n.ep_peak_block}</td><td>${n.ep_peak_time}</td></tr>
<tr><td>Last reading still short</td><td>${n.ep_last_short_block}</td><td>${n.ep_last_short_time}</td></tr>
<tr><td>First reading fully backed again</td><td>${n.ep_first_clean_after_block}</td><td>${n.ep_first_clean_after_time}</td></tr>
</tbody></table></div>` : '';

  const hitTok = s.hitToken ? data.registry.tokens.find((t) => t.assetId === s.hitToken.assetId) : null;
  const exploitQuery = hitTok && ep ? query('The two calls behind this chart (paste to reproduce the peak reading)',
    `# 1. Credited to users: what intents.near's ledger says exists of this token\n${curl('intents.near', 'mt_batch_supply', { token_ids: [hitTok.assetId] }, ep.peak.height)}\n\n# 2. Held: what the token contract says intents.near owns\n${curl(hitTok.contract, 'mt_batch_balance_of', { account_id: 'intents.near', token_ids: [hitTok.tokenId] }, ep.peak.height)}\n\n# Each answer is {"result":{"result":[bytes]}}; the bytes are a JSON array with one\n# number in the token's smallest unit (18 decimals here). Expected at block ${ep.peak.height}:\n#   credited ${n.ep_peak_credits_units}   held ${n.ep_peak_held_units}`) : '';

  const liveTokens = data.registry.tokens.filter((t) => t.checkable).map((t) => [t.assetId, t.symbol, t.blockchain, t.decimals, t.priceUsd, 0]);
  const majors = new Set(data.major?.assetIds ?? []);
  for (const t of liveTokens) if (majors.has(t[0])) t[5] = 1;

  const lambdaMax = m ? Math.max(5, Math.ceil(m.rate.high)) : 5;

  // ---------- views ----------
  const VIEWS = [
    ['overview', 'Verdict'],
    ['check', 'Run the check'],
    ['exploit', 'The exploit'],
    ['history', 'History'],
    ['market', 'Usage & value'],
    ['model', 'Risk model'],
    ['method', 'Method'],
  ];
  const num = (i) => String(i + 1).padStart(2, '0');
  const rail = VIEWS.map(([id, label], i) => `<a href="#${id}" data-view="${id}"><span class="n">${num(i)}</span><span class="t">${esc(label)}</span></a>`).join('');
  const next = (id) => {
    const i = VIEWS.findIndex((v) => v[0] === id);
    const nx = VIEWS[i + 1];
    return nx ? `<a class="next" href="#${nx[0]}"><span class="cap">Next / ${num(i + 1)}</span><span>${esc(nx[1])} <span class="ar">→</span></span></a>` : '';
  };
  const head = (id, title, lede) => {
    const i = VIEWS.findIndex((v) => v[0] === id);
    return `<div class="vhead"><span class="cap">${num(i)} / ${esc(VIEWS[i][1])}</span><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</div>`;
  };
  const GO = ['history', 'market', 'market', 'model'];
  const WHY = ['Every token held in full at each reading since the October fix', 'Intents volume, last 30 days against a year earlier', 'Captured revenue against the value of new supply', 'Expected yearly loss against captured revenue'];
  const condRows = r.kill.map((k, i) => `<a class="crow" href="#${GO[i]}"><span class="id cap">${k.id}</span><span class="ti"><b>${esc(k.title)}</b><span>${esc(WHY[i])}</span></span><span class="va">${esc(n[`k${i + 1}_value`])}</span>${chip(k.status)}</a>`).join('');

  return `<!doctype html>
<html lang="en" data-theme="dark" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Zygostat: the case for NEAR, weighed on chain</title>
<meta name="description" content="A long-term investment thesis for NEAR that anyone can re-run: usage, value capture, and whether NEAR Intents holds what it owes, from public data and NEAR chain state.">
<meta name="theme-color" content="#0c0d0f">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(MARK)}">
${FONTS}
<style>
${CSS}</style>
</head>
<body>
<header class="appbar"><div class="in"><a class="brand" href="index.html">${MARK}Zygostat</a><span class="cap where">Data as of ${esc(r.asOf)} · block ${esc(n.head_block)}</span><span class="sp"></span><a class="home" href="docs.html">Docs</a><a class="home" href="index.html"><span aria-hidden="true">←</span> Home</a></div></header>

<div class="shell">
<nav class="rail" aria-label="Product sections">${rail}<div class="railfoot cap">${esc(`${r.killSummary.holds} of ${r.killSummary.total} conditions hold`)}</div></nav>

<main id="content">

<section class="view" id="overview" aria-labelledby="h-overview">
${head('overview', 'The case for NEAR, weighed on chain.', `NEAR's long-term value now rests on NEAR Intents becoming the place cross-chain money settles. This thesis tests that on three things: is Intents used, does NEAR capture part of what it earns, and does the contract holding users' money actually hold it. Four conditions, set in advance, decide whether the case stands.`).replace('<h1>', '<h1 id="h-overview">')}
<div class="conds" id="kill-summary">${condRows}</div>
<div class="figs4">
<div><span class="cap">Readings taken</span><b>${n.readings_total}</b><span>${n.token_checks} token checks since ${n.first_reading_date}</span></div>
<div><span class="cap">Largest shortfall found</span><b class="neg">${ep ? n.ep_peak_usd : '$0'}</b><span>${ep ? `${esc(n.ep_token)}, ${n.ep_peak_time.slice(0, 10)}` : 'no episode in the readings'}</span></div>
<div><span class="cap">Short since ${n.since_from}</span><b class="pos">${n.since_material} of ${n.since_readings}</b><span>after the vulnerable feature was removed</span></div>
<div><span class="cap">Revenue against new supply</span><b>${n.cov_ann90}</b><span>captured revenue, 90 days annualised</span></div>
</div>
${next('overview')}
</section>

<section class="view" id="check" aria-labelledby="live-h">
${head('check', 'Run the check yourself.', 'Your browser asks a public NEAR node the same two questions this thesis rests on, at the newest block. Nothing passes through a server of ours.')}
<div class="card live" id="live">
<div>
<h3 id="live-h">Share of credited value that is backed</h3>
<div class="hero" id="live-ratio">${((1 - s.head.shortfallShare) * 100).toFixed(2)}%</div>
<p class="meta" id="live-kind">From the last build</p>
<p id="live-state">${s.head.shortfallUsd >= 100 ? 'Shortfall found at this block.' : 'Fully backed at this block: every token checked is held in full.'}</p>
<div class="actions"><button id="live-run" type="button">Re-check now from a public node</button><button id="live-run-all" type="button">Check all ${n.head_tokens} tokens (about 3 minutes)</button></div>
<p class="source">The quick check reads every multi-token balance and the ${majors.size} largest fungible tokens.</p>
</div>
<dl>
<dt>Credited to users</dt><dd id="live-credits">${n.head_credits_exact}</dd>
<dt>Held by the contract</dt><dd id="live-held">${n.head_held_exact}</dd>
<dt>Shortfall</dt><dd id="live-short">${n.head_shortfall}</dd>
<dt>Tokens checked</dt><dd id="live-tokens">${n.head_tokens}</dd>
<dt>Block</dt><dd id="live-block">${n.head_block}</dd>
<dt>Block time</dt><dd id="live-time">${n.head_time}</dd>
</dl>
<script type="application/json" id="live-data">${embed({ tokens: liveTokens })}</script>
</div>
${query('What the check reads', '# For each token, at one block height H:\n#   credits = intents.near :: mt_batch_supply({ token_ids })                   what users are owed\n#   held    = <token contract> :: ft_balance_of({ account_id: "intents.near" })  what is really there\n#           = v2_1.omni.hot.tg :: mt_batch_balance_of(...)                      (multi tokens)\n# shortfall = credits - held, when positive\n# code: src/page-client.js (browser), src/scan.mjs (command line)')}
${next('check')}
</section>

<section class="view" id="exploit" aria-labelledby="h-exploit">
${head('exploit', 'The October exploit, read from chain state.', 'On 1 October 2026 NEAR Intents was exploited for about $3.8M. The official postmortem says the contract recorded deposits that the token contract had refunded, so its ledger showed more than it held. That is a statement about two numbers on a public chain, so it can be checked.').replace('<h1>', '<h1 id="h-exploit">')}
<div class="card">
${exploitChart}
<p class="explain">${ep ? `The two lines should sit on top of each other. From ${n.ep_first_short_time} to ${n.ep_last_short_time} they do not: at the worst reading users were credited ${n.ep_peak_credits_units} tokens while the contract held ${n.ep_peak_held_units}, a gap of ${n.ep_peak_usd_exact}. The gap closes by ${n.ep_first_clean_after_time}.` : ''}</p>
${exploitQuery}
</div>
<div class="two">
<div class="card"><h3>Measured here</h3>${measured}<p class="source">Readings are about 30 minutes apart. The under-backed period lasted between ${n.ep_min_hours} and ${n.ep_max_hours} hours.</p></div>
<div class="card"><h3>Reported officially</h3>${timeline}<p class="source">Quoted from the <a href="${esc(r.incident.postmortemUrl)}">NEAR Intents postmortem</a> and <a href="${esc(r.incident.certikUrl)}">CertiK's analysis</a>. Not measured here.</p></div>
</div>
${next('exploit')}
</section>

<section class="view" id="history" aria-labelledby="h-history">
${head('history', 'A year of readings.', `The same check at UTC midnight blocks: weekly from ${n.first_reading_date}, daily from 20 September 2026. Each reading compares credits with holdings for every multi-token balance and for the largest fungible tokens.`).replace('<h1>', '<h1 id="h-history">')}
<div class="card">
${yearChart}
<p class="explain">${n.history_line} Since ${n.since_from}, ${n.since_material} of ${n.since_readings} readings show a material shortfall.</p>
${query('How each reading is taken', `# For a block height H (the first block at or after 00:00 UTC):\n#   credits = intents.near :: mt_batch_supply({ token_ids })                  at H\n#   held    = <token contract> :: ft_balance_of({ account_id: "intents.near" }) at H   (nep141)\n#           = <multi-token contract> :: mt_batch_balance_of(...)                 at H   (nep245)\n#   shortfall(token) = max(0, credits - held), valued at the registry price\n#\n# Re-run one day yourself (about 30 requests):\nnode src/scan.mjs series 2026-10-02 2026-10-02 1\n\n# Raw readings: data/raw/scan/series/<date>.json   Code: src/scan.mjs, src/metrics.mjs`)}
</div>
${next('history')}
</section>

<section class="view" id="market" aria-labelledby="h-market">
${head('market', 'Usage and value capture.', 'Solvency is a condition, not a reason to own NEAR. The reason would be that Intents is used and that NEAR captures part of what it earns. These charts quote third-party series; the solvency numbers do not depend on them.').replace('<h1>', '<h1 id="h-market">')}
<div class="two">
<div class="card">${volChart}<p class="explain">Intents handled ${n.vol30} in the last 30 days, ${n.vol30_change} against the same 30 days a year earlier.</p>${query('Query', 'GET https://api.llama.fi/summary/dexs/near-intents\n# field: totalDataChart (daily USD volume); summed over 30 days\n# committed copy: data/raw/series.json -> intentsVolumeUsd')}</div>
<div class="card">${txChart}<p class="explain">Base-layer activity moved the other way: ${n.l1_tx} transactions a day now, ${n.l1_tx_change} on a year earlier.</p>${query('Query', 'GET https://api.nearblocks.io/v1/charts\n# field: charts[].txns; mean over 30 days\n# committed copy: data/raw/series.json -> near[date].txns')}</div>
</div>
<div class="card">
${covChart}
<p class="explain">NEAR captured ${n.rev90} from Intents in the last 90 days (${n.rev_ann90} a year at that pace). The network issued ${n.issued_near} NEAR over the last 365 days, worth ${n.issuance_usd} at ${n.price}. Captured revenue covers ${n.cov_ann90} of that.</p>
${query('Query', 'GET https://api.llama.fi/summary/fees/near-intents?dataType=dailyRevenue   # revenue captured by NEAR\nGET https://api.nearblocks.io/v1/charts                                    # total_supply, near_price\n# coverage(day) = revenue(30d) * 365/30 / ((supply(day) - supply(day - 365)) * price(day))\n# code: src/metrics.mjs economics(), src/page.mjs')}
</div>
${next('market')}
</section>

<section class="view" id="model" aria-labelledby="h-model">
${head('model', 'Pricing the risk.', `One exploited loss in ${n.m_exposure_years} years of operation gives a rate of ${n.m_lambda} events a year, with a 90% interval from ${n.m_lambda_low} to ${n.m_lambda_high}. The loss took ${n.m_f} of custody. Every event so far was fully recovered, but one recovery is not a rule. Move the inputs and watch what the next event would cost.`).replace('<h1>', '<h1 id="h-model">')}
${m ? `<div class="card model">
<div>
<div class="field"><label for="m-lambda">Loss events a year</label><output id="m-lambda-out"></output><input id="m-lambda" type="range" min="0" max="${lambdaMax}" step="0.01" value="${m.rate.point.toFixed(2)}"><small>Observed ${n.m_lambda}; 90% interval ${n.m_lambda_low} to ${n.m_lambda_high}</small></div>
<div class="field"><label for="m-rho">Share of a loss recovered</label><output id="m-rho-out"></output><input id="m-rho" type="range" min="0" max="100" step="1" value="50"><small>Observed 100% (one event). Base case assumes half.</small></div>
<div class="field"><label for="m-f">Share of custody lost in one event</label><output id="m-f-out"></output><input id="m-f" type="range" min="0" max="${Math.max(10, Math.ceil(m.inputs.f * 400))}" step="0.01" value="${(m.inputs.f * 100).toFixed(2)}"><small>Observed ${n.m_f} (${n.ep_peak_usd} of ${n.m_custody_then} in custody that day)</small></div>
<div class="field"><label for="m-h">Share of an unrecovered loss paid from captured revenue</label><output id="m-h-out"></output><input id="m-h" type="range" min="0" max="100" step="1" value="100"><small>Assumption. 100% means users are made whole out of the revenue NEAR captures.</small></div>
<button id="m-reset" type="button">Reset to the base case</button>
</div>
<div class="out" id="model-out">
<dl>
<dt>Captured revenue a year (90d annualised)</dt><dd>${n.m_R}</dd>
<dt>Custody today</dt><dd>${n.m_C}</dd>
<dt>Revenue lost to one pause</dt><dd>${n.m_D}</dd>
<dt>Expected security cost a year</dt><dd id="o-cost">${n.m_base_cost}</dd>
<dt>As a share of captured revenue</dt><dd id="o-drag">${n.m_base_drag}</dd>
<dt>Risk-adjusted captured revenue</dt><dd id="o-adj">${n.m_base_adj_rev}</dd>
<dt>Event rate that would consume all of it</dt><dd id="o-break">${n.m_breakeven} a year</dd>
<dt>One event costs</dt><dd id="o-months">${n.m_event_months} months</dd>
</dl>
<p class="source">"One event costs" is in months of captured revenue.</p>
</div>
<script type="application/json" id="model-data">${embed({ R: m.inputs.R, C: m.inputs.C, D: m.inputs.D })}</script>
</div>
<div class="card"><h3>Expected security cost a year, by scenario</h3><p class="meta">Dollar cost, with its share of captured revenue in brackets. Loss size fixed at the observed share of custody.</p>${gridTable}
${query('Formula', 'gross loss per event = f * C\nnet cost per event   = gross loss * (1 - recovered) * h + D\nexpected cost a year = events a year * net cost per event\n\nR = captured revenue a year      C = custody (credits, USD)     f = share of custody lost\nD = revenue lost to one pause    h = share of an unrecovered loss paid from captured revenue\n\ncode: src/model.mjs (riskAdjusted, poissonRate)   tests: test/unit.test.mjs')}</div>` : '<p class="meta">The model needs the exploit-week readings, which are not in this build.</p>'}
${next('model')}
</section>

<section class="view" id="method" aria-labelledby="h-method">
${head('method', 'What would change the thesis.', 'Four conditions, each a number recomputed on every build. The thresholds were written on 2026-11-13 after a first look at the data, so today they describe the past. They bind on every later rebuild.').replace('<h1>', '<h1 id="h-method">')}
<div class="card tablewrap" id="kill"><table class="plain">
<thead><tr><th>Condition</th><th>Rule</th><th class="num">Now</th><th>Status</th></tr></thead>
<tbody>${killRows}</tbody>
</table></div>
<h2 id="limits">Limits</h2>
<ul class="clean">
<li>The check covers the ${n.checkable_tokens} tokens on the NEAR Intents 1Click list that have a token contract on NEAR. Another ${n.uncheckable_tokens} listed assets have none and cannot be checked this way. Tokens held by the contract but not on the list, and NFTs, are not checked.</li>
<li>It proves the NEAR side only: that intents.near holds the NEAR-side tokens it credits. It does not prove that each bridged token is backed on its origin chain.</li>
<li>Confidential balances are not visible on the public ledger and are outside this check.</li>
<li>Historical readings are spaced (weekly, daily, or 30 minutes apart). A shortfall that opened and closed between two readings would not appear.</li>
<li>Dollar values use one price per token, taken on ${n.registry_date}. Token amounts are exact; the dollar totals for past dates are approximate.</li>
<li>Volume, fees, revenue, supply and activity are quoted from DefiLlama and NearBlocks, not recomputed.</li>
<li>The event rate rests on a single exploited loss. The interval around it is wide, and the model shows that width instead of hiding it.</li>
</ul>
<p class="source end">Every number in this product is produced by <code>node src/build.mjs</code> from the raw data committed in <code>data/raw/</code>. The full argument is in THESIS.md. Built at NEAR HACKATHON, Investment Thesis track. Research, not financial advice.</p>
</section>

</main>
</div>
<script>
${JS}</script>
</body>
</html>
`;
}
