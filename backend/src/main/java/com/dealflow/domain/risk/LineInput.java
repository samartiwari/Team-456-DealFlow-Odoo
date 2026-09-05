package com.dealflow.domain.risk;

import java.math.BigDecimal;

/**
 * One quotation line as the risk engine sees it.
 *
 * @param lineNet            already discounted, and already includes the order-level push-down
 * @param discountPct        effective discount: line discount + order discount
 * @param categoryCeilingPct nullable -- a category without a ceiling falls back to the tier ceiling
 */
public record LineInput(
        long lineId,
        BigDecimal lineNet,
        BigDecimal discountPct,
        BigDecimal tierCeilingPct,
        BigDecimal categoryCeilingPct
) {}
