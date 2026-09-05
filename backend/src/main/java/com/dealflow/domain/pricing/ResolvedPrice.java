package com.dealflow.domain.pricing;

import java.math.BigDecimal;

/**
 * What one unit costs this customer, and why.
 *
 * @param source  the layer that won. Kept so "why is this 88,000?" has an answer that
 *                does not require reading the resolver
 * @param label   the variant or price list that supplied it; null when the base won
 */
public record ResolvedPrice(BigDecimal unitPrice, BigDecimal unitCost,
                            PriceSource source, String label) {}
