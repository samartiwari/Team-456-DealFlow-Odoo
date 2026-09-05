package com.dealflow.domain.health;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Decides whether a discount is out of character for the rep who gave it.
 *
 * <p>The rule is deliberately relative: {@code discount > mean + 2 * stdDev} over that
 * rep's own recent confirmed quotes. A fixed threshold would flag whoever sells to the
 * toughest customers and miss the rep who has quietly drifted upward within it.
 *
 * <p>Two guards, and both exist because of how the rule fails without them:
 *
 * <ul>
 *   <li><b>Too little history falls back to the team.</b> A rep on their third quote has
 *       no distribution; measured against themselves, almost anything is two deviations
 *       from almost nothing. A new rep is not an anomaly.
 *   <li><b>Deviation is floored at 1.0 point.</b> A perfectly consistent rep has a
 *       deviation near zero, which would make a tenth of a point an outlier. The floor
 *       says: below a point of spread, we do not pretend to detect anything.
 * </ul>
 *
 * <p>Pure Java on purpose -- no Spring, no JPA -- so the arithmetic is tested without a
 * database.
 */
public final class AnomalyRule {

    /** Below five confirmed quotes a rep is measured against the team instead. */
    public static final int MIN_OWN_HISTORY = 5;

    /** A rep with no spread must not trip on a rounding wobble. */
    public static final BigDecimal MIN_STD_DEV = BigDecimal.ONE;

    private static final BigDecimal SIGMAS = BigDecimal.valueOf(2);

    /** More than this share of recent quotes within a point of the ceiling is a pattern. */
    private static final BigDecimal HUGGER_SHARE = new BigDecimal("0.70");

    private AnomalyRule() {
    }

    /** The deviation actually used: never below the floor, whatever the data says. */
    public static BigDecimal effectiveStdDev(BigDecimal stdDev) {
        return stdDev == null ? MIN_STD_DEV : stdDev.max(MIN_STD_DEV);
    }

    /** The discount above which this rep is out of character. */
    public static BigDecimal threshold(DiscountBaseline baseline) {
        return baseline.mean()
                .add(SIGMAS.multiply(effectiveStdDev(baseline.stdDev())))
                .setScale(2, RoundingMode.HALF_UP);
    }

    public static boolean isAnomalous(BigDecimal discountPct, DiscountBaseline baseline) {
        return discountPct != null && discountPct.compareTo(threshold(baseline)) > 0;
    }

    /**
     * A rep who sits at the ceiling as a habit rather than as an exception.
     *
     * <p>No single deal is wrong, which is why this is reported at low severity: it is a
     * question to ask, not a decision to reverse.
     */
    public static boolean isCeilingHugger(int quotesAtCeiling, int quotesConsidered) {
        if (quotesConsidered < MIN_OWN_HISTORY) {
            return false;
        }
        return BigDecimal.valueOf(quotesAtCeiling)
                .divide(BigDecimal.valueOf(quotesConsidered), 4, RoundingMode.HALF_UP)
                .compareTo(HUGGER_SHARE) > 0;
    }
}
