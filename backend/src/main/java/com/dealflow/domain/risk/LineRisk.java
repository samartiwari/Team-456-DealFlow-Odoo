package com.dealflow.domain.risk;

import java.math.BigDecimal;

/** Per-line evidence behind the score. The approval screen renders this table verbatim. */
public record LineRisk(
        long lineId,
        BigDecimal givenPct,
        BigDecimal allowedPct,
        BigDecimal overagePct,
        BigDecimal weight
) {
    public boolean isOver() {
        return overagePct.signum() > 0;
    }
}
