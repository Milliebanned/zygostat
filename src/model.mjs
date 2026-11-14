// Security-risk-adjusted value capture.
//
// Question: how much of the revenue NEAR captures from Intents survives once
// the chance of another loss event is priced in?
//
// Every input is either measured in this repository or stated as an
// assumption, and each can be changed on the dashboard.
//
//   R   captured revenue per year (USD)                         measured (DefiLlama, quoted)
//   C   value in custody: credits recorded by intents.near (USD) measured (chain)
//   f   share of custody lost in one event                      measured (peak shortfall / credits, October 2026)
//   λ   loss events per year                                    estimated from 1 event over the protocol's life
//   ρ   share of a loss that is recovered                       1 of 1 observed; cannot be assumed
//   D   revenue lost to the pause, per event (USD)              measured (pause days vs the days before)
//   h   share of an unrecovered loss that NEAR's captured        assumption (1 = users are made whole out of
//       revenue ends up paying for                               that revenue; 0 = holders never pay)

export function riskAdjusted({ R, C, f, lambda, rho, D, h }) {
  const grossLossPerEvent = f * C;
  const netCostPerEvent = grossLossPerEvent * (1 - rho) * h + D;
  const expectedAnnualCost = lambda * netCostPerEvent;
  return {
    grossLossPerEvent,
    netCostPerEvent,
    expectedAnnualCost,
    riskAdjustedRevenue: R - expectedAnnualCost,
    drag: R ? expectedAnnualCost / R : null, // share of captured revenue consumed
    // Events per year at which the expected cost equals all captured revenue.
    breakEvenLambda: netCostPerEvent > 0 ? R / netCostPerEvent : Infinity,
    // One event, in years of captured revenue.
    yearsOfRevenuePerEvent: R ? netCostPerEvent / R : null,
  };
}

// Exact (Garwood) Poisson confidence interval for a rate, from `events`
// observed over `years`. The bounds are the means at which the observed count
// sits in each tail, found by bisection on the Poisson distribution itself.
export function poissonRate(events, years, conf = 0.9) {
  const a = 1 - conf;
  const lowerCount = events === 0 ? 0 : solve((m) => poissonSf(events - 1, m) - a / 2, 0, events + 1);
  const upperCount = solve((m) => poissonCdf(events, m) - a / 2, events, events * 5 + 20);
  return { point: events / years, low: lowerCount / years, high: upperCount / years, conf, events, years };
}

function poissonCdf(k, mean) {
  let term = Math.exp(-mean), sum = term;
  for (let i = 1; i <= k; i++) { term *= mean / i; sum += term; }
  return sum;
}
const poissonSf = (k, mean) => 1 - poissonCdf(k, mean); // P(X > k)

// Bisection for f(x) = 0 on [lo, hi]; f must change sign on the interval.
function solve(f, lo, hi) {
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

// The grid shown in THESIS.md: three event rates by three recovery rates.
export function scenarioGrid(base, rate) {
  const lambdas = [['low', rate.low], ['observed', rate.point], ['high', rate.high]];
  const recoveries = [1, 0.5, 0];
  return lambdas.map(([label, lambda]) => ({
    label,
    lambda,
    cells: recoveries.map((rho) => ({ rho, ...riskAdjusted({ ...base, lambda, rho }) })),
  }));
}
