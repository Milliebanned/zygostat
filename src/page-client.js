// Dashboard behaviour: chart hover, the risk model, and the live check.
// Plain browser JavaScript, no libraries. Loaded inline by the build.

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------- views: one section at a time, addressed by the URL hash ----------
  // Without JavaScript every view is shown in order, so nothing is hidden.
  const root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');
  const views = [...document.querySelectorAll('.view')];
  const links = [...document.querySelectorAll('.rail a[data-view]')];
  // Older links and in-page anchors map onto the view that holds them.
  const ALIAS = { live: 'check', kill: 'method', limits: 'method', year: 'history', usage: 'market' };
  const baseTitle = document.title;
  const route = (scroll) => {
    let id = decodeURIComponent(location.hash.slice(1)) || 'overview';
    id = ALIAS[id] || id;
    const view = views.find((v) => v.id === id) || views[0];
    views.forEach((v) => v.classList.toggle('on', v === view));
    links.forEach((a) => (a.dataset.view === view.id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    const label = links.find((a) => a.dataset.view === view.id)?.querySelector('.t')?.textContent;
    document.title = label && view.id !== 'overview' ? `${label} · Zygostat` : baseTitle;
    const active = links.find((a) => a.dataset.view === view.id);
    active?.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (scroll) scrollTo({ top: 0 });
  };
  addEventListener('hashchange', () => route(true));
  route(false);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  // ---------- formats (same rules as the build) ----------
  const trim = (s) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
  const compact = (n, d = 1) => {
    const a = Math.abs(n);
    if (a >= 1e9) return trim((n / 1e9).toFixed(d)) + 'B';
    if (a >= 1e6) return trim((n / 1e6).toFixed(d)) + 'M';
    if (a >= 1e4) return trim((n / 1e3).toFixed(d)) + 'K';
    return Math.round(n).toLocaleString('en-US');
  };
  const usd = (n, d = 1) => (n < 0 ? '-' : '') + '$' + compact(Math.abs(n), d);
  const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
  const fmt = { usd: (v) => usd(v, 2), compact: (v) => compact(v, 2), pct: (v) => pct(v, 1), full: (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }) };

  // ---------- chart hover: crosshair + one tooltip listing every series ----------
  for (const fig of document.querySelectorAll('figure.chart')) {
    const data = JSON.parse($('.chart-data', fig).textContent);
    const svg = $('svg', fig), cross = $('.crosshair', fig), tip = $('.tooltip', fig), plot = $('.plot', fig);
    const { W, L, R } = data.box;
    const times = [...new Set(data.series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
    const maps = data.series.map((s) => new Map(s.points));
    const short = data.t1 - data.t0 <= 16 * 86400000;
    let at = times.length - 1;

    const show = (i) => {
      at = Math.max(0, Math.min(times.length - 1, i));
      const t = times[at];
      const xv = L + ((t - data.t0) / (data.t1 - data.t0 || 1)) * (W - L - R);
      cross.setAttribute('x1', xv); cross.setAttribute('x2', xv); cross.removeAttribute('hidden');
      tip.replaceChildren(el('div', 'when', new Date(t).toISOString().slice(0, short ? 16 : 10).replace('T', ' ') + ' UTC'));
      data.series.forEach((s, k) => {
        const v = maps[k].get(t);
        if (v === null || v === undefined) return;
        const row = el('div', 'row');
        row.append(el('i', 'swatch s' + s.slot), el('span', '', s.name), el('b', '', fmt[data.format](v)));
        tip.append(row);
      });
      tip.hidden = false;
      const px = (xv / W) * plot.clientWidth;
      const left = px + 14 + tip.offsetWidth > plot.clientWidth ? px - tip.offsetWidth - 14 : px + 14;
      tip.style.left = Math.max(0, left) + 'px';
    };
    const hide = () => { cross.setAttribute('hidden', ''); tip.hidden = true; };
    const nearest = (clientX) => {
      const box = svg.getBoundingClientRect();
      const t = data.t0 + (((clientX - box.left) / box.width) * W - L) / (W - L - R) * (data.t1 - data.t0);
      let lo = 0, hi = times.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] < t) lo = mid; else hi = mid; }
      return Math.abs(times[lo] - t) <= Math.abs(times[hi] - t) ? lo : hi;
    };
    svg.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', () => show(at));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { show(at - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { show(at + 1); e.preventDefault(); }
      if (e.key === 'Home') { show(0); e.preventDefault(); }
      if (e.key === 'End') { show(times.length - 1); e.preventDefault(); }
    });
  }

  // ---------- risk model (same arithmetic as src/model.mjs) ----------
  const modelRoot = $('#model');
  if (modelRoot) {
    const base = JSON.parse($('#model-data').textContent);
    const inputs = { lambda: $('#m-lambda'), rho: $('#m-rho'), f: $('#m-f'), h: $('#m-h') };
    const run = () => {
      const lambda = Number(inputs.lambda.value), rho = Number(inputs.rho.value) / 100, f = Number(inputs.f.value) / 100, h = Number(inputs.h.value) / 100;
      const gross = f * base.C;
      const perEvent = gross * (1 - rho) * h + base.D;
      const cost = lambda * perEvent;
      $('#m-lambda-out').textContent = lambda.toFixed(2) + ' a year';
      $('#m-rho-out').textContent = pct(rho, 0);
      $('#m-f-out').textContent = pct(f, 2) + ' = ' + usd(gross, 2);
      $('#m-h-out').textContent = pct(h, 0);
      $('#o-cost').textContent = usd(cost, 2);
      $('#o-drag').textContent = pct(cost / base.R, 1);
      $('#o-adj').textContent = usd(base.R - cost, 2);
      $('#o-break').textContent = perEvent > 0 ? (base.R / perEvent).toFixed(1) + ' a year' : 'never';
      $('#o-months').textContent = ((perEvent / base.R) * 12).toFixed(1) + ' months';
    };
    for (const i of Object.values(inputs)) i.addEventListener('input', run);
    $('#m-reset').addEventListener('click', () => { for (const i of Object.values(inputs)) i.value = i.defaultValue; run(); });
    run();
  }

  // ---------- live check: read the invariant from a public node, in this browser ----------
  const liveRoot = $('#live');
  if (liveRoot) {
    const cfg = JSON.parse($('#live-data').textContent);
    const NODES = ['https://rpc.mainnet.fastnear.com', 'https://free.rpc.fastnear.com', 'https://archival-rpc.mainnet.fastnear.com'];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let node = 0;
    const rpc = async (method, params) => {
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const res = await fetch(NODES[node], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
          if (res.status === 429 || res.status >= 500) throw new Error('busy');
          const body = await res.json();
          if (body.error) { if (body.error.code === -429) throw new Error('busy'); throw Object.assign(new Error(body.error.cause?.name || 'rpc error'), { final: true }); }
          return body.result;
        } catch (err) {
          if (err.final) throw err;
          node = (node + 1) % NODES.length;
          await sleep(1500 * (attempt + 1));
        }
      }
      throw new Error('public nodes are busy; try again in a minute');
    };
    const view = async (account, method, args, block) => {
      const r = await rpc('query', { request_type: 'call_function', account_id: account, method_name: method, args_base64: btoa(JSON.stringify(args)), block_id: block });
      return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));
    };
    const units = (raw, dec) => { const s = BigInt(raw).toString().padStart(dec + 1, '0'); return Number(s.slice(0, s.length - dec) + '.' + s.slice(s.length - dec)); };
    const set = (id, text) => { $(id).textContent = text; };

    const check = async (everything) => {
      const buttons = liveRoot.querySelectorAll('button');
      buttons.forEach((b) => { b.disabled = true; });
      set('#live-state', 'Reading the chain…');
      try {
        const head = (await rpc('block', { finality: 'final' })).header;
        const block = head.height;
        const tokens = cfg.tokens; // [assetId, symbol, chain, decimals, priceUsd, major]
        const credits = new Map();
        for (let i = 0; i < tokens.length; i += 110) {
          const part = tokens.slice(i, i + 110);
          const r = await view('intents.near', 'mt_batch_supply', { token_ids: part.map((t) => t[0]) }, block);
          part.forEach((t, k) => credits.set(t[0], r[k] ?? '0'));
        }
        const held = new Map();
        const multi = tokens.filter((t) => t[0].startsWith('nep245:'));
        const byContract = {};
        for (const t of multi) { const [, contract, ...id] = t[0].split(':'); (byContract[contract] ||= []).push([t[0], id.join(':')]); }
        for (const [contract, list] of Object.entries(byContract)) {
          const r = await view(contract, 'mt_batch_balance_of', { account_id: 'intents.near', token_ids: list.map((x) => x[1]) }, block);
          list.forEach((x, k) => held.set(x[0], r[k] ?? '0'));
        }
        const single = tokens.filter((t) => t[0].startsWith('nep141:') && credits.get(t[0]) !== '0' && (everything || t[5]));
        let done = 0;
        for (const t of single) {
          held.set(t[0], await view(t[0].slice(7), 'ft_balance_of', { account_id: 'intents.near' }, block));
          set('#live-state', `Reading the chain… ${++done} of ${single.length} token contracts`);
          if (everything) await sleep(1100); // stay under the public limit of about 60 requests a minute
        }
        let c = 0, h = 0, short = 0, n = 0, worst = null;
        for (const t of tokens) {
          if (!held.has(t[0])) continue;
          n++;
          const cu = units(credits.get(t[0]), t[3]) * t[4], hu = units(held.get(t[0]), t[3]) * t[4];
          c += cu; h += hu;
          if (BigInt(credits.get(t[0])) > BigInt(held.get(t[0]))) { short += cu - hu; if (!worst || cu - hu > worst[1]) worst = [`${t[1]} on ${t[2]}`, cu - hu]; }
        }
        // Share of credited value that is backed, token by token. A surplus in
        // one token does not offset a shortfall in another.
        set('#live-ratio', c ? ((1 - short / c) * 100).toFixed(2) + '%' : 'n/a');
        set('#live-credits', '$' + Math.round(c).toLocaleString('en-US'));
        set('#live-held', '$' + Math.round(h).toLocaleString('en-US'));
        set('#live-short', '$' + Math.round(short).toLocaleString('en-US') + (worst ? ` (largest: ${worst[0]})` : ''));
        set('#live-tokens', String(n));
        set('#live-block', block.toLocaleString('en-US'));
        set('#live-time', new Date(Number(BigInt(head.timestamp) / 1000000n)).toISOString().slice(0, 19).replace('T', ' ') + ' UTC');
        set('#live-state', short >= 100 ? 'Shortfall found: users are credited with more than the contract holds.' : 'Fully backed at this block: every token checked is held in full.');
        set('#live-kind', 'Read just now, in your browser');
      } catch (err) {
        set('#live-state', 'Could not read the chain: ' + err.message + '. The numbers shown are from the last build.');
      }
      buttons.forEach((b) => { b.disabled = false; });
    };
    $('#live-run').addEventListener('click', () => check(false));
    $('#live-run-all').addEventListener('click', () => check(true));
  }
})();
