package com.dealflow.policy.dto;

import java.math.BigDecimal;

/** The four system_config rows the risk engine reads, typed. */
public record ApprovalPolicyResponse(
        BigDecimal weightedWeight,
        BigDecimal maxWeight,
        int managerBandMin,
        int financeBandMin
) {}
