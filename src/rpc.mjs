// Minimal NEAR client. Node >= 22, no dependencies.
// Every on-chain number in this repository is read through this file.
//
// Two keyless public services are used:
//   - an archival JSON-RPC node, for contract state at any past block;
//   - the neardata block server, for block headers (timestamp, total supply).
// Both rate-limit. Requests are paced, and a 429 pauses the queue.

export const INTENTS = 'intents.near';

// Override with NEAR_RPC_URL to use your own archival node, and
// NEAR_RPC_GAP_MS to set the pause between requests (a private node can go
// much faster than the public default).
export const PRIMARY = process.env.NEAR_RPC_URL || 'https://archival-rpc.mainnet.fastnear.com';
export const NEARDATA = process.env.NEARDATA_URL || 'https://mainnet.neardata.xyz';

// Independent public archival nodes, used only to cross-check single values.
// Their free limits are too low for bulk reads (measured 2026-11-13: Tatum
// allows 5 requests a minute; the near.org endpoint is deprecated and throttled).
export const CROSSCHECK = ['https://near-mainnet.gateway.tatum.io', 'https://archival-rpc.mainnet.near.org'];

// Measured 2026-11-13: the public primary allows about 60 requests a minute.
const DEFAULT_GAP = { [PRIMARY]: Number(process.env.NEAR_RPC_GAP_MS || 1050), [NEARDATA]: 1200 };

const lanes = new Map(); // base url -> pacing state
function lane(url) {
  if (!lanes.has(url)) lanes.set(url, { url, gapMs: DEFAULT_GAP[url] ?? 13_000, nextFree: 0, pausedUntil: 0, ok: 0, limited: 0, failed: 0 });
  return lanes.get(url);
}

export class RpcError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RpcError';
    this.code = code; // e.g. UNKNOWN_BLOCK, UNKNOWN_ACCOUNT, CONTRACT_EXECUTION_ERROR
  }
}

class Throttled extends Error {
  constructor(retryAfterMs) { super('rate limited'); this.retryAfterMs = retryAfterMs; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run `attemptFn` in the lane's queue, retrying transport failures.
async function paced(url, attemptFn, retries = 40) {
  const p = lane(url);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Reserve the next slot so concurrent callers queue up behind each other.
    const at = Math.max(Date.now(), p.nextFree, p.pausedUntil);
    p.nextFree = at + p.gapMs;
    const wait = at - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const result = await attemptFn(p);
      p.ok++;
      return result;
    } catch (err) {
      if (err instanceof RpcError) throw err; // deterministic answer from the chain
      lastErr = err;
      if (err instanceof Throttled) {
        // Several in-flight requests can be refused at once: count one event.
        if (Date.now() > p.pausedUntil) p.limited++;
        p.pausedUntil = Math.max(p.pausedUntil, Date.now() + Math.max(err.retryAfterMs, 15_000));
      } else {
        p.failed++;
        p.pausedUntil = Math.max(p.pausedUntil, Date.now() + 2_000 * (attempt + 1));
      }
    }
  }
  throw new Error(`${new URL(url).host} failed after retries: ${lastErr?.message}`);
}

// JSON-RPC call. `url`: which node to ask (defaults to the primary).
export function rpc(method, params, { url = PRIMARY } = {}) {
  return paced(url, async (p) => {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 429) throw new Throttled(Number(res.headers.get('retry-after') || 0) * 1000);
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) {
      if (body.error.code === -429) throw new Throttled(0);
      const code = body.error.cause?.name || body.error.name || 'RPC_ERROR';
      // A node that pruned this block is a provider problem, not an answer.
      if (code === 'GARBAGE_COLLECTED_BLOCK') throw new Error('provider is not archival for this block');
      throw new RpcError(`${code}: ${JSON.stringify(body.error.cause?.info ?? body.error.data ?? '').slice(0, 200)}`, code);
    }
    // Older node versions report a failed view call inside the result.
    if (body.result && typeof body.result.error === 'string') {
      throw new RpcError(body.result.error.slice(0, 200), 'CONTRACT_EXECUTION_ERROR');
    }
    return body.result;
  });
}

// Read-only contract call at a block height (or 'final').
export async function view(account, method, args, block = 'final', opts) {
  const params = {
    request_type: 'call_function',
    account_id: account,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  };
  if (block === 'final') params.finality = 'final';
  else params.block_id = block;
  const result = await rpc('query', params, opts);
  return JSON.parse(Buffer.from(result.result).toString('utf8'));
}

const brief = (h) => ({ height: h.height, timeMs: Number(BigInt(h.timestamp_nanosec ?? h.timestamp) / 1_000_000n), totalSupplyYocto: h.total_supply });

// Header of the block at `height`: { height, timeMs, totalSupplyYocto }.
// Heights can be skipped on NEAR; then the next existing block is returned.
export async function blockInfo(height) {
  for (let h = height; h < height + 30; h++) {
    // The block server throttles hard. When its queue is backed up, ask the
    // RPC node for the same header instead.
    const nd = lane(NEARDATA);
    if (Math.max(nd.nextFree, nd.pausedUntil) - Date.now() > 1_500) {
      try {
        return brief((await rpc('block', { block_id: h })).header);
      } catch (err) {
        if (err instanceof RpcError && err.code === 'UNKNOWN_BLOCK') continue;
        throw err;
      }
    }
    const found = await paced(NEARDATA, async () => {
      const res = await fetch(`${NEARDATA}/v0/block/${h}/headers`, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) throw new Throttled(Number(res.headers.get('retry-after') || 0) * 1000);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return body?.header ? brief(body.header) : null; // null body = skipped height
    });
    if (found) return found;
  }
  throw new RpcError(`no block found in [${height}, ${height + 30})`, 'UNKNOWN_BLOCK');
}

export async function headInfo() {
  const r = await rpc('block', { finality: 'final' });
  return brief(r.header);
}

// Run async jobs with bounded concurrency, preserving order.
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export const providerStats = () => [...lanes.values()]
  .map((p) => `${new URL(p.url).host} ok=${p.ok} limited=${p.limited} failed=${p.failed}`).join(' | ');
