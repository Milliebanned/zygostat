// The Docs page (docs/docs.html): everything the product does, in plain
// language, for anyone. Every number comes from the build.

import { readFileSync } from 'node:fs';
import { MARK, FONTS } from './landing.mjs';

const BASE = readFileSync(new URL('./landing.css', import.meta.url), 'utf8');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
.docs { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: clamp(32px, 5vw, 80px); padding-top: clamp(40px, 6vw, 80px); padding-bottom: 120px; }
.toc { position: sticky; top: 96px; align-self: start; max-height: calc(100vh - 120px); overflow: auto; }
.toc p { margin: 0 0 14px; }
.toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; counter-reset: s; }
.toc a { display: grid; grid-template-columns: 30px 1fr; padding: 6px 0; font-size: 14px; color: var(--bone-2); text-decoration: none; border-left: 0; }
.toc a span { font-family: var(--mono); font-size: 12px; color: var(--bone-3); padding-top: 2px; }
.toc a:hover, .toc a.on { color: var(--bone); }
.toc a.on span { color: var(--brass); }
.toc details summary { display: none; }
article { max-width: 72ch; min-width: 0; }
article .lead { font-size: clamp(17px, 1.5vw, 20px); color: var(--bone-2); margin: 24px 0 0; }
article h1 { font-size: clamp(40px, 5.4vw, 76px); }
article h2 { font-family: var(--display); font-stretch: 125%; font-weight: 500; letter-spacing: -0.03em; font-size: clamp(26px, 2.8vw, 36px); margin: 80px 0 18px; padding-top: 24px; border-top: 1px solid var(--rule); scroll-margin-top: 88px; }
article h2 .n { display: block; font: 12px var(--mono); color: var(--brass); letter-spacing: 0.02em; margin-bottom: 10px; }
article h3 { font-family: var(--display); font-stretch: 112%; font-weight: 500; letter-spacing: -0.02em; font-size: 19px; margin: 36px 0 10px; }
article p, article li { color: var(--bone-2); font-size: 16.5px; line-height: 1.7; }
article p { margin: 0 0 16px; }
article strong { color: var(--bone); font-weight: 500; }
article ul, article ol { padding-left: 20px; margin: 0 0 18px; }
article li { margin-bottom: 6px; }
article a { color: var(--bone); text-underline-offset: 3px; }
article a:hover { color: var(--brass-hi); }
article code { font-family: var(--mono); font-size: 0.86em; color: var(--bone); background: rgba(236, 235, 230, 0.06); padding: 1px 5px; }
article pre { font: 13px/1.6 var(--mono); color: var(--bone); background: var(--ink-2); border: 1px solid var(--rule); border-left: 2px solid var(--brass); padding: 16px; overflow-x: auto; margin: 0 0 20px; }
article pre code { background: none; padding: 0; font-size: 1em; }
.t { width: 100%; border-collapse: collapse; margin: 6px 0 24px; font-size: 15px; }
.t th, .t td { text-align: left; vertical-align: top; padding: 11px 14px 11px 0; border-bottom: 1px solid var(--rule); color: var(--bone-2); }
.t th { font: 500 12px var(--mono); color: var(--bone-3); letter-spacing: 0.02em; border-bottom-color: var(--bone); }
.t td:first-child { color: var(--bone); }
.t td.n { font-family: var(--mono); text-align: right; white-space: nowrap; color: var(--bone); }
.tw { overflow-x: auto; }
.callout { border-left: 2px solid var(--brass); padding: 4px 0 4px 18px; margin: 0 0 22px; }
.callout p { color: var(--bone); margin: 0; }
.mast .on { color: var(--bone); }
@media (max-width: 920px) {
  .docs { grid-template-columns: 1fr; gap: 24px; padding-top: 24px; }
  .toc { position: static; max-height: none; border: 1px solid var(--rule); padding: 0 16px; }
  .toc details summary { display: block; cursor: pointer; padding: 14px 0; font: 13px var(--mono); color: var(--bone-2); }
  .toc details[open] summary { border-bottom: 1px solid var(--rule); margin-bottom: 8px; }
  .toc > p { display: none; }
  .toc ol { padding-bottom: 12px; }
}
`;

export function renderDocs(r, n) {
  const k = r.killSummary, m = r.model, ep = r.solvency.episode;
  const S = [
    ['what', 'What Zygostat is'],
    ['thesis', 'The thesis in one minute'],
    ['conditions', 'The four conditions'],
    ['solvency', 'How the solvency check works'],
    ['exploit', 'The October exploit'],
    ['history', 'A year of readings'],
    ['market', 'Usage and value capture'],
    ['model', 'The risk model'],
    ['product', 'Using the product'],
    ['verify', 'Check it yourself'],
    ['data', 'Data sources'],
    ['limits', 'What it does not measure'],
    ['glossary', 'Glossary'],
    ['faq', 'Questions'],
  ];
  const num = (id) => String(S.findIndex((s) => s[0] === id) + 1).padStart(2, '0');
  const h2 = (id) => `<h2 id="${id}"><span class="n">${num(id)}</span>${esc(S.find((s) => s[0] === id)[1])}</h2>`;
  const toc = S.map(([id, t], i) => `<li><a href="#${id}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(t)}</a></li>`).join('');
  const kill = r.kill.map((c, i) => `<tr><td>${c.id} ${esc(c.title)}</td><td>${esc(c.rule)}</td><td class="n">${esc(n[`k${i + 1}_value`])}</td><td class="n">${c.status === 'holds' ? 'Holds' : c.status === 'triggered' ? 'Triggered' : 'Not measured'}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Zygostat docs</title>
<meta name="description" content="How Zygostat works: the NEAR investment thesis, its four conditions, the solvency check, the data, the risk model, and how to check every number yourself.">
<meta name="theme-color" content="#0c0d0f">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(MARK)}">
${FONTS}
<style>
${BASE}
${CSS}</style>
</head>
<body>

<header class="mast">
<div class="wrap">
<a class="brand" href="index.html">${MARK}Zygostat</a>
<nav aria-label="Site"><a href="index.html#evidence">Evidence</a><a href="index.html#verdict">Verdict</a><a class="on" href="docs.html" aria-current="page">Docs</a></nav>
<span class="sp"></span>
<a class="mlink" href="docs.html">Docs</a>
<span class="mono date">Data as of ${esc(n.as_of)}</span>
<a class="btn solid small" href="app.html">Launch <span class="ar">→</span></a>
</div>
</header>

<div class="wrap docs">
<nav class="toc" aria-label="On this page">
<p class="cap">Docs</p>
<details open><summary>Contents</summary><ol>${toc}</ol></details>
</nav>

<article>
<p class="cap" style="color:var(--brass)">Documentation</p>
<h1 class="display">How Zygostat works.</h1>
<p class="lead">Everything the product does, in plain language: the investment thesis, the evidence behind it, how each number is produced, and how to check any of it yourself. No background in blockchains is assumed.</p>

${h2('what')}
<p>Zygostat is a long-term investment thesis for NEAR, built so that anyone can re-run it. It asks whether NEAR is worth holding over the long term, answers with evidence, and states in advance the results that would prove the answer wrong.</p>
<p>It has three parts:</p>
<ul>
<li><strong>The thesis</strong>: a written argument (<code>THESIS.md</code>) with a claim, a verdict, the evidence for it, the evidence against it, and four conditions that would end it.</li>
<li><strong>The evidence</strong>: data read directly from the NEAR blockchain and from public market data, saved in the repository so every number can be traced and rebuilt.</li>
<li><strong>The product</strong>: this website. The landing page summarises the thesis, and the product (<a href="app.html">Launch</a>) lets you explore every piece of evidence and run the main check yourself, live.</li>
</ul>
<p>The name is Greek: <em>zygos</em>, the beam of a scale, and <em>statos</em>, standing. The mark is a <em>symbolon</em>: in ancient Greece a token was broken in two, and a claim was proven when the two halves matched. That is what Zygostat checks: what is owed on one side, what is held on the other.</p>

${h2('thesis')}
<p>NEAR's base layer is shrinking while NEAR Intents, its cross-chain swap and settlement service, is growing fast. Intents is now the part of NEAR that earns meaningful money for the token. So the long-term case for NEAR is a bet that Intents becomes a place where cross-chain money settles, and stays one.</p>
<div class="callout"><p>Today ${esc(`${k.holds} of ${k.total}`)} conditions hold. Intents handled ${esc(n.vol30)} in 30 days (${esc(n.vol30_change)} on a year earlier), NEAR captures about ${esc(n.rev_ann90)} a year from it, and the contract holding users' money holds every token it owes.</p></div>
<p>The case is conditional. Usage is real and growing. Value capture is real but small: captured revenue covers ${esc(n.cov_ann90)} of the value of the new NEAR issued each year, so holders are still diluted. And the contract that holds users' funds failed once, on 1 October 2026, when it owed ${esc(n.ep_peak_usd)} more of one token than it held. Zygostat measures that risk directly and prices it.</p>

${h2('conditions')}
<p>A price is not evidence. Instead of arguing from conviction, the thesis names four results that would end it. Every build of the project recomputes all four from raw data. A condition that fails is printed as <strong>Triggered</strong>; it is never explained away.</p>
<div class="tw"><table class="t"><thead><tr><th>Condition</th><th>The rule</th><th>Now</th><th>Status</th></tr></thead><tbody>${kill}</tbody></table></div>
<p>The thresholds were written on 13 November 2026, after a first look at the data. That means they describe the past today; from the next rebuild on, they are real tests.</p>
<h3>Why these four</h3>
<ul>
<li><strong>K1 Solvency</strong>: a settlement layer that can owe more than it holds is not worth building on. This is the condition only chain data can test.</li>
<li><strong>K2 Usage</strong>: if people stop using Intents, nothing else matters.</li>
<li><strong>K3 Value capture</strong>: usage is only worth something to a NEAR holder if part of the revenue reaches NEAR.</li>
<li><strong>K4 Security cost</strong>: if the expected cost of the next loss eats most of that revenue, the growth is not worth owning.</li>
</ul>

${h2('solvency')}
<p>NEAR Intents keeps users' money in one smart contract, <code>intents.near</code>. That contract keeps its own ledger of who owns what. The tokens themselves live in other contracts, one per token. So for every token there are two numbers on the public blockchain that should always agree:</p>
<ol>
<li><strong>Credits</strong>: what <code>intents.near</code>'s ledger says its users own of a token.</li>
<li><strong>Holdings</strong>: what that token's own contract says <code>intents.near</code> actually holds.</li>
</ol>
<p>If credits are larger than holdings, users are owed tokens that are not there. Zygostat calls the difference the <strong>shortfall</strong>. A shortfall counts as <strong>material</strong> when it is worth at least $100 and is at least 0.01% of that token's credits; smaller gaps are still recorded.</p>
<p>Both numbers can be read for any block in the chain's history, so the check can be run today and also backwards in time. Zygostat reads them from a public archive of NEAR's state, with no account or key. Two kinds of token are checked: ordinary NEAR tokens (NEP-141) and the multi-tokens of the HOT Omni bridge (NEP-245). Comparisons use exact whole numbers, so rounding cannot hide a gap.</p>
<p>The latest reading, at block ${esc(n.head_block)} (${esc(n.head_time)}): ${esc(n.head_tokens)} tokens checked, ${esc(n.head_credits_exact)} credited, ${esc(n.head_held_exact)} held, shortfall ${esc(n.head_shortfall)}. The contract holds slightly more than it owes, which is normal: people sometimes send tokens to it directly.</p>

${h2('exploit')}
<p>On 1 October 2026 NEAR Intents was exploited for about $3.8M. The official postmortem explains that the contract kept a record of deposits that had in fact been refunded, so its ledger showed more than it held. That is exactly the gap described above, and it can be read back from the chain.</p>
<p>Zygostat took a reading every 3,000 blocks (about every 30 minutes) from 28 September to 5 October, ${esc(n.readings_micro)} readings in all. On the affected token, ${esc(n.ep_token)}:</p>
<div class="tw"><table class="t"><thead><tr><th>What the chain shows</th><th>Time (UTC)</th></tr></thead><tbody>
<tr><td>Last reading fully backed</td><td class="n">${esc(n.ep_last_clean_time)}</td></tr>
<tr><td>First material shortfall (${esc(n.ep_first_short_usd)})</td><td class="n">${esc(n.ep_first_short_time)}</td></tr>
<tr><td>Largest shortfall, ${esc(n.ep_peak_usd_exact)} (${esc(n.ep_peak_unbacked)} of credits unbacked)</td><td class="n">${esc(n.ep_peak_time)}</td></tr>
<tr><td>Last reading still short</td><td class="n">${esc(n.ep_last_short_time)}</td></tr>
<tr><td>First reading fully backed again</td><td class="n">${esc(n.ep_first_clean_after_time)}</td></tr>
</tbody></table></div>
<p>The largest gap measured, ${esc(n.ep_peak_usd_exact)}, agrees with the official $3.8M. The contract was under-backed for between ${esc(n.ep_min_hours)} and ${esc(n.ep_max_hours)} hours, and backing returned at ${esc(n.ep_first_clean_after_time)}, one minute before the official fix was deployed at 20:31 UTC. The postmortem also notes that a similar issue was reported in January and another on 7 October, after which the feature responsible was removed.</p>

${h2('history')}
<p>To see whether this ever happened at other times, the same check runs at midnight UTC: weekly from ${esc(n.first_reading_date)}, daily from 20 September 2026. Each of these readings checks credits for every token, and holdings for every multi-token and for the largest ordinary tokens (together most of the value credited).</p>
<p>Across ${esc(n.readings_total)} readings and ${esc(n.token_checks)} individual token checks, the only material shortfall is the October exploit. Since ${esc(n.since_from)}, ${esc(n.since_material)} of ${esc(n.since_readings)} readings show one.</p>

${h2('market')}
<p>Solvency is a condition, not a reason to own NEAR. The reasons would be usage and value capture, measured from public market data:</p>
<div class="tw"><table class="t"><thead><tr><th>Measure</th><th>Now</th><th>A year earlier</th></tr></thead><tbody>
<tr><td>Intents volume, 30 days</td><td class="n">${esc(n.vol30)}</td><td class="n">${esc(n.vol30_prev)}</td></tr>
<tr><td>Base-layer transactions a day (30-day mean)</td><td class="n">${esc(n.l1_tx)}</td><td class="n">${esc(n.l1_tx_prev)}</td></tr>
<tr><td>Active accounts a day (30-day mean)</td><td class="n">${esc(n.l1_acc)}</td><td class="n">${esc(n.l1_acc_prev)}</td></tr>
<tr><td>Revenue captured by NEAR, 90 days annualised</td><td class="n">${esc(n.rev_ann90)}</td><td class="n"></td></tr>
<tr><td>New NEAR issued in the last year</td><td class="n">${esc(n.issued_near)}</td><td class="n">${esc(n.inflation)} of supply</td></tr>
<tr><td>Captured revenue as a share of that issuance</td><td class="n">${esc(n.cov_ann90)}</td><td class="n"></td></tr>
</tbody></table></div>
<p>Intents fees in the last 30 days were ${esc(n.fees30)}, ${esc(n.intents_fee_multiple)} the base layer's gas fees over the same days. These figures are quoted from DefiLlama and NearBlocks, not recomputed by Zygostat; the solvency numbers do not depend on them.</p>

${h2('model')}
<p>The October loss happened and was recovered. The question for an investor is what an honest allowance for the next one costs. The model is one line:</p>
<pre><code>expected cost a year = events a year x (share lost x custody x (1 - recovered) x paid from revenue + revenue lost to the pause)</code></pre>
<div class="tw"><table class="t"><thead><tr><th>Input</th><th>Value</th><th>Where it comes from</th></tr></thead><tbody>
<tr><td>Captured revenue a year</td><td class="n">${esc(n.m_R)}</td><td>DefiLlama, 90 days annualised</td></tr>
<tr><td>Custody (credits, all tokens)</td><td class="n">${esc(n.m_C)}</td><td>The latest chain reading</td></tr>
<tr><td>Share of custody lost in one event</td><td class="n">${esc(n.m_f)}</td><td>The October gap over custody that day</td></tr>
<tr><td>Loss events a year</td><td class="n">${esc(n.m_lambda)}</td><td>1 event in ${esc(n.m_exposure_years)} years; 90% range ${esc(n.m_lambda_low)} to ${esc(n.m_lambda_high)}</td></tr>
<tr><td>Share recovered</td><td class="n">50%</td><td>Base case; 100% was observed once</td></tr>
<tr><td>Revenue lost to one pause</td><td class="n">${esc(n.m_D)}</td><td>Fees during the 1 to 4 October pause against the week before</td></tr>
</tbody></table></div>
<p>Base case: ${esc(n.m_base_cost)} a year, ${esc(n.m_base_drag)} of captured revenue. One event costs about ${esc(n.m_event_months)} months of captured revenue, and events would have to happen ${esc(n.m_breakeven)} times a year to consume all of it. The Risk model view in the product has sliders for every assumption.</p>

${h2('product')}
<p>The landing page gives the thesis, the latest reading, the evidence and today's verdict. <strong>Launch</strong> opens the product, which has seven views. On a computer, use the rail on the left; on a phone, swipe the bar under the header. Each view has its own address, so it can be linked to directly.</p>
<div class="tw"><table class="t"><thead><tr><th>View</th><th>What you can do there</th></tr></thead><tbody>
<tr><td><a href="app.html#overview">01 Verdict</a></td><td>See the four conditions, their values and status, and the headline figures. Each condition links to its evidence.</td></tr>
<tr><td><a href="app.html#check">02 Run the check</a></td><td>Re-run the solvency check live: your browser asks a public NEAR node for both numbers at the newest block. The quick check takes seconds; the full check reads all ${esc(n.head_tokens)} tokens in about three minutes.</td></tr>
<tr><td><a href="app.html#exploit">03 The exploit</a></td><td>The October chart, credited against held, with the measured and the official timelines side by side, and the two commands that reproduce the worst reading.</td></tr>
<tr><td><a href="app.html#history">04 History</a></td><td>A year of readings across every token checked.</td></tr>
<tr><td><a href="app.html#market">05 Usage & value</a></td><td>Intents volume, base-layer transactions, and captured revenue against new supply.</td></tr>
<tr><td><a href="app.html#model">06 Risk model</a></td><td>Move the assumptions and watch the expected cost of the next event change.</td></tr>
<tr><td><a href="app.html#method">07 Method</a></td><td>The four conditions in full, and the limits of the method.</td></tr>
</tbody></table></div>
<p>Every chart can be read by hovering, or with the arrow keys after selecting it. Every chart has <strong>Show as table</strong>, and a <strong>Query</strong> note saying exactly where its data comes from.</p>

${h2('verify')}
<p>Nothing here asks to be trusted. With Node.js 22 or later, and nothing else installed:</p>
<pre><code>node --test                  # the unit tests, offline
node src/build.mjs --check   # every page and number matches the committed data
node src/verify.mjs          # each claim in the thesis, checked against the raw readings
node src/verify.mjs --live   # the solvency check again, now, against the live chain</code></pre>
<p>The raw data is in the repository under <code>data/raw/</code>, and <code>node src/build.mjs</code> rebuilds every page, number and document from it with no network. The data also refreshes itself: every day an automated job takes new readings from the chain and the market sources, rebuilds every page and number, and publishes the result, so the verdict on this site moves forward on its own. If a condition fails on new data, it is published as Triggered.</p>
<p>You can also reproduce the worst reading of the exploit without any of this code: the Exploit view lists two <code>curl</code> commands and the two numbers they should return.</p>

${h2('data')}
<div class="tw"><table class="t"><thead><tr><th>Source</th><th>Used for</th></tr></thead><tbody>
<tr><td>NEAR mainnet, public archival node</td><td>Credits and holdings at any block</td></tr>
<tr><td>NEAR block headers</td><td>Block time and total supply</td></tr>
<tr><td>NEAR Intents token list (1Click API)</td><td>Which tokens to check, their decimals and a price</td></tr>
<tr><td>DefiLlama</td><td>Intents volume, fees and revenue captured by NEAR; NEAR gas fees</td></tr>
<tr><td>NearBlocks</td><td>NEAR price, supply, transactions and active accounts</td></tr>
<tr><td>Official postmortem; CertiK's analysis</td><td>The reported timeline of the October exploit (quoted, not measured)</td></tr>
</tbody></table></div>
<p>None of these needs an account or a key. Copies of every response used are committed with the code.</p>

${h2('limits')}
<ul>
<li><strong>The NEAR side only.</strong> The check proves <code>intents.near</code> holds the NEAR-side tokens it owes. It does not prove that each bridged token is backed on its home chain.</li>
<li><strong>Listed tokens only.</strong> ${esc(n.checkable_tokens)} of the ${esc(n.registry_tokens)} assets on the Intents list have a token contract on NEAR and are checked. The other ${esc(n.uncheckable_tokens)} cannot be checked this way. NFTs and unlisted tokens are not checked.</li>
<li><strong>Confidential balances</strong> are not on the public ledger.</li>
<li><strong>History is sampled.</strong> A gap that opened and closed between two readings would not appear.</li>
<li><strong>Past dollar values are approximate.</strong> Token amounts are exact; dollar totals use one price per token, taken on ${esc(n.registry_date)}.</li>
<li><strong>Market figures are quoted</strong> from DefiLlama and NearBlocks, not recomputed.</li>
<li><strong>One event.</strong> The loss rate rests on a single exploit, so its range is wide. The model shows the range instead of hiding it.</li>
<li><strong>No forecast.</strong> Nothing here predicts the price of NEAR. This is research, not financial advice.</li>
</ul>

${h2('glossary')}
<div class="tw"><table class="t"><tbody>
<tr><td>NEAR Intents</td><td>NEAR's service for swapping and moving money across blockchains. Users' funds sit in the <code>intents.near</code> contract.</td></tr>
<tr><td>Credits</td><td>What the <code>intents.near</code> ledger says its users own.</td></tr>
<tr><td>Holdings</td><td>What each token's own contract says <code>intents.near</code> holds.</td></tr>
<tr><td>Shortfall</td><td>Credits minus holdings, when positive: money owed that is not there.</td></tr>
<tr><td>Material</td><td>A shortfall of at least $100 and at least 0.01% of a token's credits.</td></tr>
<tr><td>Block</td><td>One step of the NEAR blockchain, about every 0.6 seconds. Every reading names the block it was taken at.</td></tr>
<tr><td>Archival node</td><td>A NEAR server that keeps the full history, so the state at any past block can be read.</td></tr>
<tr><td>Captured revenue</td><td>The part of Intents fees that reaches NEAR, as defined by DefiLlama.</td></tr>
<tr><td>Issuance</td><td>New NEAR created each year to pay for network security.</td></tr>
<tr><td>Symbolon</td><td>An ancient Greek token broken in two; a claim was proven when the halves matched. The Zygostat mark.</td></tr>
</tbody></table></div>

${h2('faq')}
<h3>Is this saying NEAR is a good investment?</h3>
<p>It says the case for NEAR currently holds on four stated conditions, and shows what would change that. It does not forecast a price and is not financial advice.</p>
<h3>Could Zygostat be wrong about solvency?</h3>
<p>The two numbers come straight from the chain, and the worst October reading can be reproduced with two commands. What it cannot see is listed under <a href="#limits">What it does not measure</a>.</p>
<h3>Why trust the market numbers?</h3>
<p>You do not have to. They are quoted from named public sources, saved with the code, and the solvency numbers do not depend on them.</p>
<h3>What happens if a condition fails?</h3>
<p>On the next rebuild it is printed as Triggered, on this site and in the thesis, and the verdict changes with it.</p>
<h3>Does the live check send my data anywhere?</h3>
<p>No. Your browser reads public data from a public NEAR node. Nothing passes through a server of ours, and no wallet is needed.</p>
<p class="cap" style="margin-top:56px">Built at NEAR HACKATHON, Investment Thesis track. Data as of ${esc(n.as_of)}.</p>
</article>
</div>

<script>
(() => {
  // Highlight the section being read.
  const links = [...document.querySelectorAll('.toc a')];
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { links.forEach((a) => a.classList.remove('on')); map.get(e.target.id)?.classList.add('on'); } }), { rootMargin: '-20% 0px -70% 0px' });
  document.querySelectorAll('article h2[id]').forEach((h) => io.observe(h));
  // On a phone the contents start closed.
  if (matchMedia('(max-width: 920px)').matches) document.querySelector('.toc details').removeAttribute('open');
})();
</script>
</body>
</html>
`;
}
