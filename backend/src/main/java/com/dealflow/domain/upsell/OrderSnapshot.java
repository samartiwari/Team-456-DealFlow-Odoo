package com.dealflow.domain.upsell;

import java.math.BigDecimal;

/**
 * The order a candidate would be joining.
 *
 * @param net               already discounted, including the order-level push-down
 * @param cost              total unit cost of what is already on the quotation
 * @param orderDiscountPct  applied to a candidate too, since a new line inherits it
 */
public record OrderSnapshot(BigDecimal net, BigDecimal cost, BigDecimal orderDiscountPct) {}
