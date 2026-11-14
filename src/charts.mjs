// Build-time SVG line charts as strings. No dependencies.
//
// Each chart is a <figure> holding: the SVG, a legend (two or more series),
// the series data as JSON (read by the hover script in the dashboard), and a
// table of the same values, so no number is reachable only by hovering.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- number formats ----------

export function compact(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'n/a';
  const a = Math.abs(n);
  const f = (v, s) => `${trim(v.toFixed(a >= 100 * (s === '' ? 1 : 0) && digits === 0 ? 0 : digits))}${s}`;
  if (a >= 1e9) return f(n / 1e9, 'B');
  if (a >= 1e6) return f(n / 1e6, 'M');
  if (a >= 1e4) return f(n / 1e3, 'K');
  return Math.round(n).toLocaleString('en-US');
}
const trim = (s) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
export const usd = (n, digits = 1) => (n === null || n === undefined || Number.isNaN(n) ? 'n/a' : `${n < 0 ? '-' : ''}$${compact(Math.abs(n), digits)}`);
export const pct = (x, digits = 1) => (x === null || x === undefined || Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(digits)}%`);
export const signedPct = (x, digits = 0) => (x === null || x === undefined ? 'n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`);
export const full = (n, digits = 0) => (n === null || n === undefined ? 'n/a' : n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));

const FORMATS = { usd: (v) => usd(v), compact: (v) => compact(v), pct: (v) => pct(v, v !== 0 && Math.abs(v) < 0.1 ? 1 : 0), full: (v) => full(v) };

// ---------- scales ----------

// Round tick values covering [0 or min, max].
export function niceTicks(min, max, target = 4) {
  if (max <= min) max = min + 1;
  const raw = (max - min) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => (max - min) / s <= target + 0.5);
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v < max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Time ticks: day steps for short spans, month starts for long ones.
export function timeTicks(t0, t1) {
  const DAY = 86_400_000;
  const span = t1 - t0;
  const ticks = [];
  if (span <= 16 * DAY) {
    const step = span <= 3 * DAY ? DAY / 2 : span <= 9 * DAY ? DAY : 2 * DAY;
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      const d = new Date(t);
      ticks.push({ t, label: d.getUTCHours() === 0 ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : `${String(d.getUTCHours()).padStart(2, '0')}:00` });
    }
    return ticks;
  }
  const every = span > 500 * DAY ? 3 : span > 250 * DAY ? 2 : 1;
  const d = new Date(t0);
  let y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (d.getUTCDate() > 1 || d.getUTCHours() > 0) m++;
  for (;;) {
    const t = Date.UTC(y, m, 1);
    if (t > t1) break;
    if (m % every === 0) ticks.push({ t, label: (m % 12) === 0 ? `${MONTHS[0]} ${String(y + Math.floor(m / 12)).slice(2)}` : MONTHS[m % 12] });
    m++;
  }
  return ticks.map((k) => ({ ...k, label: fixYear(k) }));
}
function fixYear(k) {
  const d = new Date(k.t);
  return d.getUTCMonth() === 0 ? `Jan ${String(d.getUTCFullYear()).slice(2)}` : MONTHS[d.getUTCMonth()];
}

// ---------- line chart ----------

// series: [{ name, slot (1-8, palette position), points: [[timeMs, value|null], ...] }]
// format: 'usd' | 'compact' | 'pct' | 'full'   (y axis, tooltip and table)
// events: [{ t, label }] vertical reference lines
// area: wash under the first series
export function lineChart({ id, title, subtitle, series, format = 'compact', events = [], area = false, yMax = null, tableEvery = 1, source }) {
  const W = 720, H = 280, L = 56, R = 104, T = 14, B = 30;
  const fmt = FORMATS[format];
  const all = series.flatMap((s) => s.points.filter((p) => p[1] !== null && p[1] !== undefined));
  const t0 = Math.min(...all.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0]));
  const top = yMax ?? Math.max(...all.map((p) => p[1]), 0);
  const ticks = niceTicks(0, top || 1);
  const y1 = ticks.at(-1);
  const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v) => T + (1 - v / y1) * (H - T - B);
  const r1 = (n) => Math.round(n * 10) / 10;

  const path = (pts) => {
    let d = '', pen = false;
    for (const [t, v] of pts) {
      if (v === null || v === undefined) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${r1(x(t))} ${r1(y(v))}`;
      pen = true;
    }
    return d;
  };

  let svg = '';
  for (const v of ticks) {
    svg += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${L}" x2="${W - R}" y1="${r1(y(v))}" y2="${r1(y(v))}"/>`;
    svg += `<text class="tick" x="${L - 8}" y="${r1(y(v) + 4)}" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  for (const k of timeTicks(t0, t1)) svg += `<text class="tick" x="${r1(x(k.t))}" y="${H - 8}" text-anchor="middle">${esc(k.label)}</text>`;
  // Event labels: each on its own row when they would otherwise collide.
  const placed = [];
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (e.t < t0 || e.t > t1) continue;
    const ex = r1(x(e.t));
    const flip = ex > W - R - 150;
    const w = e.label.length * 6.2;
    const span = flip ? [ex - 6 - w, ex - 6] : [ex + 6, ex + 6 + w];
    let row = 0;
    while (placed.some((p) => p.row === row && p.span[0] < span[1] + 8 && span[0] < p.span[1] + 8)) row++;
    placed.push({ row, span });
    svg += `<line class="event" x1="${ex}" x2="${ex}" y1="${T}" y2="${H - B}"/>`;
    svg += `<text class="event-label" x="${flip ? ex - 6 : ex + 6}" y="${T + 10 + row * 15}" text-anchor="${flip ? 'end' : 'start'}">${esc(e.label)}</text>`;
  }
  if (area && series[0]) {
    const pts = series[0].points.filter((p) => p[1] !== null && p[1] !== undefined);
    if (pts.length > 1) svg += `<path class="area s${series[0].slot}" d="${path(pts)}L${r1(x(pts.at(-1)[0]))} ${r1(y(0))}L${r1(x(pts[0][0]))} ${r1(y(0))}Z"/>`;
  }
  const ends = [];
  // Drawn last to first, so the first series sits on top where lines coincide.
  for (const s of [...series].reverse()) {
    svg += `<path class="line s${s.slot}" d="${path(s.points)}"/>`;
    const last = [...s.points].reverse().find((p) => p[1] !== null && p[1] !== undefined);
    if (last) { svg += `<circle class="dot s${s.slot}" cx="${r1(x(last[0]))}" cy="${r1(y(last[1]))}" r="4"/>`; ends.push({ s, ex: x(last[0]), ey: y(last[1]), v: last[1] }); }
  }
  // Direct end labels only when they do not collide; the legend always carries identity.
  const sorted = [...ends].sort((a, b) => a.ey - b.ey);
  const collide = sorted.some((e, i) => i > 0 && e.ey - sorted[i - 1].ey < 15);
  if (!collide && ends.length <= 4) {
    for (const e of ends) svg += `<text class="end-label" x="${r1(e.ex + 9)}" y="${r1(e.ey + 4)}">${esc(fmt(e.v))}</text>`;
  }

  const legend = series.length >= 2
    ? `<div class="legend">${series.map((s) => `<span class="key"><i class="swatch s${s.slot}"></i>${esc(s.name)}</span>`).join('')}</div>`
    : '';

  // Table twin. Rows are the union of timestamps; long series are thinned for
  // display with `tableEvery` (the full values stay in the JSON beside it).
  const times = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
  const lookup = series.map((s) => new Map(s.points));
  const shortSpan = t1 - t0 <= 16 * 86_400_000;
  const when = (t) => (shortSpan ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : new Date(t).toISOString().slice(0, 10));
  const rows = times.filter((_, i) => i % tableEvery === 0 || i === times.length - 1)
    .map((t) => `<tr><td>${when(t)}</td>${lookup.map((m) => `<td>${m.get(t) === null || m.get(t) === undefined ? '' : esc(fmt(m.get(t)))}</td>`).join('')}</tr>`).join('');
  const table = `<details class="table-view"><summary>Show as table${tableEvery > 1 ? ` (every ${tableEvery}th reading)` : ''}</summary><div class="table-scroll"><table><thead><tr><th>${shortSpan ? 'Time (UTC)' : 'Date (UTC)'}</th>${series.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>`;

  const data = { format, t0, t1, y1, box: { W, H, L, R, T, B }, series: series.map((s) => ({ name: s.name, slot: s.slot, points: s.points })) };
  return `<figure class="chart" id="${esc(id)}">
<figcaption><strong>${esc(title)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ''}</figcaption>
${legend}
<div class="plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" tabindex="0">${svg}<line class="crosshair" y1="${T}" y2="${H - B}" hidden/></svg><div class="tooltip" hidden></div></div>
<script type="application/json" class="chart-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
${table}
${source ? `<p class="source">${source}</p>` : ''}
</figure>`;
}
