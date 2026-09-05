package com.dealflow.domain.health;

import java.math.BigDecimal;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The seeded figures, so the dashboard's behaviour is pinned to something outside itself:
 * Priya averages 8.08 with no spread, Arjun 17.90 with none either.
 */
class AnomalyRuleTest {

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    private static final DiscountBaseline PRIYA =
            new DiscountBaseline(bd("8.08"), bd("0.79"), 13, false);
    private static final DiscountBaseline ARJUN =
            new DiscountBaseline(bd("17.90"), bd("0.88"), 10, false);

    @Test
    @DisplayName("A discount far outside a rep's own range is flagged")
    void aRealOutlierFlags() {
        assertThat(AnomalyRule.threshold(PRIYA)).isEqualByComparingTo("10.08");
        assertThat(AnomalyRule.isAnomalous(bd("22"), PRIYA)).isTrue();
    }

    @Test
    @DisplayName("The biggest discounter in the company is not an anomaly")
    void aConsistentlyHighRepDoesNotFlag() {
        // This is the whole argument for the design. Arjun's 19% is more than double
        // Priya's average, and more than the 10.08 that would flag her -- yet it is
        // ordinary for him, so it flags nothing. A fixed threshold could not tell these
        // two situations apart.
        assertThat(AnomalyRule.threshold(ARJUN)).isEqualByComparingTo("19.90");
        assertThat(AnomalyRule.isAnomalous(bd("19"), ARJUN)).isFalse();
        assertThat(AnomalyRule.isAnomalous(bd("19"), PRIYA))
                .as("the same number, a different rep, a different answer")
                .isTrue();
    }

    @Test
    @DisplayName("A perfectly consistent rep does not trip on a rounding wobble")
    void deviationIsFloored() {
        DiscountBaseline noSpread = new DiscountBaseline(bd("12.00"), BigDecimal.ZERO, 20, false);

        assertThat(AnomalyRule.effectiveStdDev(BigDecimal.ZERO)).isEqualByComparingTo("1");
        // Without the floor the threshold would be 12.00 and 12.1 would be an outlier.
        assertThat(AnomalyRule.threshold(noSpread)).isEqualByComparingTo("14.00");
        assertThat(AnomalyRule.isAnomalous(bd("12.10"), noSpread)).isFalse();
        assertThat(AnomalyRule.isAnomalous(bd("14.50"), noSpread)).isTrue();
    }

    @Test
    @DisplayName("Exactly at the threshold is not over it")
    void theBoundaryIsExclusive() {
        DiscountBaseline b = new DiscountBaseline(bd("10.00"), bd("2.00"), 20, false);

        assertThat(AnomalyRule.threshold(b)).isEqualByComparingTo("14.00");
        assertThat(AnomalyRule.isAnomalous(bd("14.00"), b)).isFalse();
        assertThat(AnomalyRule.isAnomalous(bd("14.01"), b)).isTrue();
    }

    @Test
    @DisplayName("A null deviation is treated as no spread rather than as a crash")
    void aMissingDeviationIsSafe() {
        DiscountBaseline single = new DiscountBaseline(bd("9.00"), null, 1, true);

        assertThat(AnomalyRule.threshold(single)).isEqualByComparingTo("11.00");
        assertThat(AnomalyRule.isAnomalous(bd("30"), single)).isTrue();
    }

    @Test
    @DisplayName("A rep who habitually sits at the ceiling is a pattern, not an incident")
    void ceilingHugging() {
        // 15 of 20 is 75%, past the 70% mark
        assertThat(AnomalyRule.isCeilingHugger(15, 20)).isTrue();
        assertThat(AnomalyRule.isCeilingHugger(14, 20)).isFalse();   // exactly 70% is not past it
        // and it needs enough history to be a habit at all
        assertThat(AnomalyRule.isCeilingHugger(3, 3)).isFalse();
        assertThat(AnomalyRule.isCeilingHugger(5, 5)).isTrue();
    }
}
