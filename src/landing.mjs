// The landing page: four sections and a Launch button that opens the product
// (docs/app.html). Every number on it comes from the build, never typed in.

import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('./landing.css', import.meta.url), 'utf8');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The mark: a symbolon. In ancient Greece a token was broken in two and a
// claim was proven when the halves matched. Here: credits and holdings.
const HALF_L = 'M17 2 L14.6 7 L18 11.5 L14 16 L18 20.5 L14.6 25 L17 30 A14 14 0 1 1 17 2 Z';
const HALF_R = 'M17 2 L14.6 7 L18 11.5 L14 16 L18 20.5 L14.6 25 L17 30 A14 14 0 0 0 17 2 Z';
export const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="l" d="${HALF_L}" fill="#c9a34e" transform="translate(-1.1 0)"/><path class="r" d="${HALF_R}" fill="#ecebe6" transform="translate(1.1 0)"/></svg>`;

// The same mark as a solid object: each half is a stack of layers in depth,
// faces in brass and bone, the edge darker. Used in the hero.
function coin3d() {
  const N = 14;
  const half = (cls, d, face, edge) => `<div class="half ${cls}">${Array.from({ length: N }, (_, i) => {
    const z = ((i - (N - 1) / 2) * 1.5).toFixed(1);
    const f = i === 0 || i === N - 1 ? face : edge;
    return `<svg viewBox="0 0 32 32" style="transform:translateZ(${z}px)"><path d="${d}" fill="${f}"/></svg>`;
  }).join('')}</div>`;
  return `<div class="coin3d" aria-hidden="true">
<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="gL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6c87e"/><stop offset="1" stop-color="#a8822f"/></linearGradient><linearGradient id="gR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f6f1"/><stop offset="1" stop-color="#bdbcb5"/></linearGradient></defs></svg>
<div class="spin">${half('l', HALF_L, 'url(#gL)', '#6e5622')}${half('r', HALF_R, 'url(#gR)', '#7c7b76')}</div>
<div class="shadow"></div>
</div>`;
}

export const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">';

const longDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Credited vs held for the exploited token, with the unbacked gap hatched.
export function exploitFigure(hit, { W = 600, H = 230, ink = '#111214', held = '#2f8c76', gap = '#b84a31', axis = 'rgba(17,18,20,0.55)' } = {}) {
  if (!hit || hit.length < 2) return '';
  const P = 2;
  const t0 = Date.parse(hit[0].time), t1 = Date.parse(hit.at(-1).time);
  const top = Math.max(...hit.flatMap((p) => [p.credits, p.held])) * 1.1;
  const x = (t) => (P + ((Date.parse(t) - t0) / (t1 - t0)) * (W - 2 * P)).toFixed(1);
  const y = (v) => (H - P - (v / top) * (H - 2 * P)).toFixed(1);
  const line = (key) => hit.map((p, i) => `${i ? 'L' : 'M'}${x(p.time)} ${y(p[key])}`).join('');
  const area = `M${hit.map((p) => `${x(p.time)} ${y(p.credits)}`).join(' L')} L${[...hit].reverse().map((p) => `${x(p.time)} ${y(Math.min(p.held, p.credits))}`).join(' L')} Z`;
  const days = [];
  for (let d = Math.ceil(t0 / 86_400_000) * 86_400_000; d <= t1; d += 86_400_000) days.push(d);
  const ticks = days.map((d) => `<line x1="${x(new Date(d).toISOString())}" x2="${x(new Date(d).toISOString())}" y1="${H - P}" y2="${H - P + 5}" stroke="${axis}"/><text x="${x(new Date(d).toISOString())}" y="${H + 18}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="${axis}">${new Date(d).getUTCDate()} ${['Sep', 'Oct', 'Nov'][new Date(d).getUTCMonth() - 8] ?? ''}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="Credited to users against held by the contract for the exploited token, around the October 2026 exploit">
<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${gap}" stroke-width="2.2"/></pattern></defs>
<line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" stroke="${axis}"/>
${ticks}
<path d="${area}" fill="url(#hatch)" opacity="0.75"/>
<path d="${line('held')}" fill="none" stroke="${held}" stroke-width="1.8" stroke-linejoin="round"/>
<path d="${line('credits')}" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/>
</svg>`;
}

const STATUS = { holds: ['', 'Holds'], triggered: ['trig', 'Triggered'], 'not measured': ['pend', 'Not measured'] };
const SHORT = [
  ['Solvency', 'NEAR Intents holds every token it credits, at every reading since the October fix.'],
  ['Usage', 'Intents volume over 30 days is above the same 30 days a year earlier.'],
  ['Value capture', 'Revenue NEAR captures covers at least 10% of the value of new supply.'],
  ['Security cost', 'The expected cost of the next loss stays under 25% of that revenue.'],
];

export function renderLanding(r, n) {
  const s = r.solvency, ep = s.episode, k = r.killSummary;
  const short = s.head.shortfallUsd >= 100;
  const diff = s.head.heldUsd - s.head.creditsUsd;
  const restored = ep?.firstCleanAfter ? (() => { const d = new Date(ep.firstCleanAfter.time); return `${d.getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`; })() : 'n/a';
  const conds = r.kill.map((c, i) => {
    const [cls, word] = STATUS[c.status];
    return `<div class="cond"><span class="id">${esc(c.id)}</span><div><h3>${esc(SHORT[i][0])}</h3><p>${esc(SHORT[i][1])}</p></div><div class="st"><span class="val">${esc(n[`k${i + 1}_value`])}</span><span class="word ${cls}"><i></i>${word}</span></div></div>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Zygostat: the case for NEAR, weighed on chain</title>
<meta name="description" content="Zygostat is a long-term investment thesis for NEAR that anyone can re-run. It tests usage, value capture and whether NEAR Intents holds what it owes, from public data and NEAR chain state.">
<meta name="theme-color" content="#0c0d0f">
<meta property="og:title" content="Zygostat: the case for NEAR, weighed on chain">
<meta property="og:description" content="${esc(`${k.holds} of ${k.total} conditions hold. Intents volume ${n.vol30_change} year on year, ${n.cov_ann90} of new supply covered by captured revenue, and the October exploit reproduced from chain state.`)}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(MARK)}">
${FONTS}
<style>
${CSS}</style>
</head>
<body>

<header class="mast">
<div class="wrap">
<a class="brand" href="#top">${MARK}Zygostat</a>
<nav aria-label="Sections"><a href="#evidence">Evidence</a><a href="#verdict">Verdict</a><a href="#run">Method</a><a href="docs.html">Docs</a></nav>
<span class="sp"></span>
<a class="mlink" href="docs.html">Docs</a>
<span class="mono date">Data as of ${esc(longDate(n.as_of))}</span>
<a class="btn solid small launch-link" href="app.html">Launch <span class="ar">→</span></a>
</div>
</header>

<main id="top">

<section class="hero" aria-labelledby="hero-h">
<div class="cols"></div>
<div class="wrap grid">
<div>
<p class="mono kicker"><b>NEAR</b> / long-term investment thesis / Investment Thesis track</p>
<h1 class="display" id="hero-h">The case for NEAR, weighed on chain.</h1>
<p class="lede">An investment thesis you can re-run. It tests NEAR on usage, on value capture, and on the one thing a price chart cannot show: whether NEAR Intents holds what it owes its users.</p>
<div class="act">
<a class="btn solid launch-link" href="app.html">Launch Zygostat <span class="ar">→</span></a>
<a class="link" href="#verdict">Read the verdict</a>
</div>
</div>
<div class="right">
${coin3d()}
<div class="ledger" aria-label="The latest reading">
<div class="head cap"><span>intents.near</span><span>block ${esc(n.head_block)}</span></div>
<div class="row"><span>Credited to users</span><b>${esc(n.head_credits_exact)}</b></div>
<div class="row"><span>Held by the contract</span><b>${esc(n.head_held_exact)}</b></div>
<div class="row total${short ? ' bad' : ''}"><span>${short ? 'Shortfall' : 'Held minus credited'}</span><b>${short ? esc(n.head_shortfall) : `+$${Math.round(diff).toLocaleString('en-US')}`}</b></div>
<div class="row"><span>Conditions holding</span><b>${esc(`${k.holds} of ${k.total}`)}</b></div>
<div class="lfoot cap"><span>${esc(n.head_tokens)} tokens checked</span><span>${esc(n.head_time)}</span></div>
</div>
</div>
</div>
</section>

<section class="evidence" id="evidence" aria-labelledby="ev-h">
<div class="cols"></div>
<div class="wrap">
<div class="sechead" data-depth="0">
<div><span class="mono no">01 / Evidence</span><h2 class="display" id="ev-h">What the data says.</h2></div>
<p>Each figure is quoted from a public series or read from NEAR mainnet. One command rebuilds every one of them from the raw data committed with the code.</p>
</div>
<div class="figs">
<div class="fig" data-depth="0"><div><div class="v num">${esc(n.vol30)}</div><div class="k">swapped through NEAR Intents in the last 30 days</div></div><div class="cap"><span>DefiLlama</span><span>${esc(n.vol30_change)} y/y</span></div></div>
<div class="fig" data-depth="1"><div><div class="v num neg">${esc(n.l1_tx_change)}</div><div class="k">NEAR base-layer transactions, year on year</div></div><div class="cap"><span>NearBlocks</span><span>30-day mean</span></div></div>
<div class="fig" data-depth="2"><div><div class="v num">${esc(n.rev_ann90)}</div><div class="k">revenue NEAR captures from Intents in a year</div></div><div class="cap"><span>DefiLlama</span><span>90 days annualised</span></div></div>
<div class="fig" data-depth="0"><div><div class="v num">${esc(n.cov_ann90)}</div><div class="k">of the value of new NEAR supply that revenue covers</div></div><div class="cap"><span>Derived</span><span>${esc(n.issued_near)} NEAR issued</span></div></div>
<div class="fig" data-depth="1"><div><div class="v num pos">${esc(n.head_shortfall)}</div><div class="k">owed to users but not held, today</div></div><div class="cap"><span>NEAR mainnet</span><span>block ${esc(n.head_block)}</span></div></div>
<div class="fig" data-depth="2"><div><div class="v num neg">${esc(n.ep_peak_usd)}</div><div class="k">owed to users but not held, on 1 October</div></div><div class="cap"><span>NEAR mainnet</span><span>archival state</span></div></div>
</div>
<p class="cap note" data-depth="0">Chain read at block ${esc(n.head_block)}, ${esc(n.head_time)}. Market series as of ${esc(n.as_of)}.</p>
</div>
</section>

<section class="paper verdict" id="verdict" aria-labelledby="vd-h">
<div class="cols"></div>
<div class="wrap">
<div class="sechead" data-depth="0">
<div><span class="mono no">02 / Verdict</span><h2 class="display" id="vd-h">Four conditions decide it.</h2></div>
<p>A price is not evidence. The thesis states in advance the four results that would end the case for NEAR, and every build recomputes them from raw data. A triggered condition is printed as triggered.</p>
</div>
<div class="body" data-depth="0">
<div>
<div class="conds">
${conds}
</div>
<div class="sum cap"><span>${esc(`${k.holds} of ${k.total} hold`)}</span><span>thresholds set 13 November 2026</span></div>
</div>
<figure class="ex">
<div class="top cap"><span>Fig. 1 / Condition K1</span><span>${esc(n.ep_token)}</span></div>
${exploitFigure(s.hitSeries)}
<div class="key cap"><span><i style="background:#111214"></i>Credited to users</span><span><i style="background:#2f8c76"></i>Held by the contract</span><span><i class="sq" style="background:repeating-linear-gradient(45deg,#b84a31 0 2px,transparent 2px 5px)"></i>Unbacked</span></div>
<figcaption><b>The one condition only chain data can test.</b> On 1 October the contract's ledger credited users with tokens it did not hold. Read back from archival state every 30 minutes, the gap opens, peaks and closes.</figcaption>
<div class="facts"><div><b class="neg">${esc(n.ep_peak_usd)}</b><span class="cap">largest gap</span></div><div><b>${ep ? `${Math.floor(ep.minHours)} h` : 'n/a'}</b><span class="cap">under-backed</span></div><div><b class="pos">${esc(restored)}</b><span class="cap">backed again (UTC)</span></div></div>
</figure>
</div>
</div>
</section>

<section class="launch" id="run" aria-labelledby="run-h">
<div class="cols"></div>
<div class="wrap">
<div class="grid" data-depth="0">
<div><span class="mono no" style="color:var(--brass);display:block;margin-bottom:18px">03 / Method</span><h2 class="display" id="run-h">Nothing here asks to be trusted.</h2></div>
<div class="side">
<p>Every number above is rebuilt from committed raw data by one command, and the solvency check can be re-run against the live chain from your browser.</p>
<code><span>$</span> node src/build.mjs --check</code>
<div class="act"><a class="btn solid launch-link" href="app.html">Launch Zygostat <span class="ar">→</span></a><a class="link" href="app.html#check">Re-check the chain now</a></div>
</div>
</div>
<footer class="foot">
<div><a class="brand" href="#top">${MARK}Zygostat</a><p>A long-term investment thesis for NEAR. Open data, one command, no keys.</p></div>
<div><h5>Product</h5><ul><li><a href="app.html#overview">Verdict</a></li><li><a href="app.html#check">Run the check</a></li><li><a href="app.html#model">Risk model</a></li></ul></div>
<div><h5>Evidence</h5><ul><li><a href="app.html#exploit">The exploit</a></li><li><a href="app.html#history">History</a></li><li><a href="app.html#market">Usage and value</a></li></ul></div>
<div><h5>Method</h5><ul><li><a href="docs.html">Docs</a></li><li><a href="app.html#method">Conditions</a></li><li><a href="app.html#method">Limits</a></li></ul></div>
</footer>
<div class="fine cap"><span>Built at NEAR HACKATHON, Investment Thesis track. Research, not financial advice.</span><span>The mark is a symbolon: a token broken in two, proven when the halves match.</span></div>
</div>
</section>

</main>

<div class="curtain" aria-hidden="true">${MARK}</div>

<script>
(() => {
  const root = document.documentElement;
  root.classList.remove('no-js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Launch: the screen goes dark and the two halves of the mark close, then the product loads.
  const curtain = document.querySelector('.curtain');
  document.querySelectorAll('.launch-link').forEach((a) => a.addEventListener('click', (ev) => {
    if (reduce || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault();
    curtain.classList.add('go');
    setTimeout(() => { location.href = a.getAttribute('href'); }, 700);
  }));
  addEventListener('pageshow', () => curtain.classList.remove('go'));
  if (reduce) return;
  root.classList.add('motion');

  // Depth: blocks rise into place in perspective as they enter the screen.
  const depth = [...document.querySelectorAll('[data-depth]')];
  // The token: follows the pointer; scrolling through the hero breaks it apart.
  const hero = document.querySelector('.hero');
  const coin = document.querySelector('.coin3d');
  let tx = 0, ty = 0, mx = 0, my = 0;
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  const start = performance.now();
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const tick = (now) => {
    const vh = innerHeight;
    for (const el of depth) {
      const r = el.getBoundingClientRect();
      if (r.top > vh * 1.2 || r.bottom < -vh * 0.2) continue;
      const p = clamp((vh - r.top) / (vh * 0.5) - (+el.dataset.depth || 0) * 0.08);
      el.style.setProperty('--p', p.toFixed(3));
    }
    if (coin) {
      mx += (tx - mx) * 0.07; my += (ty - my) * 0.07;
      const hr = hero.getBoundingClientRect();
      const split = clamp(-hr.top / (hr.height * 0.7));
      const e = clamp((now - start - 250) / 1300);
      const intro = 1 - (1 - Math.pow(1 - e, 3));
      coin.style.setProperty('--mx', mx.toFixed(3));
      coin.style.setProperty('--my', my.toFixed(3));
      coin.style.setProperty('--sp', (split + intro).toFixed(3));
      coin.style.setProperty('--turn', split.toFixed(3));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
</script>
</body>
</html>
`;
}
