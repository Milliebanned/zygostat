# Zygostat: a solvency-first investment thesis for NEAR

Data as of 2026-11-13. 4 of 4 conditions hold, 0 triggered, 0 not measured.

This file is generated. Every number in it is written by `node src/build.mjs` from the raw data in `data/raw/`, and `node src/build.mjs --check` fails if the file and the data disagree. To change a number, change the data or the code, not this text. The source of the text is `src/thesis.tmpl.md`.

This is research, not financial advice.

## The claim

NEAR's long-term value now depends on one product. NEAR Intents is where the usage is, and it is the only part of NEAR that earns meaningful money for the token. So the long-term case for NEAR is a bet that Intents becomes a place where cross-chain money settles, and stays one.

A settlement layer has to hold what it owes. If the contract that keeps users' money can owe more than it holds, growth in volume does not help the thesis, it enlarges the hole. Most analysis of NEAR measures usage and fees. This thesis starts one step earlier: it measures solvency directly from public chain state, then prices the risk that solvency fails, and only then asks whether what is left is worth owning.

**The thesis: NEAR is a long-term hold only while four measured conditions hold (usage, value capture, solvency, and an affordable security cost). Today 4 of 4 hold.**

## Verdict

- **Usage is real.** Intents handled $3.8B in the last 30 days, +44% on the same 30 days a year earlier.
- **Value capture is real but small.** NEAR captured $5.24M in the last 90 days. At that pace it covers 19.6% of the value of a year's new NEAR supply. Holders are still being diluted.
- **The contract is solvent now.** At block 224,484,215 (2026-11-14 07:45 UTC), 195 tokens were checked: $213,656,371 credited to users, $213,662,748 held, shortfall $0.
- **It was not solvent in October.** For between 67.3 and 68.2 hours, users were credited $3,834,195 more of one token than the contract held. This repository reproduces that from chain state.
- **The risk is affordable at the observed rate, and that rate is uncertain.** An allowance for the next loss event consumes 4.9% of captured revenue in the base case. At the top of the 90% interval for the event rate, with nothing recovered, it consumes 45.7%.

The case for NEAR is therefore conditional, and the condition that matters most is the one the market cannot see on a price chart: whether `intents.near` holds what it owes. That can be checked by anyone, at any block, with two calls. This repository does it and keeps doing it.

## Evidence

### 1. Usage moved into Intents

| Measure | Now | A year earlier | Change |
|---|---|---|---|
| Intents volume, 30 days | $3.8B | $2.64B | +44% |
| Base-layer transactions a day (30-day mean) | 678.14K | 4.38M | -85% |
| Base-layer active accounts a day (30-day mean) | 64.8K | 260.9K | -75% |

Intents volume over the last 365 days was $33B. Intents fees in the last 30 days were $5.83M, which is 45x the base layer's gas fees ($129.5K) over the same days.

Sources: DefiLlama (`api.llama.fi/summary/dexs/near-intents`, `.../fees/near-intents`, `.../fees/near`) and NearBlocks (`api.nearblocks.io/v1/charts`). These are quoted, not recomputed here.

### 2. NEAR captures part of it, and not yet enough

| Measure | Value |
|---|---|
| Intents gross fees, 30 days | $5.83M (15.4 basis points of volume) |
| Revenue captured by NEAR, 30 days | $1.81M (31.0% of fees) |
| Revenue captured by NEAR, 90 days | $5.24M |
| Captured revenue, 90 days annualised | $21.2M |
| Captured revenue, last 365 days | $9.4M |
| NEAR issued over the last 365 days | 31.74M NEAR (2.48% of supply) |
| Value of that issuance at $3.42 | $108.5M |
| Captured revenue as a share of issuance (90 days annualised) | 19.6% |
| The same, using the last 365 days of revenue | 8.7% |
| Value of all NEAR at $3.42 | $4.48B |
| Captured revenue as a yield on that | 0.47% |

"Revenue captured by NEAR" follows DefiLlama's definition: NEAR swept into the revenue wallets, which it says reconciles with the on-chain buyback. Supply comes from NearBlocks and is cross-checked against the `total_supply` field of NEAR block headers stored with each reading.

The gap between issuance and captured revenue is $87.3M a year. Until captured revenue grows to several times its present size, a NEAR holder is paying for security with dilution, and Intents offsets under a fifth of it.

### 3. Solvency, measured

**The check.** For each token, at a block:

- *credits* = `intents.near :: mt_batch_supply`, what the contract's own ledger says users own;
- *held* = the token contract's balance for `intents.near` (`ft_balance_of`, or `mt_batch_balance_of` for multi tokens);
- *shortfall* = credits minus held, when positive.

A shortfall is *material* when it is at least $100 and at least 1 basis point of that token's credits.

**Now.** Block 224,484,215, 2026-11-14 07:45 UTC: 195 tokens checked, $213,656,371 credited, $213,662,748 held, 0 tokens short, shortfall $0. The contract holds $6,377 more than it credits.

**History.** 439 readings and 17,511 token checks from 2025-11-16: 100 at UTC midnight (weekly, then daily from 20 September 2026), 338 about 30 minutes apart through the exploit week, and one of every token at the head.

**The October exploit, from chain state.** Token: USDT(DEPRECATED) on BSC (`nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g`).

| What the readings show | Block | Time |
|---|---|---|
| Last reading fully backed | 217,846,962 | 2026-09-30 00:15 UTC |
| First reading with a material shortfall ($2,548) | 217,849,962 | 2026-09-30 00:44 UTC |
| Largest shortfall, $3,834,195 | 217,996,962 | 2026-10-01 01:57 UTC |
| Last reading still short | 218,248,962 | 2026-10-02 20:00 UTC |
| First reading fully backed again | 218,251,962 | 2026-10-02 20:30 UTC |

At the largest shortfall, users were credited 3,842,954 tokens and the contract held 5,805: 99.8% of the credits had no backing. 134 readings in a row were short.

The official postmortem puts the loss at about $3.8M and the first attacker transaction at 16:14 UTC on 29 September. The figure here, $3,834,195, was read independently from archival state and agrees with it. The postmortem also names the gap that let it run: the team compared origin-chain balances with NEAR-side balances, but did not compare users' total credits with the contract's own holdings. That second comparison is exactly the check above.

**Since the fix.** The vulnerable feature was removed on 7 October. From 2026-10-08, 0 of 39 readings show a material shortfall. The largest shortfall of any size in that period is $0.

### 4. The cost of the risk

Inputs, all measured here or stated:

| Input | Value | Where it comes from |
|---|---|---|
| Captured revenue a year, R | {{m_R}} | 90 days annualised (section 2) |
| Custody, C | {{m_C}} | credits for every token at the head |
| Share of custody lost in one event, f | 1.82% | $3.83M over $210.1M in custody that day |
| Loss events a year | 0.52 (90% interval 0.03 to 2.46) | 1 exploited loss in 1.92 years, counted from 2024-12-10 |
| Revenue lost to one pause, D | {{m_D}} | fees lost over 2026-10-01 to 2026-10-04 against 2026-09-24 to 2026-09-27, times the capture share |
| Share of a loss recovered | 50% in the base case | 100% was observed once; that is not a rule |
| Share of an unrecovered loss paid from captured revenue, h | 100% | assumption, the hardest case for holders |

`expected cost a year = events a year x (f x C x (1 - recovered) x h + D)`

Base case: $1.03M a year, 4.9% of captured revenue, leaving $20.2M. One event costs 1.1 months of captured revenue. The event rate would have to reach 10.7 a year to consume all of it.

Expected cost a year, with its share of captured revenue:

| Loss events a year | Fully recovered | Half recovered | Nothing recovered |
|---|---|---|---|
| 0.03 (low end) | $952 (0.0%) | $52.9K (0.2%) | $104.86K (0.5%) |
| 0.52 (observed) | $18.56K (0.1%) | $1.03M (4.9%) | $2.04M (9.6%) |
| 2.46 (high end) | $88.03K (0.4%) | $4.89M (23.0%) | $9.7M (45.7%) |

The pause itself was not free. Volume over 2026-10-01 to 2026-10-04 was $390.2M against $570.5M a week earlier (-31.6%), and $115.24K of fees went missing. Users came back: volume in the last 30 days is -18% against the 30 days to 2026-09-28, before the attack began.

## Evidence against the thesis

These are the facts that cut against owning NEAR on this argument. They are not footnotes.

1. **The base layer is shrinking.** Transactions are -85% and active accounts -75% year on year. NEAR as a busy general-purpose chain is not what this thesis buys.
2. **Captured revenue is small against dilution.** 19.6% coverage means the token still inflates net, by about $87.3M a year at today's price. As a yield on the value of all NEAR, captured revenue is 0.47%.
3. **The solvency invariant has already failed once, and nobody was watching it.** By the postmortem's own timeline the attack ran from 29 September to 1 October before it was noticed. The readings here show the contract under-backed for 67.3 to 68.2 hours.
4. **It was the third critical finding in one feature in a year.** The postmortem lists a similar report in January and another on 7 October, after the exploit. One feature produced all three.
5. **Recovery was a negotiation, not a control.** The funds came back because the attacker agreed to return them. The model's base case does not assume that happens again.
6. **CertiK reports a gap between published and deployed code.** Its analysis says a refund cap was added to the public repository in March 2026 while the contract deployed on 1 October lacked it. This repository has not verified that claim; it is quoted because, if true, it is a process risk that no on-chain balance check can see.
7. **The rate is one data point.** One event in 1.92 years supports anything from 0.03 to 2.46 events a year. The thesis survives the middle of that range and is strained at the top of it.
8. **Fees are quoted, not derived.** Volume, fees and revenue come from DefiLlama, and this repository does not recompute them from chain data. The solvency numbers are independent of that source; the value-capture numbers are not.

## What would change the thesis

Each condition is a number recomputed on every build. The thresholds were written on 2026-11-13 after a first look at the data, so today they describe the past. They bind on every later rebuild, and a triggered condition is printed here as TRIGGERED, not explained away.

| | Condition | Now | Status |
|---|---|---|---|
| K1 | No reading after 2026-10-08 shows a material shortfall | 0 of 39 readings | HOLDS |
| K2 | Intents 30-day volume is not below the same 30 days a year earlier | +44% | HOLDS |
| K3 | Captured revenue (90 days annualised) is at least 10% of the value of a year's new supply | 19.6% | HOLDS |
| K4 | Expected yearly security cost (observed rate, half recovered) is at most 25% of captured revenue | 4.9% | HOLDS |

K1 is the one to watch. A single material shortfall after 2026-10-08 means the fix did not hold, and the thesis fails on that reading alone, whatever volume is doing.

What would make the case stronger, and is not true yet: captured revenue above the value of new issuance; a second independent party publishing the same solvency check; the formal verification the postmortem promises, delivered.

## What this does not measure

- **Origin-chain backing.** The check proves `intents.near` holds the NEAR-side tokens it credits. It does not prove each bridged token is backed on its home chain.
- **Confidential balances.** They are not on the public ledger.
- **Tokens off the list.** 203 of the 231 assets on the 1Click list have a token contract on NEAR and are checked. The other 28 have none. Tokens in the contract that are not on the list, and NFTs, are not checked.
- **Between readings.** History is sampled. A shortfall that opened and closed between two readings would not appear.
- **Past dollar values.** Token amounts are exact. Dollar totals use one price per token, taken on 2026-11-14.
- **Price.** Nothing here forecasts the price of NEAR.

## Reproduce it

```sh
node --test                    # unit tests, offline
node src/build.mjs --check     # this file, the dashboard and results.json match the committed data
node src/verify.mjs            # each claim above, checked against the raw readings
node src/verify.mjs --live     # the solvency check again, now, against the live chain
```

`README.md` has the full steps, the expected output of each, and the data sources.
