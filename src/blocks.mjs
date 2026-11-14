// Map a UTC time to the first NEAR block at or after it.
// NEAR has no "block at time" call, so this searches block headers.

import { blockInfo, headInfo } from './rpc.mjs';

// Starting guess only: block 218,126,921 was produced at 2026-10-02T00:00:00Z.
// The search checks every answer against real headers.
const ANCHOR = { height: 218_126_921, timeMs: Date.UTC(2026, 9, 2) };
const GUESS_MS_PER_BLOCK = 600;

// Returns { height, timeMs, totalSupplyYocto } of the first existing block
// whose timestamp is >= targetMs. `probe(height)` must return the block at
// that height, or the next existing one if the height was skipped.
// `known` is an optional list of already-seen blocks used to guess better.
export async function blockAtTime(targetMs, { probe = blockInfo, top, known = [] } = {}) {
  top = top ?? (await headInfo());
  if (targetMs > top.timeMs) throw new Error(`time ${new Date(targetMs).toISOString()} is after the chain head`);

  // Guess from the nearest known block.
  let ref = ANCHOR;
  for (const k of known) if (Math.abs(k.timeMs - targetMs) < Math.abs(ref.timeMs - targetMs)) ref = k;
  let guess = Math.round(ref.height + (targetMs - ref.timeMs) / GUESS_MS_PER_BLOCK);
  guess = Math.max(1, Math.min(guess, top.height));

  // Bracket the answer: lo.time < target <= hi.time.
  let lo, hi;
  let step = 4_000;
  const first = await probe(guess);
  if (first.timeMs >= targetMs) {
    hi = first;
    for (;;) {
      const q = await probe(Math.max(1, hi.height - step));
      if (q.timeMs < targetMs) { lo = q; break; }
      if (q.height >= hi.height || q.height <= 1) return q;
      hi = q;
      step *= 4;
    }
  } else {
    lo = first;
    for (;;) {
      const h = lo.height + step;
      const q = h >= top.height ? top : await probe(h);
      if (q.timeMs >= targetMs) { hi = q; break; }
      lo = q;
      step *= 4;
    }
  }

  // Interpolate inside the bracket; fall back to bisection near the end.
  for (let i = 0; hi.height - lo.height > 1; i++) {
    const span = hi.height - lo.height;
    const frac = (targetMs - lo.timeMs) / (hi.timeMs - lo.timeMs);
    // Interpolation can creep in from one side; switch to bisection if it does.
    let mid = span > 8 && i < 10 ? lo.height + Math.round(span * frac) : lo.height + Math.floor(span / 2);
    mid = Math.max(lo.height + 1, Math.min(mid, hi.height - 1));
    const q = await probe(mid);
    if (q.height >= hi.height) {
      // Every height in [mid, hi) was skipped: the answer cannot be in there.
      if (mid === lo.height + 1) break;
      const r = await probe(lo.height + 1);
      if (r.height >= hi.height) break;
      if (r.timeMs >= targetMs) hi = r; else lo = r;
      continue;
    }
    if (q.timeMs >= targetMs) hi = q; else lo = q;
  }
  return hi;
}

// A block shortly after a time: the first probe that lands within `windowMs`
// after `targetMs`. Cheaper than the exact search (usually two probes), and
// enough for a daily reading, which records the block's real time anyway.
export async function blockSoonAfter(targetMs, { probe = blockInfo, top, known = [], windowMs = 120_000 } = {}) {
  top = top ?? (await headInfo());
  if (targetMs > top.timeMs) throw new Error(`time ${new Date(targetMs).toISOString()} is after the chain head`);
  let ref = ANCHOR;
  for (const k of known) if (Math.abs(k.timeMs - targetMs) < Math.abs(ref.timeMs - targetMs)) ref = k;
  let rate = GUESS_MS_PER_BLOCK;
  const aim = targetMs + windowMs / 2;
  for (let i = 0; i < 8; i++) {
    let h = Math.round(ref.height + (aim - ref.timeMs) / rate);
    h = Math.max(1, Math.min(h, top.height));
    if (h === ref.height) h += ref.timeMs < targetMs ? 1 : -1;
    const q = await probe(h);
    const late = q.timeMs - targetMs;
    if (late >= 0 && late <= windowMs) return q;
    if (q.height !== ref.height) rate = Math.max(300, Math.min(3_000, (q.timeMs - ref.timeMs) / (q.height - ref.height)));
    ref = q;
  }
  return blockAtTime(targetMs, { probe, top, known });
}

// UTC midnights from `fromIso` to `toIso` inclusive, every `stepDays`.
export function utcDays(fromIso, toIso, stepDays = 1) {
  const out = [];
  const end = Date.parse(toIso + 'T00:00:00Z');
  for (let t = Date.parse(fromIso + 'T00:00:00Z'); t <= end; t += stepDays * 86_400_000) out.push(t);
  return out;
}

export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
