package com.dealflow.domain.risk;

import java.math.BigDecimal;

/**
 * Every value here is a row in {@code system_config}, never a Java literal.
 * Changing a band in the database changes routing with no redeploy.
 */
public record RiskWeights(
        BigDecimal weighted,
        BigDecimal max,
        int managerBandMin,
        int financeBandMin
) {}
