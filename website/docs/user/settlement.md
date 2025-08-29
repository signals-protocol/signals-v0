# Settlement and Oracle Mechanism

Settlement represents the final phase of prediction markets where actual outcomes are determined and winning positions are identified. The Signals protocol implements a structured settlement process that ensures fair and transparent resolution of all markets.

## Settlement Authority and Process

Market settlement is restricted to authorized operators who have the responsibility to post accurate final outcome values. The protocol implements role-based access controls that prevent unauthorized parties from influencing settlement results. When a market reaches its designated end time, authorized operators can initiate settlement by submitting the official outcome value.

The settlement value must be provided using 6-decimal precision to match the SUSD token format. This precision requirement ensures consistency with the protocol's mathematical operations and eliminates ambiguity about how fractional values should be interpreted. The submitted value undergoes validation to confirm it falls within the market's predefined outcome range.

Once an operator submits a settlement value, the protocol calculates the corresponding settlement tick using floor division: `settlement_tick = floor(settlement_value / 1e6)`. This tick-based approach ensures that settlement boundaries align precisely with the discrete ranges used throughout the position lifecycle.

## Determining Winning Ranges

Position eligibility for payouts depends on whether the calculated settlement tick falls within each position's defined range. The protocol evaluates each position individually, checking if the settlement tick satisfies the condition `lower_tick <= settlement_tick < upper_tick`. This half-open interval convention means that positions include their lower boundary but exclude their upper boundary.

The boundary exclusion prevents double-counting situations where multiple adjacent ranges might otherwise claim the same settlement outcome. For example, if positions exist for ranges [50000, 52000) and [52000, 54000) and settlement occurs exactly at tick 52000, only the second position qualifies for payout. This approach ensures mathematical consistency and prevents disputes about boundary conditions.

Multiple positions can win simultaneously if they represent overlapping ranges that all contain the settlement tick. The protocol evaluates each position independently, so holders of winning positions receive their full 1 SUSD per share regardless of how many other positions also win.

## Settlement Finality and Immutability

Once settlement values are recorded on-chain, they become immutable and cannot be modified through subsequent transactions. This finality provides certainty to all market participants and prevents retroactive changes that could disadvantage position holders. The blockchain record serves as the definitive source of truth for all settlement outcomes.

The protocol does not include mechanisms for disputing or reversing settlement decisions after they are committed to the blockchain. This design choice prioritizes certainty and prevents indefinite delays in market resolution. However, it places significant responsibility on authorized operators to ensure accuracy before submitting settlement values.

## Automated Position Resolution

Settlement triggers automated processing that determines winning and losing positions across the entire market. The protocol emits settlement events that can be monitored by external systems and user interfaces to provide immediate feedback about position outcomes. These events include the settlement value, calculated tick, and market identifier for comprehensive tracking.

The automated resolution process eliminates the need for manual intervention in determining position eligibility. Smart contract logic handles all necessary calculations and state transitions, ensuring consistent application of settlement rules across all positions within a market.

## Claim Period and Deadlines

Following settlement, winning position holders have a 90-day window to claim their payouts. This extended period accommodates various factors that might delay immediate claiming, such as technical issues, user availability, or gas price considerations. The claim period begins when settlement is finalized on-chain.

The 90-day deadline serves important protocol functions beyond user convenience. It establishes a definitive endpoint for outstanding obligations and allows the protocol to consider markets fully resolved after this period. Unclaimed winnings after the deadline are forfeited and remain with the protocol.

## Oracle Design Considerations

The current settlement mechanism relies on trusted operators to provide accurate outcome values. This design prioritizes operational simplicity and gas efficiency while acknowledging the trust assumptions involved. Future iterations may incorporate additional oracle mechanisms such as multiple operator consensus or integration with external price feeds.

The operator-based approach enables rapid settlement without the complexity and costs associated with decentralized oracle systems. However, it requires careful operator selection and clear accountability mechanisms to maintain user confidence in settlement accuracy. The protocol's transparency ensures that all settlement decisions are publicly verifiable on the blockchain.
