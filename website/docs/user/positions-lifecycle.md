# Trader Guide

Everything you need to manage a Signals position—from opening a range to adjusting exposure during the day.

## Opening a range

1. **Pick the band**: select lower and upper prices in $100 increments. The interface enforces the correct tick alignment.
2. **Set your stake**: enter the SUSD amount you want to risk. A 1 SUSD stake pays 1 SUSD if your band wins.
3. **Review odds**: the panel shows the current win probability, implied price, and potential payout.
4. **Confirm**: submit the transaction. Costs round up to the nearest micro SUSD.

## Adjusting exposure

| Action | Use when | What happens |
| --- | --- | --- |
| Increase | You want more size in the same band | Adds quantity at the current probability |
| Decrease | Take partial profit or cut risk | Returns SUSD at the current probability |
| Close | Exit completely before settlement | Burns the position once quantity hits zero |

All operations are path-independent: the order of trades doesn’t change final economics because the CLMSR cost function depends only on cumulative quantity ([see the mechanism spec](../mechanism/cost-rounding.md)).

## Reading the interface

- **Probability chart**: orange price line + histogram of outstanding odds.
- **Recent bets**: see live fills to gauge sentiment shifts.
- **Points leaderboard**: optional engagement layer showing top performers.

## Pre-settlement checklist

- Confirm the countdown timer so you know when trading ends.
- Capture your thesis (e.g. “Range-bound around $112k”) to evaluate after settlement.
- Monitor the feed: if a large trade moves the probability surface, reassess your range.

Next, see [Settlement & Claims](./settlement.md) to learn what happens after the market resolves.
