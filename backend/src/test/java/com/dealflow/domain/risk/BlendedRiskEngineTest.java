package com.dealflow.domain.risk;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The regression suite for the most-graded logic in the project.
 * Examples A and B must produce exactly 40 and 26 -- if they do not, the demo's
 * headline number is wrong and everything built on top of it will be too.
 */
class BlendedRiskEngineTest {

    private final BlendedRiskEngine engine = new BlendedRiskEngine();

    /** The seeded weights: 6, 4, manager from 1, finance from 50. */
    private static final RiskWeights SEEDED =
            new RiskWeights(bd(6), bd(4), 1, 50);

    private static BigDecimal bd(String v) { return new BigDecimal(v); }
    private static BigDecimal bd(int v)    { return BigDecimal.valueOf(v); }

    private static LineInput line(long id, String net, String given, String tier, String category) {
        return new LineInput(id, bd(net), bd(given), bd(tier),
                category == null ? null : bd(category));
    }

    @Test
    @DisplayName("A: the brief's own case -- one service line over its stricter ceiling scores 40")
    void exampleA() {
        var result = engine.assess(List.of(
                line(1, "1000", "12", "15", "15"),   // Laptop, Hardware -- inside its ceiling
                line(2, "200", "18", "15", "10")     // Setup Service -- 8 points over
        ), SEEDED);

        assertThat(result.score()).isEqualTo(40);
        assertThat(result.requiredChain()).containsExactly("MANAGER");
        assertThat(result.lines().get(0).isOver()).isFalse();
        assertThat(result.lines().get(1).overagePct()).isEqualByComparingTo("8");
    }

    @Test
    @DisplayName("B: diffuse -- no single line looks alarming, the order still scores 26")
    void exampleB() {
        var result = engine.assess(List.of(
                line(1, "100", "12", "15", "10"),    // overage 2
                line(2, "100", "13", "15", "10"),    // overage 3
                line(3, "100", "12", "15", "10")     // overage 2
        ), SEEDED);

        assertThat(result.score()).isEqualTo(26);
        assertThat(result.requiredChain()).containsExactly("MANAGER");
    }

    @Test
    @DisplayName("C: everything inside its ceiling -- score 0, no approval needed")
    void allWithinCeilings() {
        var result = engine.assess(List.of(
                line(1, "1000", "12", "15", "15"),
                line(2, "200", "9", "15", "10")
        ), SEEDED);

        assertThat(result.score()).isZero();
        assertThat(result.requiredChain()).isEmpty();
        assertThat(result.needsApproval()).isFalse();
    }

    @Test
    @DisplayName("D: a category with no ceiling falls back to the tier ceiling instead of crashing")
    void missingCategoryCeiling() {
        var result = engine.assess(List.of(
                line(1, "1000", "20", "15", null)    // tier 15 applies -> overage 5
        ), SEEDED);

        assertThat(result.lines().get(0).allowedPct()).isEqualByComparingTo("15");
        assertThat(result.lines().get(0).overagePct()).isEqualByComparingTo("5");
        assertThat(result.score()).isEqualTo(50);
        assertThat(result.requiredChain()).containsExactly("MANAGER", "FINANCE");
    }

    @Test
    @DisplayName("E: 100% discount on every line caps at exactly 100, not 140")
    void hundredPercentDiscountCaps() {
        var result = engine.assess(List.of(
                line(1, "1000", "100", "15", "15"),
                line(2, "1000", "100", "15", "10")
        ), SEEDED);

        assertThat(result.score()).isEqualTo(100);
        assertThat(result.requiredChain()).containsExactly("MANAGER", "FINANCE");
    }

    @Test
    @DisplayName("An empty quotation scores 0 rather than dividing by zero")
    void emptyQuotation() {
        var result = engine.assess(List.of(), SEEDED);

        assertThat(result.score()).isZero();
        assertThat(result.lines()).isEmpty();
        assertThat(result.requiredChain()).isEmpty();
    }

    @Test
    @DisplayName("Bands come from config: lowering the finance floor re-routes the same quote")
    void bandsAreNotHardcoded() {
        var lines = List.of(
                line(1, "1000", "12", "15", "15"),
                line(2, "200", "18", "15", "10")
        );

        assertThat(engine.assess(lines, SEEDED).requiredChain())
                .containsExactly("MANAGER");

        // same quote, finance floor moved from 50 to 30 -- no code change
        var lowered = new RiskWeights(bd(6), bd(4), 1, 30);
        assertThat(engine.assess(lines, lowered).requiredChain())
                .containsExactly("MANAGER", "FINANCE");
    }
}
