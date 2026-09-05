package com.dealflow.domain.billing;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Written before the calculator, deliberately.
 *
 * <p>Day-count off-by-ones do not throw and do not look wrong -- they produce money that is
 * plausible, slightly incorrect, and invisible until a customer disputes an invoice. The
 * three scenarios below carry the brief's own expected figures, so the arithmetic is pinned
 * to something outside this codebase rather than to whatever the implementation happens to
 * do.
 */
class ProrationCalculatorTest {

    private final ProrationCalculator calculator = new ProrationCalculator();

    /** A 30-day period at 3,000 per unit, as the brief's examples use. */
    private static Period thirtyDayPeriod() {
        return new Period(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 30));
    }

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    @Test
    @DisplayName("Raising quantity 1 to 3 on day 10 of 30 charges 4,000")
    void quantityIncreaseIsCharged() {
        BigDecimal delta = calculator.prorate(
                bd("3000"), 1, 3, thirtyDayPeriod(), LocalDate.of(2026, 1, 10));

        assertThat(delta).isEqualByComparingTo("4000.00");
    }

    @Test
    @DisplayName("Dropping quantity 3 to 1 on day 10 of 30 credits 4,000")
    void quantityDecreaseIsCredited() {
        BigDecimal delta = calculator.prorate(
                bd("3000"), 3, 1, thirtyDayPeriod(), LocalDate.of(2026, 1, 10));

        assertThat(delta).isEqualByComparingTo("-4000.00");
    }

    @Test
    @DisplayName("Cancelling on day 10 of 30 credits the 20 unused days")
    void cancellationCreditsUnusedDays() {
        BigDecimal delta = calculator.prorate(
                bd("3000"), 1, 0, thirtyDayPeriod(), LocalDate.of(2026, 1, 10));

        assertThat(delta).isEqualByComparingTo("-2000.00");
    }

    @Test
    @DisplayName("The daily rate is per unit, not per line")
    void dailyRateIsPerUnit() {
        // Read as the whole line, dropping 3 to 1 would credit 12,000 -- three times too
        // much, and only wrong when the starting quantity is above 1. The brief's own
        // figure of -4,000 is what settles it.
        BigDecimal fromThree = calculator.prorate(
                bd("3000"), 3, 1, thirtyDayPeriod(), LocalDate.of(2026, 1, 10));
        BigDecimal fromOne = calculator.prorate(
                bd("3000"), 1, 3, thirtyDayPeriod(), LocalDate.of(2026, 1, 10));

        assertThat(fromThree.abs())
                .as("a two-unit move costs the same either way, whatever the starting point")
                .isEqualByComparingTo(fromOne.abs());
    }

    @Test
    @DisplayName("The day a change happens counts as used")
    void theChangeDayIsElapsedNotRemaining() {
        Period period = thirtyDayPeriod();

        // day 1 of 30: 29 remaining, not 30
        assertThat(calculator.prorate(bd("3000"), 0, 1, period, LocalDate.of(2026, 1, 1)))
                .isEqualByComparingTo("2900.00");

        // the last day leaves nothing to prorate
        assertThat(calculator.prorate(bd("3000"), 0, 1, period, LocalDate.of(2026, 1, 30)))
                .isEqualByComparingTo("0.00");
    }

    @Test
    @DisplayName("Calendar months are not 30 days, and February is not 31")
    void realMonthsUseTheirOwnLength() {
        // Support Plan at 2,000, changing 1 to 3 on the 10th.
        var january = new Period(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));
        var february = new Period(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 28));

        assertThat(calculator.prorate(bd("2000"), 1, 3, january, LocalDate.of(2026, 1, 10)))
                .isEqualByComparingTo("2709.68");   // 21 of 31 days
        assertThat(calculator.prorate(bd("2000"), 1, 3, february, LocalDate.of(2026, 2, 10)))
                .isEqualByComparingTo("2571.43");   // 18 of 28 days
    }

    @Test
    @DisplayName("Rounding happens once, at the end")
    void roundsOnceRatherThanPerStep() {
        // 2000 / 31 is 64.516129... Rounding the daily rate first and multiplying by
        // 21 x 2 drifts from the true figure; one expression rounded once does not.
        var january = new Period(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));

        assertThat(calculator.prorate(bd("2000"), 1, 3, january, LocalDate.of(2026, 1, 10)))
                .as("64.52 x 2 x 21 would give 2709.84")
                .isEqualByComparingTo("2709.68");
    }

    @Test
    @DisplayName("No change in quantity is no money")
    void noChangeIsZero() {
        assertThat(calculator.prorate(bd("3000"), 2, 2, thirtyDayPeriod(), LocalDate.of(2026, 1, 10)))
                .isEqualByComparingTo("0.00");
    }

    @Test
    @DisplayName("A date outside the period is refused rather than quietly prorated")
    void effectiveDateMustFallInThePeriod() {
        Period period = thirtyDayPeriod();

        assertThatThrownBy(() -> calculator.prorate(
                bd("3000"), 1, 3, period, LocalDate.of(2025, 12, 31)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> calculator.prorate(
                bd("3000"), 1, 3, period, LocalDate.of(2026, 2, 1)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Days and remaining days read straight off the period")
    void periodExposesItsOwnShape() {
        Period january = new Period(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));

        assertThat(january.days()).isEqualTo(31);
        assertThat(january.remainingDaysFrom(LocalDate.of(2026, 1, 10))).isEqualTo(21);
        assertThat(january.remainingDaysFrom(LocalDate.of(2026, 1, 31))).isEqualTo(0);
    }
}
