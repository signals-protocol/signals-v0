# Position Lifecycle: Managing Range Securities

Understanding how positions work throughout their lifecycle helps you make informed trading decisions and manage risk effectively. Range securities in Signals follow a structured progression from opening through settlement and claiming.

## Opening New Positions

Creating a new position requires specifying your target price range through lower and upper tick values, along with the quantity of shares you wish to purchase. The protocol calculates the cost based on current market conditions and the specific range you select. Ranges are defined using half-open intervals where the lower bound is inclusive and the upper bound is exclusive, written as [lower, upper).

When you submit a position opening transaction, you must specify a maximum cost you are willing to pay. This protection prevents unexpected price movements during transaction processing from causing you to pay more than intended. The protocol will reject any transaction where the calculated cost exceeds your specified maximum.

The cost calculation considers the current probability distribution across all market outcomes. Ranges with higher market-estimated probabilities cost more per share, while ranges the market considers unlikely trade at lower prices. This dynamic pricing ensures that position costs accurately reflect collective market sentiment at the time of your transaction.

## Increasing Position Size

You can add shares to existing positions through increase operations that target the same price range as your original position. The protocol treats position increases as separate transactions for cost calculation purposes, meaning you pay the current market price for the additional shares rather than averaging with your original cost basis.

Increasing positions allows you to respond to changing market conditions or new information that affects your confidence in a particular outcome. The additional shares integrate seamlessly with your existing position and will be settled together when the market resolves.

## Reducing Position Size

Position reductions allow you to sell a portion of your holdings before market settlement. The protocol calculates your proceeds based on current market conditions, applying the inverse of the purchase cost calculation. Reductions require specifying a minimum proceeds amount to protect against unfavorable price movements during transaction processing.

When reducing positions, you receive SUSD tokens based on the current market valuation of your shares. The amount depends on how market sentiment has shifted since you opened your position. If the market now assigns higher probability to your range, you may receive more than your original cost. Conversely, if market confidence in your range has decreased, the proceeds may be less than your initial investment.

## Closing Positions Completely

Complete position closure sells all shares in a specific range back to the market. This operation follows the same mathematical principles as partial reductions but eliminates your entire exposure to that particular outcome range. After closing, you no longer have any claim on payouts if the market settles within that range.

Position closure provides a way to exit before settlement when you have changed your opinion about likely outcomes or need to access your capital. The timing of your closure decision significantly impacts your returns, as market sentiment continues evolving until settlement occurs.

## Position States and Settlement

Positions exist in different states throughout their lifecycle. Active positions can be traded normally through increase and decrease operations. Once the market reaches its settlement date, positions transition to a settled state where trading is no longer possible.

During the settlement process, the protocol determines which ranges contain the final outcome. Positions covering winning ranges become eligible for claiming, while positions in non-winning ranges receive no payout. The settlement value is compared against each position's tick range to determine eligibility automatically.

## Claiming Payouts

Winning positions entitle holders to claim 1 SUSD per share they own in ranges that include the settlement outcome. The claiming process is permissionless, meaning you can retrieve your winnings whenever convenient within the 90-day claim period following settlement.

Claims are processed individually for each winning position you hold. If you have multiple positions across different ranges and several ranges win, you must submit separate claim transactions for each winning position. The protocol enforces the claim period to ensure final resolution of all markets and prevent indefinite outstanding obligations.

The claiming mechanism includes verification that positions actually cover the settlement tick and that claims have not already been processed. Once claimed, positions are marked as fully resolved and no longer appear in your active holdings. Unclaimed winnings after the 90-day period are forfeited, though this deadline provides ample time for normal claiming operations.
