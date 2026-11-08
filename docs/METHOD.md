# Method

How Punter Lab decides what to back and how much. Read this before changing any model or staking code.

## Definitions

- `p` = our estimated probability that a runner wins
- `O` = decimal odds on offer (fixed win price)
- edge = `p * O - 1`. Positive edge means the price is longer than our probability justifies.

## Part 1: the market baseline

We are not estimating `p` from scratch. The market already produces an excellent probability estimate. A model only has value if it is better calibrated than the market. Everything here is built as a correction to the market, not a replacement for it.

Implied probability is **not** `1 / O`, because the book is overround. Ladbrokes fixed win books run roughly 118 to 130 percent on thoroughbreds and, on our measurements, 131 to 137 percent on Queensland greyhound cards.

Naive proportional normalisation (divide each `1/O` by the sum) is biased, because the margin is not spread evenly. It is loaded onto longshots. Use one of:

- **Power method.** Solve for exponent `k` such that the sum of `(1/O_i)^k` equals 1. Simple, one parameter, usually a clear improvement on proportional.
- **Shin's method.** Models the overround as arising from informed money and corrects the longshot end specifically. Standard in the racing literature. Preferred once we have enough data to fit it per track.

**Benchmark.** Betfair Exchange Starting Price, de-vigged, is about as good a public probability estimate as exists for Australian racing (2 to 5 percent overround versus 25 percent plus for fixed odds). We capture BSP solely as a benchmark to be measured against. Without it we cannot tell whether a model is any good.

## Part 2: two-stage structure

This is the Bill Benter structure, the one documented case of a sustained racing edge. Do not build a single model that takes market price as just another feature.

1. **Fundamental model.** Fit on form data only, with no market data of any kind. Produces `p_fund`.
2. **Combination.** Combine with the de-vigged market probability `p_mkt`:

   `log(p_final) proportional to a * log(p_fund) + b * log(p_mkt)`

   Fit `a` and `b` on held-out data, then normalise within race.

Benter's finding was that the fundamental model alone lost money, the market alone lost money after takeout, and only the combination won, with a substantial weight on the market. Expect `b` to be large. If the fitted `b` is near zero, be suspicious of leakage rather than pleased.

## Part 3: model form

A race is a choice among n runners and the probabilities must sum to 1. Plain binary logistic regression on "did this runner win" ignores the group structure and produces unnormalised output. Use either:

- **Conditional logit** (multinomial logit with race-level grouping), the Bolton and Chapman formulation, or
- **Gradient boosted trees** with a ranking objective, then softmax within race.

Normalise within the race every time, never across the whole dataset.

## Part 4: features

Rough order of expected signal for Australian thoroughbreds:

1. Market price (dominant, and held back for stage 2)
2. Speed and sectional ratings
3. Class and weight carried, weight change
4. Barrier draw, interacted with track and distance
5. Run style against likely race tempo (speed map)
6. Track condition, and the runner's record on that condition
7. Distance suitability, first-up and second-up patterns
8. Days since last start

For greyhounds at Q1 and Q2, substitute box draw for barrier and early speed to the first turn for run style. Box bias is track specific, so fit per track, never pooled.

Jockey and trainer strike rates look predictive but are largely a proxy for runner quality. Expect them to add little once ratings and price are present. Keep them out until the rest is working.

## Part 5: the calibration gate (go / no-go)

No staking code runs on a model that has not passed this gate on a locked holdout.

1. **Reliability.** Bucket predicted probabilities. Compare predicted versus actual win rate per bucket. Runners rated 20 percent should win about 20 percent of the time. Plot it and record the deviation.
2. **Log loss versus the de-vigged market.** This is the decision. If the model does not beat de-vigged Betfair SP on out-of-sample log loss, there is no edge, and fractional Kelly on that `p` loses money regardless of the fraction used.

Report both numbers with the market baseline alongside, always. A model's log loss on its own is meaningless here.

"No edge found" is a valid and expected result. Record it and stop, do not tune until something passes.

## Part 6: staking

Kelly fraction of bank:

`f = (p * O - 1) / (O - 1)`

which is edge divided by net odds.

Four rules:

1. **Fractional Kelly, always.** Kelly assumes `p` is the true probability, not an estimate. It is brutally asymmetric: overbetting by 2x gives zero long-run growth and beyond that ruin approaches certainty, while underbetting only costs a little growth. Use quarter Kelly by default, never more than half. This is a correction for model error, not conservatism.
2. **Runners in one race are mutually exclusive.** Never apply Kelly independently to two runners in the same race. Use the simultaneous-outcome solution (Smoczynski and Tomkins, after Isaacs), which selects a subset by a reservation rate and sizes them jointly. Independent Kelly overstakes badly.
3. **Notional bank, not the weekly budget.** Kelly compounds a single bank. A weekly top-up is a different problem. Nominate a notional bank of 20 weeks of budget ($2,000), size fractional Kelly off that, and let it move with results. The $100 per week is a separate hard cap on how much can be staked in any week, applied after Kelly sizing.
4. **Per-bet cap.** Cap any single stake at 2 percent of the notional bank regardless of what Kelly says.

## Part 7: what failure looks like

Any of these means stop, record the result, and do not proceed to live bets:

- Model log loss does not beat de-vigged Betfair SP out of sample
- Reliability deviates materially in the price bands we would actually bet
- Edge only appears in bands with fewer than 300 observations
- Edge disappears in the walk-forward holdout after appearing in training
- Paper trading over 6 to 8 weeks does not show returns consistent with the backtest
