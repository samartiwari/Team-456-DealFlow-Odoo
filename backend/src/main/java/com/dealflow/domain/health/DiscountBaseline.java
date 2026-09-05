package com.dealflow.domain.health;

import java.math.BigDecimal;

/**
 * What normal looks like for one rep.
 *
 * @param sampleSize how many confirmed quotes the mean and deviation came from
 * @param fromTeam   true when the rep had too little history of their own and the team's
 *                   numbers stood in
 */
public record DiscountBaseline(BigDecimal mean, BigDecimal stdDev, int sampleSize,
                               boolean fromTeam) {}
