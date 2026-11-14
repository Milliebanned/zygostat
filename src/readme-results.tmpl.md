Series as of {{as_of}}. Chain read at block {{head_block}} ({{head_time}}). {{readings_total}} readings, {{token_checks}} token checks.

| Question | Answer from the data |
|---|---|
| Do the four conditions hold? | K1 solvency: {{k1_status}}. K2 usage: {{k2_status}}. K3 value capture: {{k3_status}}. K4 security cost: {{k4_status}}. |
| Is Intents used? | {{vol30}} in 30 days, {{vol30_change}} on a year earlier. Base-layer transactions are {{l1_tx_change}}. |
| Does NEAR capture value? | {{rev_ann90}} a year (90 days annualised), which is {{cov_ann90}} of the value of a year's new NEAR supply. |
| Is `intents.near` fully backed now? | Yes. {{head_credits_exact}} credited to users, {{head_held_exact}} held, shortfall {{head_shortfall}}, across {{head_tokens}} tokens. |
| Was it ever not? | Yes. {{ep_peak_usd_exact}} short on {{ep_token}} at block {{ep_peak_block}} ({{ep_peak_time}}): {{ep_peak_unbacked}} of that token's credits had no backing. |
| For how long? | Between {{ep_min_hours}} and {{ep_max_hours}} hours (first short reading {{ep_first_short_time}}, backed again by {{ep_first_clean_after_time}}). |
| Since the fix? | {{since_material}} of {{since_readings}} readings after {{since_from}} show a material shortfall. |
| What does the security risk cost? | {{m_base_cost}} a year in the base case, {{m_base_drag}} of captured revenue. One event costs {{m_event_months}} months of it. |
