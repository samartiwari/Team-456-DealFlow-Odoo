package com.dealflow.domain.risk;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Scores a quotation's discount exposure and decides who must approve it.
 *
 * <p>Both terms of the score are needed: {@code maxOverage} catches one badly broken line,
 * {@code weightedOverage} catches many small ones. That is what "blended" means.
 *
 * <p>Pure Java on purpose -- no Spring, no JPA, no annotations -- so it is unit-testable
 * without a database.
 */
public final class BlendedRiskEngine {

    /** Weight is divided at this scale. Rounding earlier moves Example A off 40. */
    private static final int WEIGHT_SCALE = 6;

    private static final BigDecimal MAX_SCORE = BigDecimal.valueOf(100);

    public RiskAssessment assess(List<LineInput> lines, RiskWeights w) {
        BigDecimal orderNet = lines.stream()
                .map(LineInput::lineNet)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // A fresh, empty or fully-zeroed quote has nothing to score -- and must not divide by zero.
        if (orderNet.signum() == 0) {
            return new RiskAssessment(0, List.of(), List.of());
        }

        List<LineRisk> risks = new ArrayList<>(lines.size());
        for (LineInput l : lines) {
            BigDecimal allowed = allowedFor(l);
            BigDecimal overage = l.discountPct().subtract(allowed).max(BigDecimal.ZERO);
            BigDecimal weight = l.lineNet().divide(orderNet, WEIGHT_SCALE, RoundingMode.HALF_UP);
            risks.add(new LineRisk(l.lineId(), l.discountPct(), allowed, overage, weight));
        }

        BigDecimal weightedOverage = risks.stream()
                .map(r -> r.overagePct().multiply(r.weight()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal maxOverage = risks.stream()
                .map(LineRisk::overagePct)
                .max(BigDecimal::compareTo)
                .orElse(BigDecimal.ZERO);

        int score = weightedOverage.multiply(w.weighted())
                .add(maxOverage.multiply(w.max()))
                .setScale(0, RoundingMode.HALF_UP)
                .min(MAX_SCORE)          // cap before intValue(), so 100% discount cannot overshoot
                .intValue();

        return new RiskAssessment(score, risks, chainFor(score, w));
    }

    /** A category without a ceiling falls back to the tier ceiling rather than blowing up. */
    private static BigDecimal allowedFor(LineInput l) {
        return l.categoryCeilingPct() == null
                ? l.tierCeilingPct()
                : l.tierCeilingPct().min(l.categoryCeilingPct());
    }

    private static List<String> chainFor(int score, RiskWeights w) {
        if (score >= w.financeBandMin()) {
            return List.of("MANAGER", "FINANCE");
        }
        if (score >= w.managerBandMin()) {
            return List.of("MANAGER");
        }
        return List.of();
    }
}
