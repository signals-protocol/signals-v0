# Precision and Rounding: Mathematical Accuracy in Practice

The Signals protocol manages numerical precision carefully to maintain mathematical accuracy while providing user-friendly interfaces. Understanding how precision and rounding work helps explain transaction costs and prevents confusion about small discrepancies in expected versus actual amounts.

## Internal vs External Precision

All mathematical operations within the protocol use 18-decimal WAD (Wei per Ether) precision to ensure accuracy throughout complex calculations involving exponential functions and multiplicative operations. This high precision minimizes cumulative rounding errors that could otherwise accumulate across multiple operations and compromise result accuracy.

External interfaces with users employ 6-decimal precision that matches USDC formatting conventions, providing familiar user experience while maintaining sufficient granularity for practical trading amounts. The conversion between internal 18-decimal and external 6-decimal representations occurs at protocol boundaries where users interact with the system.

Position opening costs, closing proceeds, and settlement payouts all reflect 6-decimal amounts that users see in their wallets and transaction histories. Behind these user-facing values, the protocol maintains full 18-decimal precision for all intermediate calculations until the final conversion step.

## Asymmetric Rounding Policy

The protocol implements asymmetric rounding to prevent zero-cost attacks and ensure fair pricing in favor of protocol sustainability. Purchase operations use ceiling rounding through the `fromWadRoundUp` function, guaranteeing that users never pay less than the mathematically correct amount for their positions.

Ceiling rounding on costs means that if the precise mathematical cost equals 2.500001 SUSD, users pay 2.500001 SUSD rather than having the amount rounded down to 2.500000 SUSD. This approach prevents exploitation scenarios where users might acquire shares for artificially low amounts due to precision truncation.

Selling operations and settlement payouts use floor rounding, ensuring the protocol never pays out more than the mathematically precise amount. If the calculated proceeds equal 5.999999 SUSD, users receive 5.999999 SUSD rather than having the amount rounded up to 6.000000 SUSD.

## Preventing Zero-Cost Attacks

Zero-cost attacks represent a significant concern in any system involving financial calculations with limited precision. These attacks exploit rounding behaviors to acquire valuable assets for minimal or no cost by carefully crafting transaction amounts that round down to zero or near-zero values.

The ceiling rounding policy specifically addresses this vulnerability by ensuring that any mathematically positive cost translates to a positive payment requirement in the external precision format. Even tiny mathematical costs that might otherwise round to zero will require at least one unit of payment in the 6-decimal representation.

Combined with minimum position size requirements, the rounding policy creates multiple layers of protection against precision-based exploitation while maintaining user-friendly interfaces that hide the complexity of internal high-precision calculations.

## Cumulative Effects and Protocol Revenue

The systematic bias created by asymmetric rounding accumulates small amounts in favor of the protocol over many transactions. While individual rounding differences are minimal, the cumulative effect across all protocol activity creates a modest revenue stream that supports protocol sustainability.

These accumulated amounts serve as a buffer against potential precision-related issues and provide resources for protocol development and maintenance. The amounts involved are typically much smaller than explicit fee structures but represent a fair contribution from users who benefit from the mathematical accuracy and security provided by the precision management system.

The revenue effect demonstrates how seemingly minor technical decisions about precision handling can have meaningful economic implications for protocol operations and long-term sustainability.

## Mathematical Consistency Guarantees

Despite the precision conversions and rounding policies, the protocol maintains strict mathematical consistency in its internal operations. All probability distributions continue to sum to exactly 1.0 in the internal 18-decimal representation, even as external representations may show small discrepancies due to rounding.

The segment tree operations preserve exact mathematical relationships between exponential weights and their sums, ensuring that range factor applications produce mathematically correct results regardless of the order of operations or intermediate rounding steps.

Settlement calculations maintain precision throughout the process of determining winning positions and calculating payout amounts. The protocol guarantees that all winning positions receive their full 1 SUSD per share entitlement, with any precision differences absorbed by the protocol rather than affecting user payouts.

## Practical Implications for Users

Users should expect small differences between displayed estimates and actual transaction amounts due to the precision and rounding policies. Cost estimates shown in user interfaces may differ slightly from final charged amounts, particularly for very large or very small positions where rounding effects become more noticeable.

The differences are generally favorable to users for selling operations and claims, where floor rounding may result in slightly lower proceeds than estimates, and slightly unfavorable for purchase operations where ceiling rounding may result in marginally higher costs than expected.

Understanding these precision behaviors helps users set appropriate slippage tolerances and explains why transaction amounts may not match estimates exactly. The systematic nature of the rounding ensures that discrepancies remain small and predictable rather than causing significant unexpected costs or losses.

## Implementation Details

The protocol uses established mathematical libraries that implement WAD arithmetic with proven security and accuracy characteristics. These libraries handle the complexities of fixed-point arithmetic while maintaining compatibility with standard Ethereum development tools and patterns.

Conversion functions between WAD and 6-decimal representations include explicit rounding direction specifications to ensure consistent behavior across all protocol operations. The implementation prevents accidental precision loss or inappropriate rounding that could affect mathematical properties.

Safety checks validate that all precision conversions remain within expected bounds and that cumulative operations do not exceed the numeric limits of the underlying representation formats. These checks provide additional assurance against overflow or underflow conditions that could compromise calculation accuracy.
