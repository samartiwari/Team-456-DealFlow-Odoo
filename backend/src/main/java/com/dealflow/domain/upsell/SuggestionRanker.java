package com.dealflow.domain.upsell;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Decides what else belongs on an order, and what each candidate would do to its margin.
 *
 * <p>Two numbers come out of here and they answer different questions. {@code score} ranks
 * how well the pairing fits; {@code marginDeltaPt} says what it does to <em>this</em> deal.
 * They disagree routinely -- the best-fitting suggestion is often not the most profitable
 * one -- which is why both are returned rather than one derived from the other.
 *
 * <p>Pure Java on purpose -- no Spring, no JPA, no annotations -- so it is unit-testable
 * without a database.
 */
public final class SuggestionRanker {

    /**
     * Weights from the brief's ranking formula.
     *
     * <p>Unlike the risk weights these are Java constants rather than {@code system_config}
     * rows. The risk weights are configurable because changing a band live is something the
     * product has to demonstrate; nothing changes these at runtime, and a knob nobody turns
     * is a liability rather than a feature.
     */
    private static final BigDecimal W_CONFIDENCE = new BigDecimal("0.5");
    private static final BigDecimal W_PROMOTED = new BigDecimal("0.3");
    private static final BigDecimal W_MARGIN_HEALTH = new BigDecimal("0.2");

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final int SCORE_SCALE = 2;
    private static final int PERCENT_SCALE = 2;

    /** Intermediate scale -- money is only rounded when it is displayed. */
    private static final int WORKING_SCALE = 8;

    public List<RankedSuggestion> rank(OrderSnapshot order, List<Candidate> candidates) {
        BigDecimal marginWithout = marginPct(order.net(), order.cost());

        List<RankedSuggestion> ranked = new ArrayList<>();
        for (Candidate c : candidates) {
            if (!worthOffering(order, c)) {
                continue;
            }
            ranked.add(new RankedSuggestion(
                    c.productId(),
                    score(c),
                    delta(order, c, marginWithout),
                    c.promoted()));
        }

        // Ties broken by id so the panel does not reshuffle between identical calls.
        ranked.sort(Comparator.comparing(RankedSuggestion::score).reversed()
                .thenComparing(RankedSuggestion::productId));
        return List.copyOf(ranked);
    }

    private static boolean worthOffering(OrderSnapshot order, Candidate c) {
        if (c.inCart() || c.dismissed() || c.unavailable()) {
            return false;
        }
        // Against what the line would actually be sold for, not its list price.
        // A new line inherits the order-level discount the moment it is added, so a
        // floor measured at list price answers a question nobody asked: it passes
        // identically on a clean order and on one discounted past the point where the
        // product makes anything at all.
        return marginAsSold(order, c).compareTo(c.minMarginPct()) >= 0;
    }

    private static BigDecimal score(Candidate c) {
        BigDecimal marginHealth = ownMarginPct(c).divide(HUNDRED, WORKING_SCALE, RoundingMode.HALF_UP);
        return c.confidence().multiply(W_CONFIDENCE)
                .add(c.promoted() ? W_PROMOTED : BigDecimal.ZERO)
                .add(marginHealth.multiply(W_MARGIN_HEALTH))
                .setScale(SCORE_SCALE, RoundingMode.HALF_UP);
    }

    /**
     * What the order's margin becomes with this line on it, minus what it is now.
     *
     * <p>The difference of two rounded percentages rather than a rounded difference: these
     * are the same two figures the screen shows, so the delta has to reconcile with them.
     */
    private static BigDecimal delta(OrderSnapshot order, Candidate c, BigDecimal marginWithout) {
        // A new line carries the order-level discount, same as every other line.
        BigDecimal effective = clampPercent(order.orderDiscountPct());
        BigDecimal candidateNet = c.unitPrice()
                .multiply(HUNDRED.subtract(effective))
                .divide(HUNDRED, WORKING_SCALE, RoundingMode.HALF_UP);

        BigDecimal marginWith = marginPct(
                order.net().add(candidateNet), order.cost().add(c.unitCost()));
        return marginWith.subtract(marginWithout);
    }

    /**
     * Margin at list price, before any discount. Drives the score.
     *
     * <p>Deliberately blind to the order discount: the score ranks how well a product
     * fits alongside what is already in the cart, and that ranking should not reshuffle
     * every time the rep types in the discount box. What the discount changes is whether
     * the product is worth offering at all, which is {@link #marginAsSold} below.
     */
    private static BigDecimal ownMarginPct(Candidate c) {
        return marginOf(c.unitPrice(), c.unitCost());
    }

    /**
     * Margin at the price this line would actually carry.
     *
     * <p>The order-level discount is pushed down onto every line, including one added
     * from this panel, so a candidate on a 35%-discounted order is not sold at its list
     * price and its real margin can be far thinner -- or negative. This is what the floor
     * is checked against, because "only healthy margin suggestions surface" is a claim
     * about the deal in front of the rep, not about the catalog.
     */
    private static BigDecimal marginAsSold(OrderSnapshot order, Candidate c) {
        BigDecimal effective = clampPercent(order.orderDiscountPct());
        BigDecimal net = c.unitPrice()
                .multiply(HUNDRED.subtract(effective))
                .divide(HUNDRED, WORKING_SCALE, RoundingMode.HALF_UP);
        return marginOf(net, c.unitCost());
    }

    private static BigDecimal marginOf(BigDecimal price, BigDecimal cost) {
        if (price.signum() <= 0) {
            // Given away entirely: no margin to speak of, and nothing to divide by.
            return BigDecimal.ZERO;
        }
        return price.subtract(cost)
                .multiply(HUNDRED)
                .divide(price, PERCENT_SCALE, RoundingMode.HALF_UP);
    }

    /** A fully discounted order nets zero; report 0 rather than dividing by it. */
    private static BigDecimal marginPct(BigDecimal net, BigDecimal cost) {
        if (net.signum() == 0) {
            return BigDecimal.ZERO;
        }
        return net.subtract(cost).multiply(HUNDRED)
                .divide(net, PERCENT_SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal clampPercent(BigDecimal pct) {
        return pct.max(BigDecimal.ZERO).min(HUNDRED);
    }
}
