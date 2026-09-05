package com.dealflow.domain.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Margin, in one place.
 *
 * <p>Percentage of revenue rather than of cost -- the two differ, and a deal that "makes
 * 30%" means something quite different under each. Revenue is the reading a sales team
 * uses, so it is the one implemented, and the only one.
 */
public final class MarginCalculator {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final int PERCENT_SCALE = 2;

    private MarginCalculator() {
    }

    public static BigDecimal margin(BigDecimal net, BigDecimal cost) {
        return net.subtract(cost);
    }

    /** Zero for an order that nets nothing, rather than a division by zero. */
    public static BigDecimal marginPct(BigDecimal net, BigDecimal cost) {
        if (net.signum() == 0) {
            return BigDecimal.ZERO.setScale(PERCENT_SCALE);
        }
        return margin(net, cost)
                .multiply(HUNDRED)
                .divide(net, PERCENT_SCALE, RoundingMode.HALF_UP);
    }
}
