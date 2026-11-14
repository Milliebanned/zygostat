# Zygostat: a solvency-first investment thesis for NEAR

Data as of {{as_of}}. {{kill_holds}} of {{kill_total}} conditions hold, {{kill_triggered}} triggered, {{kill_not_measured}} not measured.

This file is generated. Every number in it is written by `node src/build.mjs` from the raw data in `data/raw/`, and `node src/build.mjs --check` fails if the file and the data disagree. To change a number, change the data or the code, not this text. The source of the text is `src/thesis.tmpl.md`.

This is research, not financial advice.

## The claim

NEAR's long-term value now depends on one product. NEAR Intents is where the usage is, and it is the only part of NEAR that earns meaningful money for the token. So the long-term case for NEAR is a bet that Intents becomes a place where cross-chain money settles, and stays one.

A settlement layer has to hold what it owes. If the contract that keeps users' money can owe more than it holds, growth in volume does not help the thesis, it enlarges the hole. Most analysis of NEAR measures usage and fees. This thesis starts one step earlier: it measures solvency directly from public chain state, then prices the risk that solvency fails, and only then asks whether what is left is worth owning.

**The thesis: NEAR is a long-term hold only while four measured conditions hold (usage, value capture, solvency, and an affordable security cost). Today {{kill_holds}} of {{kill_total}} hold.**

## Verdict

- **{{v_usage}}** Intents handled {{vol30}} in the last 30 days, {{vol30_change}} on the same 30 days a year earlier.
- **{{v_capture}}** NEAR captured {{rev90}} in the last 90 days. At that pace it covers {{cov_ann90}} of the value of a year's new NEAR supply. {{v_capture_tail}}
- **{{v_solvent}}** At block {{head_block}} ({{head_time}}), {{head_tokens}} tokens were checked: {{head_credits_exact}} credited to users, {{head_held_exact}} held, shortfall {{head_shortfall}}.
- **It was not solvent in October.** For between {{ep_min_hours}} and {{ep_max_hours}} hours, users were credited {{ep_peak_usd_exact}} more of one token than the contract held. This repository reproduces that from chain state.
- **{{v_risk}}** An allowance for the next loss event consumes {{m_base_drag}} of captured revenue in the base case. At the top of the 90% interval for the event rate, with nothing recovered, it consumes {{g_high_0_drag}}.

The case for NEAR is therefore conditional, and the condition that matters most is the one the market cannot see on a price chart: whether `intents.near` holds what it owes. That can be checked by anyone, at any block, with two calls. This repository does it and keeps doing it.

## Evidence

### 1. Usage moved into Intents

| Measure | Now | A year earlier | Change |
|---|---|---|---|
| Intents volume, 30 days | {{vol30}} | {{vol30_prev}} | {{vol30_change}} |
| Base-layer transactions a day (30-day mean) | {{l1_tx}} | {{l1_tx_prev}} | {{l1_tx_change}} |
| Base-layer active accounts a day (30-day mean) | {{l1_acc}} | {{l1_acc_prev}} | {{l1_acc_change}} |

Intents volume over the last 365 days was {{vol365}}. Intents fees in the last 30 days were {{fees30}}, which is {{intents_fee_multiple}} the base layer's gas fees ({{l1_fees30}}) over the same days.

Sources: DefiLlama (`api.llama.fi/summary/dexs/near-intents`, `.../fees/near-intents`, `.../fees/near`) and NearBlocks (`api.nearblocks.io/v1/charts`). These are quoted, not recomputed here.

### 2. NEAR captures part of it, and not yet enough

| Measure | Value |
|---|---|
| Intents gross fees, 30 days | {{fees30}} ({{fee_rate_bps}} basis points of volume) |
| Revenue captured by NEAR, 30 days | {{rev30}} ({{capture_share}} of fees) |
| Revenue captured by NEAR, 90 days | {{rev90}} |
| Captured revenue, 90 days annualised | {{rev_ann90}} |
| Captured revenue, last 365 days | {{rev365}} |
| NEAR issued over the last 365 days | {{issued_near}} NEAR ({{inflation}} of supply) |
| Value of that issuance at {{price}} | {{issuance_usd}} |
| Captured revenue as a share of issuance (90 days annualised) | {{cov_ann90}} |
| The same, using the last 365 days of revenue | {{cov_365}} |
| Value of all NEAR at {{price}} | {{all_near_usd}} |
| Captured revenue as a yield on that | {{rev_yield}} |

"Revenue captured by NEAR" follows DefiLlama's definition: NEAR swept into the revenue wallets, which it says reconciles with the on-chain buyback. Supply comes from NearBlocks and is cross-checked against the `total_supply` field of NEAR block headers stored with each reading.

The gap between issuance and captured revenue is {{net_dilution_usd}} a year. {{dilution_line}}

### 3. Solvency, measured

**The check.** For each token, at a block:

- *credits* = `intents.near :: mt_batch_supply`, what the contract's own ledger says users own;
- *held* = the token contract's balance for `intents.near` (`ft_balance_of`, or `mt_batch_balance_of` for multi tokens);
- *shortfall* = credits minus held, when positive.

A shortfall is *material* when it is at least $100 and at least 1 basis point of that token's credits.

**Now.** Block {{head_block}}, {{head_time}}: {{head_tokens}} tokens checked, {{head_credits_exact}} credited, {{head_held_exact}} held, {{head_tokens_short}} tokens short, shortfall {{head_shortfall}}. The contract holds {{head_surplus}} more than it credits.

**History.** {{readings_total}} readings and {{token_checks}} token checks from {{first_reading_date}}: {{readings_daily}} at UTC midnight (weekly, then daily from 20 September 2026), {{readings_micro}} about 30 minutes apart through the exploit week, and one of every token at the head.

**The October exploit, from chain state.** Token: {{ep_token}} (`{{ep_token_id}}`).

| What the readings show | Block | Time |
|---|---|---|
| Last reading fully backed | {{ep_last_clean_block}} | {{ep_last_clean_time}} |
| First reading with a material shortfall ({{ep_first_short_usd}}) | {{ep_first_short_block}} | {{ep_first_short_time}} |
| Largest shortfall, {{ep_peak_usd_exact}} | {{ep_peak_block}} | {{ep_peak_time}} |
| Last reading still short | {{ep_last_short_block}} | {{ep_last_short_time}} |
| First reading fully backed again | {{ep_first_clean_after_block}} | {{ep_first_clean_after_time}} |

At the largest shortfall, users were credited {{ep_peak_credits_units}} tokens and the contract held {{ep_peak_held_units}}: {{ep_peak_unbacked}} of the credits had no backing. {{ep_readings_short}} readings in a row were short.

The official postmortem puts the loss at about $3.8M and the first attacker transaction at 16:14 UTC on 29 September. The figure here, {{ep_peak_usd_exact}}, was read independently from archival state and agrees with it. The postmortem also names the gap that let it run: the team compared origin-chain balances with NEAR-side balances, but did not compare users' total credits with the contract's own holdings. That second comparison is exactly the check above.

**Since the fix.** The vulnerable feature was removed on 7 October. From {{since_from}}, {{since_material}} of {{since_readings}} readings show a material shortfall. The largest shortfall of any size in that period is {{since_max_shortfall}}.

### 4. The cost of the risk

Inputs, all measured here or stated:

| Input | Value | Where it comes from |
|---|---|---|
| Captured revenue a year, R | {{m_R}} | 90 days annualised (section 2) |
| Custody, C | {{m_C}} | credits for every token at the head |
| Share of custody lost in one event, f | {{m_f}} | {{ep_peak_usd}} over {{m_custody_then}} in custody that day |
| Loss events a year | {{m_lambda}} (90% interval {{m_lambda_low}} to {{m_lambda_high}}) | 1 exploited loss in {{m_exposure_years}} years, counted from {{m_exposure_from}} |
| Revenue lost to one pause, D | {{m_D}} | fees lost over {{pause_from}} to {{pause_to}} against {{pause_baseline}}, times the capture share |
| Share of a loss recovered | 50% in the base case | 100% was observed once; that is not a rule |
| Share of an unrecovered loss paid from captured revenue, h | 100% | assumption, the hardest case for holders |

`expected cost a year = events a year x (f x C x (1 - recovered) x h + D)`

Base case: {{m_base_cost}} a year, {{m_base_drag}} of captured revenue, leaving {{m_base_adj_rev}}. One event costs {{m_event_months}} months of captured revenue. The event rate would have to reach {{m_breakeven}} a year to consume all of it.

Expected cost a year, with its share of captured revenue:

| Loss events a year | Fully recovered | Half recovered | Nothing recovered |
|---|---|---|---|
| {{m_lambda_low}} (low end) | {{g_low_100_cost}} ({{g_low_100_drag}}) | {{g_low_50_cost}} ({{g_low_50_drag}}) | {{g_low_0_cost}} ({{g_low_0_drag}}) |
| {{m_lambda}} (observed) | {{g_observed_100_cost}} ({{g_observed_100_drag}}) | {{g_observed_50_cost}} ({{g_observed_50_drag}}) | {{g_observed_0_cost}} ({{g_observed_0_drag}}) |
| {{m_lambda_high}} (high end) | {{g_high_100_cost}} ({{g_high_100_drag}}) | {{g_high_50_cost}} ({{g_high_50_drag}}) | {{g_high_0_cost}} ({{g_high_0_drag}}) |

The pause itself was not free. Volume over {{pause_from}} to {{pause_to}} was {{pause_volume}} against {{pause_volume_base}} a week earlier ({{pause_volume_change}}), and {{pause_fees_lost}} of fees went missing. Users came back: volume in the last 30 days is {{retention_change}} against the 30 days to {{retention_before_to}}, before the attack began.

## Evidence against the thesis

These are the facts that cut against owning NEAR on this argument. They are not footnotes.

1. **The base layer is shrinking.** Transactions are {{l1_tx_change}} and active accounts {{l1_acc_change}} year on year. NEAR as a busy general-purpose chain is not what this thesis buys.
2. **Captured revenue is small against dilution.** {{cov_ann90}} coverage means the token still inflates net, by about {{net_dilution_usd}} a year at today's price. As a yield on the value of all NEAR, captured revenue is {{rev_yield}}.
3. **The solvency invariant has already failed once, and nobody was watching it.** By the postmortem's own timeline the attack ran from 29 September to 1 October before it was noticed. The readings here show the contract under-backed for {{ep_min_hours}} to {{ep_max_hours}} hours.
4. **It was the third critical finding in one feature in a year.** The postmortem lists a similar report in January and another on 7 October, after the exploit. One feature produced all three.
5. **Recovery was a negotiation, not a control.** The funds came back because the attacker agreed to return them. The model's base case does not assume that happens again.
6. **CertiK reports a gap between published and deployed code.** Its analysis says a refund cap was added to the public repository in March 2026 while the contract deployed on 1 October lacked it. This repository has not verified that claim; it is quoted because, if true, it is a process risk that no on-chain balance check can see.
7. **The rate is one data point.** One event in {{m_exposure_years}} years supports anything from {{m_lambda_low}} to {{m_lambda_high}} events a year. {{rate_line}}
8. **Fees are quoted, not derived.** Volume, fees and revenue come from DefiLlama, and this repository does not recompute them from chain data. The solvency numbers are independent of that source; the value-capture numbers are not.

## What would change the thesis

Each condition is a number recomputed on every build. The thresholds were written on 2026-11-13 after a first look at the data, so today they describe the past. They bind on every later rebuild, and a triggered condition is printed here as TRIGGERED, not explained away.

| | Condition | Now | Status |
|---|---|---|---|
| K1 | No reading after {{since_from}} shows a material shortfall | {{k1_value}} | {{k1_status}} |
| K2 | Intents 30-day volume is not below the same 30 days a year earlier | {{k2_value}} | {{k2_status}} |
| K3 | Captured revenue (90 days annualised) is at least 10% of the value of a year's new supply | {{k3_value}} | {{k3_status}} |
| K4 | Expected yearly security cost (observed rate, half recovered) is at most 25% of captured revenue | {{k4_value}} | {{k4_status}} |

K1 is the one to watch. A single material shortfall after {{since_from}} means the fix did not hold, and the thesis fails on that reading alone, whatever volume is doing.

What would make the case stronger, and is not true yet: captured revenue above the value of new issuance; a second independent party publishing the same solvency check; the formal verification the postmortem promises, delivered.

## What this does not measure

- **Origin-chain backing.** The check proves `intents.near` holds the NEAR-side tokens it credits. It does not prove each bridged token is backed on its home chain.
- **Confidential balances.** They are not on the public ledger.
- **Tokens off the list.** {{checkable_tokens}} of the {{registry_tokens}} assets on the 1Click list have a token contract on NEAR and are checked. The other {{uncheckable_tokens}} have none. Tokens in the contract that are not on the list, and NFTs, are not checked.
- **Between readings.** History is sampled. A shortfall that opened and closed between two readings would not appear.
- **Past dollar values.** Token amounts are exact. Dollar totals use one price per token, taken on {{registry_date}}.
- **Price.** Nothing here forecasts the price of NEAR.

## Reproduce it

```sh
node --test                    # unit tests, offline
node src/build.mjs --check     # this file, the dashboard and results.json match the committed data
node src/verify.mjs            # each claim above, checked against the raw readings
node src/verify.mjs --live     # the solvency check again, now, against the live chain
```

`README.md` has the full steps, the expected output of each, and the data sources.
