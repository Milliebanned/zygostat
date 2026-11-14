// Check every claim the thesis makes, and print PASS or FAIL for each.
//
//   node src/verify.mjs          offline: uses only the committed raw data (about a second)
//   node src/verify.mjs --live   also reads the chain now (about 35 requests, under a minute)
//
// Exit code 0 when every check passes, 1 otherwise.

import { build, load } from './build.mjs';
import { readFile, access } from 'node:fs/promises';
import { summarise, tokenRows, isMaterial } from './metrics.mjs';
import { INCIDENT } from './results.mjs';
import { view, headInfo, blockInfo, CROSSCHECK, INTENTS, providerStats } from './rpc.mjs';
import { scanBlock } from './scan.mjs';

const ROOT = new URL('../', import.meta.url);
const exists = (u) => access(u).then(() => true, () => false);
let failed = 0;
const check = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };
const note = (text) => console.log(`      ${text}`);
const $ = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

const data = await load();
const { results: r, files } = await build();
const s = r.solvency;

console.log('Outputs are a pure function of the committed data');
for (const [name, text] of Object.entries(files)) {
  const onDisk = (await exists(new URL(name, ROOT))) ? await readFile(new URL(name, ROOT), 'utf8') : null;
  check(onDisk === text, `${name} matches a fresh rebuild`);
}

console.log('\nRaw data is complete');
const all = [data.head, ...data.seriesReadings, ...data.microReadings, ...data.refineReadings, ...data.fullReadings];
check(all.every((x) => Number.isInteger(x.height) && x.time && x.credits && x.held), `${all.length} readings each carry a block height, a time, credits and holdings`);
check(all.every((x) => Object.keys(x.errors || {}).length === 0), 'no reading contains a failed request', `${all.reduce((n, x) => n + Object.keys(x.errors || {}).length, 0)} errors`);
check(data.registry.tokens.filter((t) => t.checkable).length === r.sources.checkableTokens && r.sources.checkableTokens > 100, `token registry lists ${r.sources.checkableTokens} checkable tokens`);

console.log('\nClaim: the contract is fully backed at the latest reading');
const rows = tokenRows(data.head, data.registry);
const short = rows.filter(isMaterial);
check(short.length === 0, `block ${s.head.height}: none of ${rows.length} tokens has a material shortfall`, `credited ${$(s.head.creditsUsd)}, held ${$(s.head.heldUsd)}`);
check(s.head.heldUsd >= s.head.creditsUsd, 'holdings are at least credits in total');

console.log('\nClaim: the October 2026 exploit is visible in chain state');
const ep = s.episode;
check(ep !== null, 'the exploit-week readings contain a material shortfall');
if (ep) {
  const official = 3_800_000;
  check(Math.abs(ep.peak.shortfallUsd - official) / official < 0.05, 'largest shortfall is within 5% of the $3.8M in the official postmortem', $(ep.peak.shortfallUsd));
  check(ep.firstShort.time >= '2026-09-29T16:14' && ep.firstShort.time < '2026-10-01T08:33', 'the shortfall first appears after the first attacker transaction and before the pause', ep.firstShort.time);
  check(ep.lastCleanBefore !== null && ep.firstCleanAfter !== null, 'a fully backed reading exists on both sides of the episode');
  check(ep.firstCleanAfter !== null && ep.firstCleanAfter.time < '2026-10-04', 'backing is restored within three days', ep.firstCleanAfter?.time);
  note(`under-backed for ${ep.minHours.toFixed(1)} to ${ep.maxHours?.toFixed(1)} hours; ${ep.readingsShort} readings short; worst token ${ep.peak.worst.symbol} on ${ep.peak.worst.blockchain}`);
}

console.log(`\nClaim: no material shortfall since ${INCIDENT.cleanFrom}`);
check(s.sinceFix.readings >= 20, `at least 20 readings exist after ${INCIDENT.cleanFrom}`, `${s.sinceFix.readings} readings`);
check(s.sinceFix.material === 0, 'none of them shows a material shortfall', `largest shortfall of any size ${$(s.sinceFix.maxShortfallUsd)}`);

console.log('\nClaim: supply quoted from NearBlocks agrees with NEAR block headers');
{
  let worst = 0, n = 0;
  for (const x of data.seriesReadings) {
    const q = data.series.near[x.time.slice(0, 10)];
    if (!q || !x.totalSupplyYocto) continue;
    const chain = Number(BigInt(x.totalSupplyYocto) / 10n ** 18n) / 1e6;
    worst = Math.max(worst, Math.abs(q.totalSupplyNear - chain) / chain);
    n++;
  }
  check(n > 0 && worst < 0.001, `${n} days compared; largest difference under 0.1%`, `${(worst * 100).toFixed(4)}%`);
}

console.log('\nConditions that would change the thesis');
for (const k of r.kill) console.log(`${k.status === 'holds' ? 'HOLDS    ' : k.status === 'triggered' ? 'TRIGGERED' : 'NOT MEASURED'}  ${k.id} ${k.title}: ${k.rule}`);
check(r.kill.every((k) => k.status !== 'not measured'), 'every condition could be measured');

if (process.argv.includes('--live')) {
  console.log('\nLive: the solvency check again, now');
  const top = await headInfo();
  const live = summarise(await scanBlock(top, data.registry, { scope: 'all', backing: new Set(data.major.assetIds) }), data.registry);
  check(live.tokensMaterial === 0, `block ${live.height}: none of ${live.tokensChecked} tokens has a material shortfall`, `credited ${$(live.creditsUsd)}, held ${$(live.heldUsd)}, shortfall ${$(live.shortfallUsd)}`);

  console.log('\nLive: a committed reading can be reproduced from the chain');
  const sample = data.microReadings.find((x) => ep && x.height === ep.peak.height) ?? data.microReadings[0];
  if (sample) {
    const again = await scanBlock(await blockInfo(sample.height), data.registry, { scope: 'nep245' });
    const same = Object.keys(sample.credits).every((k) => sample.credits[k] === again.credits[k] && sample.held[k] === again.held[k]);
    check(same, `block ${sample.height}: every multi-token credit and holding matches the committed file`);
    if (ep) {
      // The same value from a second, independent public node.
      const tok = data.registry.tokens.find((t) => t.assetId === ep.peak.worst.assetId);
      try {
        const [other] = await view(INTENTS, 'mt_batch_supply', { token_ids: [tok.assetId] }, sample.height, { url: CROSSCHECK[0] });
        check(other === sample.credits[tok.assetId], `a second public node (${new URL(CROSSCHECK[0]).host}) returns the same credits for ${tok.symbol} at that block`);
      } catch (err) {
        note(`second node not reachable (${err.message}); skipped, not counted as a failure`);
      }
    }
  }
  note(providerStats());
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASS' : `${failed} CHECK(S) FAILED`}`);
process.exit(failed ? 1 : 0);
