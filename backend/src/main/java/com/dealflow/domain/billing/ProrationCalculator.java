package com.dealflow.domain.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

/**
 * What a mid-period quantity change is worth.
 *
 * <pre>
 *   delta = unitPrice x qtyDelta x remainingDays / daysInPeriod
 * </pre>
 *
 * <p>Positive is charged, negative is credited, and a cancellation is simply a change to
 * quantity zero -- one formula rather than two that could drift apart.
 *
 * <p>Two things here are easy to get wrong and expensive to get wrong quietly:
 *
 * <ul>
 *   <li>The rate is <strong>per unit</strong>. The brief writes
 *       {@code dailyRate = periodAmount / daysInPeriod}, which reads like the whole line,
 *       but its own figures settle it: dropping 3 units to 1 on day 10 of 30 at 3,000 a
 *       unit credits 4,000, not 12,000. Read as a line total it would be wrong by a factor
 *       of the quantity, and only when the quantity is above one.
 *   <li>Rounding happens <strong>once, at the end</strong>. 2,000 over 31 days is
 *       64.516129..., and rounding that before multiplying drifts by rupees over a period.
 * </ul>
 *
 * <p>Pure Java on purpose -- no Spring, no JPA, no annotations -- so the money can be
 * tested without a database.
 */
public final class ProrationCalculator {

    private static final int MONEY_SCALE = 2;

    /** Intermediate scale: the division is deferred to the end, but guard it anyway. */
    private static final int WORKING_SCALE = 10;

    /**
     * @param unitPrice     per unit, per period, after the line's discount
     * @param fromQuantity  what the subscription bills today
     * @param toQuantity    what it will bill; zero cancels
     * @param period        the period the change lands in
     * @param effectiveDate the day it takes effect; must fall inside the period
     * @return positive to charge, negative to credit, at money scale
     */
    public BigDecimal prorate(BigDecimal unitPrice, int fromQuantity, int toQuantity,
                              Period period, LocalDate effectiveDate) {

        int remainingDays = period.remainingDaysFrom(effectiveDate);
        int qtyDelta = toQuantity - fromQuantity;

        if (qtyDelta == 0 || remainingDays == 0) {
            return BigDecimal.ZERO.setScale(MONEY_SCALE);
        }

        // One expression, divided last, rounded once.
        return unitPrice
                .multiply(BigDecimal.valueOf(qtyDelta))
                .multiply(BigDecimal.valueOf(remainingDays))
                .divide(BigDecimal.valueOf(period.days()), WORKING_SCALE, RoundingMode.HALF_UP)
                .setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }
}
