# Risk Guide

Trading a daily CLMSR market is simple, but it is still real capital reacting to volatile data. Use this guide to understand the major risk categories, how they surface inside Signals, and the habits that keep your account safe.

## Market and trading risk

Every position is a thesis about a range at the daily close. Even a well-reasoned view can miss by one tick if the candle wicks outside your range or if the final price prints at the edge of the interval. Intraday volatility can also reshape probabilities within minutes; when momentum shifts, one range may no longer fit your thesis. Consider spreading exposure across adjacent ranges or scaling size gradually instead of sizing a single bet all at once.

Liquidity comes from the CLMSR pool, so odds adjust instantly, but large trades still move the surface. Always glance at the probability chart and recent trades before committing size so you are not surprised by a freshly reshaped distribution.

## Operational and oracle risk

Signals settles with a designated reference price for each market. If that feed or the ingest pipeline stalls, settlement pauses until an auditable value is available. Your funds remain on-chain, but claims are delayed. The same operations team that creates markets also submits settlement values and maintains the automation pipeline; our actions are fully visible on-chain, yet you rely on us to execute honestly and promptly. Monitor the [Security & Testing](../security/audits.md) page for updates on multisig controls and automation—those changes reduce trust in a single operator.

Settlement automation introduces another operational edge case: claims unlock only after the settlement transaction propagates and the network reflects the final state. Until that happens, the UI may show winnings as “pending.” This is expected behaviour; wait for the completion banner or confirm the outcome on an explorer before worrying about missing payouts.

## Technical risk

Signals’ contracts are audited internally and open-sourced, but every protocol carries the possibility of undiscovered bugs. Because the deployment runs on Citrea Testnet today, RPC outages, chain upgrades, or gas spikes can temporarily disrupt trading or settlement. Heavy congestion can also raise gas costs at the exact moment you want to claim or adjust exposure. Keep a small buffer of cBTC for gas and plan around known maintenance windows announced in community channels.

## Best practices

- Start small until you have experienced a full open → settle → claim cycle.
- Record your trade ideas, entry ranges, and outcomes so you can calibrate future position sizes.
- Watch community announcements or on-chain data if settlement is slower than usual.
- Claim winnings promptly once settlement completes, both to tidy balances and to verify everything processed as expected.

For deeper detail on the safeguards in place or upcoming trust-minimisation work, review [Security & Testing](../security/audits.md) and the [Settlement Pipeline](../market/settlement-pipeline.md).
