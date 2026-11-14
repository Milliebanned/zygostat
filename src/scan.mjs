// Solvency scan: at a block, read what intents.near says users own ("credits")
// and what intents.near actually holds in each token contract ("held").
//
//   credits  = intents.near :: mt_batch_supply(token_ids)
//   held     = <token contract> :: ft_balance_of(intents.near)            (nep141)
//            = <multi-token contract> :: mt_batch_balance_of(intents.near) (nep245)
//
// If credits > held for a token, users are owed more of it than the contract
// has. That is the invariant the October 2026 exploit broke.
//
// The public node allows about 60 requests a minute, so each plan spends
// requests where they matter:
//
//   node src/scan.mjs head                              every token, at the chain head
//   node src/scan.mjs majors                            choose the tokens the series plan reads (from the head reading)
//   node src/scan.mjs series 2025-11-16 2026-11-13 7    every 7th UTC midnight: all credits, HOT backing, major-token backing
//   node src/scan.mjs full   2025-12-01 2026-11-01 30   every 30th UTC midnight: every token
//   node src/scan.mjs micro  2026-09-28 2026-10-05 3000 every 3000 blocks: HOT Omni tokens only (2 requests a reading)

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { view, blockInfo, headInfo, pool, RpcError, INTENTS, providerStats } from './rpc.mjs';
import { blockSoonAfter, utcDays, isoDay } from './blocks.mjs';
import { loadRegistry, toUnits } from './registry.mjs';

const RAW = new URL('../data/raw/', import.meta.url);
const exists = (u) => access(u).then(() => true, () => false);
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const readJson = async (u, fallback) => ((await exists(u)) ? JSON.parse(await readFile(u, 'utf8')) : fallback);

// One reading at block `blk` ({ height, timeMs, totalSupplyYocto }).
//   scope 'all'    credits for every checkable token; held for nep245 + `backing`
//   scope 'nep245' credits and held for multi tokens only (2 requests)
//   backing 'all' | Set of nep141 assetIds
export async function scanBlock(blk, registry, { scope = 'all', backing = 'all' } = {}) {
  const at = blk.height;
  const tokens = registry.tokens.filter((t) => t.checkable && (scope === 'all' || t.standard === 'nep245'));
  const credits = {};
  const held = {};
  const errors = {};

  await pool(chunk(tokens, 110), 2, async (part) => {
    try {
      const r = await view(INTENTS, 'mt_batch_supply', { token_ids: part.map((t) => t.assetId) }, at);
      part.forEach((t, i) => { credits[t.assetId] = r[i] ?? '0'; });
    } catch (err) {
      if (!(err instanceof RpcError)) throw err;
      part.forEach((t) => { errors[t.assetId] = `credits:${err.code}`; });
    }
  });

  const byContract = new Map();
  for (const t of tokens) if (t.standard === 'nep245') byContract.set(t.contract, [...(byContract.get(t.contract) || []), t]);
  await pool([...byContract], 2, async ([contract, part]) => {
    try {
      const r = await view(contract, 'mt_batch_balance_of', { account_id: INTENTS, token_ids: part.map((t) => t.tokenId) }, at);
      part.forEach((t, i) => { held[t.assetId] = r[i] ?? '0'; });
    } catch (err) {
      if (!(err instanceof RpcError)) throw err;
      part.forEach((t) => { errors[t.assetId] = `held:${err.code}`; });
    }
  });

  // Fungible tokens: one request per token contract. Skipped when nothing is
  // credited at this block (nothing owed, nothing to back).
  if (scope === 'all') {
    const want = tokens.filter((t) => t.standard === 'nep141'
      && (backing === 'all' || backing.has(t.assetId))
      && credits[t.assetId] !== undefined && credits[t.assetId] !== '0');
    await pool(want, 4, async (t) => {
      try {
        held[t.assetId] = await view(t.contract, 'ft_balance_of', { account_id: INTENTS }, at);
      } catch (err) {
        if (!(err instanceof RpcError)) throw err;
        errors[t.assetId] = `held:${err.code}`;
      }
    });
  }

  return {
    height: at,
    time: new Date(blk.timeMs).toISOString(),
    totalSupplyYocto: blk.totalSupplyYocto,
    scope,
    backing: scope === 'nep245' ? 'nep245' : backing === 'all' ? 'all' : 'major',
    credits,
    held,
    errors,
  };
}

// Tokens whose backing the `series` plan reads: the largest fungible tokens by
// credited USD value at the head reading, until 98% of that value is covered.
export function chooseMajors(headReading, registry, { coverage = 0.98, min = 8, max = 24 } = {}) {
  const rows = registry.tokens
    .filter((t) => t.standard === 'nep141' && headReading.credits[t.assetId])
    .map((t) => ({ assetId: t.assetId, usd: toUnits(headReading.credits[t.assetId], t.decimals) * t.priceUsd }))
    .sort((x, y) => y.usd - x.usd);
  const total = rows.reduce((s, r) => s + r.usd, 0);
  const picked = [];
  let sum = 0;
  for (const r of rows) {
    if (picked.length >= max) break;
    if (picked.length >= min && sum / total >= coverage) break;
    picked.push(r.assetId);
    sum += r.usd;
  }
  return { assetIds: picked, coveredShare: total ? sum / total : 0, nep141CreditsUsd: total };
}

async function main() {
  const [plan, a, b, c] = process.argv.slice(2);
  const registry = await loadRegistry();
  const save = async (dir, name, data) => {
    await mkdir(new URL(`scan/${dir}/`, RAW), { recursive: true });
    await writeFile(new URL(`scan/${dir}/${name}.json`, RAW), JSON.stringify(data) + '\n');
  };

  if (plan === 'majors') {
    const headReading = JSON.parse(await readFile(new URL('scan/head/latest.json', RAW), 'utf8'));
    const m = chooseMajors(headReading, registry);
    await writeFile(new URL('major.json', RAW), JSON.stringify({ chosenAtBlock: headReading.height, chosenAt: headReading.time, rule: 'largest nep141 tokens by credited USD until 98% is covered (min 8, max 24)', ...m }, null, 1) + '\n');
    console.log(`majors: ${m.assetIds.length} tokens cover ${(m.coveredShare * 100).toFixed(2)}% of $${Math.round(m.nep141CreditsUsd).toLocaleString()} nep141 credits`);
    return;
  }

  const top = await headInfo();

  if (plan === 'head') {
    const r = await scanBlock(top, registry, { scope: 'all', backing: 'all' });
    await save('head', 'latest', r);
    console.log(`head ${r.height} ${r.time}: ${Object.keys(r.credits).length} credits, ${Object.keys(r.held).length} held, ${Object.keys(r.errors).length} errors | ${providerStats()}`);
    return;
  }

  const blocksPath = new URL('blocks.json', RAW);
  const cache = await readJson(blocksPath, {});
  const flush = () => writeFile(blocksPath, JSON.stringify(cache) + '\n');
  const midnight = async (ms) => {
    const key = isoDay(ms);
    // The first block found within two minutes after 00:00 UTC.
    if (!cache[key]) { cache[key] = await blockSoonAfter(ms, { top, known: Object.values(cache) }); await flush(); }
    return cache[key];
  };

  if (plan === 'series' || plan === 'full') {
    const backing = plan === 'full' ? 'all' : new Set((await readJson(new URL('major.json', RAW))).assetIds);
    // Newest first, so an interrupted run still covers the recent past.
    const days = utcDays(a, b, Number(c || 1)).filter((ms) => ms <= top.timeMs).reverse();
    let done = 0;
    for (const ms of days) {
      const name = isoDay(ms);
      if (!(await exists(new URL(`scan/${plan}/${name}.json`, RAW)))) {
        await save(plan, name, await scanBlock(await midnight(ms), registry, { scope: 'all', backing }));
      }
      if (++done % 5 === 0 || done === days.length) console.log(`${plan} ${done}/${days.length} ${name} | ${providerStats()}`);
    }
    return;
  }

  if (plan === 'micro') {
    const from = await midnight(Date.parse(a + 'T00:00:00Z'));
    const to = await midnight(Date.parse(b + 'T00:00:00Z'));
    const heights = [];
    for (let x = from.height; x <= to.height; x += Number(c || 3000)) heights.push(x);
    let done = 0;
    for (const x of heights) {
      if (!(await exists(new URL(`scan/micro/${x}.json`, RAW)))) {
        await save('micro', String(x), await scanBlock(await blockInfo(x), registry, { scope: 'nep245' }));
      }
      if (++done % 20 === 0 || done === heights.length) console.log(`micro ${done}/${heights.length} | ${providerStats()}`);
    }
    return;
  }

  console.error('usage: node src/scan.mjs head | majors | series <from> <to> [stepDays] | full <from> <to> [stepDays] | micro <from> <to> [stepBlocks]');
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
