package com.dealflow.domain.upsell;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The figures below are the ones published to the frontend in the Phase 10 brief, so the
 * mock and the live API agree card for card. If a change here moves them, that document
 * moves too -- otherwise the two implementations quietly diverge.
 *
 * <p>Catalog: Laptop 80000/58000, Setup Service 15000/9000, Support Plan 2000/700,
 * Docking Station 12000/8000, Onsite Training 25000/16000.
 */
class SuggestionRankerTest {

    private final SuggestionRanker ranker = new SuggestionRanker();

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    private static Candidate candidate(long id, String price, String cost, boolean promoted) {
        return new Candidate(id, bd(price), bd(cost), BigDecimal.ONE, promoted,
                BigDecimal.ZERO, false, false, false);
    }

    private static final Candidate DOCK = candidate(4, "12000", "8000", true);
    private static final Candidate SUPPORT = candidate(3, "2000", "700", true);
    private static final Candidate SETUP = candidate(2, "15000", "9000", false);
    private static final Candidate TRAINING = candidate(5, "25000", "16000", false);

    /** Laptop Pro x2 at 12%: net 140800, cost 116000, margin 17.61%. */
    private static final OrderSnapshot LAPTOP_CART =
            new OrderSnapshot(bd("140800"), bd("116000"), BigDecimal.ZERO);

    @Test
    @DisplayName("A: the brief's cart ranks support, dock, setup -- and setup wins on margin")
    void exampleA() {
        var result = ranker.rank(LAPTOP_CART, List.of(DOCK, SUPPORT, SETUP));

        assertThat(result).extracting(RankedSuggestion::productId).containsExactly(3L, 4L, 2L);
        assertThat(result.get(0).score()).isEqualByComparingTo("0.93");
        assertThat(result.get(1).score()).isEqualByComparingTo("0.87");
        assertThat(result.get(2).score()).isEqualByComparingTo("0.58");

        assertThat(result.get(0).marginDeltaPt()).isEqualByComparingTo("0.67");
        assertThat(result.get(1).marginDeltaPt()).isEqualByComparingTo("1.24");
        assertThat(result.get(2).marginDeltaPt()).isEqualByComparingTo("2.16");

        // The point of returning both numbers: the top-ranked card is not the most
        // profitable one, and a panel that showed only the score would mislead the rep.
        assertThat(result.get(2).marginDeltaPt())
                .isGreaterThan(result.get(0).marginDeltaPt());
    }

    @Test
    @DisplayName("B: an order-level discount leaves scores alone and widens every margin gain")
    void orderDiscountMovesDeltasNotScores() {
        // same cart, 10% on top: net 124800, margin 7.05%
        var discounted = new OrderSnapshot(bd("124800"), bd("116000"), bd("10"));
        var result = ranker.rank(discounted, List.of(DOCK, SUPPORT, SETUP));

        assertThat(result).extracting(RankedSuggestion::score)
                .containsExactly(bd("0.93"), bd("0.87"), bd("0.58"));
        assertThat(result.get(0).marginDeltaPt()).isEqualByComparingTo("0.77");
        assertThat(result.get(1).marginDeltaPt()).isEqualByComparingTo("1.50");
        assertThat(result.get(2).marginDeltaPt()).isEqualByComparingTo("2.57");
    }

    @Test
    @DisplayName("D: a candidate below the order's own margin dilutes it, and says so")
    void aDilutingCandidateReportsNegative() {
        // Setup Service x1 alone: net 15000, cost 9000, margin 40%. Training is 36%.
        var servicesOnly = new OrderSnapshot(bd("15000"), bd("9000"), BigDecimal.ZERO);
        var result = ranker.rank(servicesOnly, List.of(TRAINING));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).score()).isEqualByComparingTo("0.57");
        assertThat(result.get(0).marginDeltaPt()).isEqualByComparingTo("-2.50");
    }

    @Test
    @DisplayName("In the cart, dismissed, or out of stock -- all three disappear")
    void filtersRemoveCandidates() {
        Candidate inCart = new Candidate(4, bd("12000"), bd("8000"), BigDecimal.ONE, true,
                BigDecimal.ZERO, true, false, false);
        Candidate dismissed = new Candidate(3, bd("2000"), bd("700"), BigDecimal.ONE, true,
                BigDecimal.ZERO, false, true, false);
        Candidate outOfStock = new Candidate(2, bd("15000"), bd("9000"), BigDecimal.ONE, false,
                BigDecimal.ZERO, false, false, true);

        assertThat(ranker.rank(LAPTOP_CART, List.of(inCart, dismissed, outOfStock))).isEmpty();
    }

    @Test
    @DisplayName("A candidate below its pairing's margin floor is dropped, however well it pairs")
    void marginFloorOutranksAGoodPairing() {
        // Docking Station is 33.33%; a floor of 40 rules it out even though it is promoted
        // and pairs at full confidence.
        Candidate belowFloor = new Candidate(4, bd("12000"), bd("8000"), BigDecimal.ONE, true,
                bd("40"), false, false, false);
        assertThat(ranker.rank(LAPTOP_CART, List.of(belowFloor))).isEmpty();

        // exactly at the floor is still offered -- the rule is "below", not "at or below"
        Candidate atFloor = new Candidate(4, bd("12000"), bd("8000"), BigDecimal.ONE, true,
                bd("33.33"), false, false, false);
        assertThat(ranker.rank(LAPTOP_CART, List.of(atFloor))).hasSize(1);
    }

    @Test
    @DisplayName("A mined pairing at lower confidence ranks below a curated one")
    void curatedPairingsOutrankWeakerOnes() {
        Candidate curated = new Candidate(4, bd("12000"), bd("8000"), BigDecimal.ONE, false,
                BigDecimal.ZERO, false, false, false);
        Candidate mined = new Candidate(2, bd("15000"), bd("9000"), bd("0.4"), false,
                BigDecimal.ZERO, false, false, false);

        var result = ranker.rank(LAPTOP_CART, List.of(mined, curated));
        assertThat(result).extracting(RankedSuggestion::productId).containsExactly(4L, 2L);
    }

    @Test
    @DisplayName("An empty cart suggests nothing rather than dividing by zero")
    void emptyOrderIsSafe() {
        var empty = new OrderSnapshot(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
        assertThat(ranker.rank(empty, List.of())).isEmpty();
        // and a fully discounted order still answers, rather than throwing
        assertThat(ranker.rank(empty, List.of(DOCK))).hasSize(1);
    }

    @Test
    @DisplayName("Equal scores fall back to product id, so the panel does not reshuffle")
    void tiesAreStable() {
        Candidate a = candidate(9, "1000", "500", false);
        Candidate b = candidate(4, "1000", "500", false);

        assertThat(ranker.rank(LAPTOP_CART, List.of(a, b)))
                .extracting(RankedSuggestion::productId).containsExactly(4L, 9L);
    }
}
