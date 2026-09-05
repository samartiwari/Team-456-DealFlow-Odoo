package com.dealflow.billing.dto;

import java.math.BigDecimal;
import java.util.List;

public record SubscriptionResponse(
        long id,
        long productId,
        String productName,
        int quantity,
        /** Per unit, per period, after the line's discount. */
        BigDecimal unitPrice,
        /** quantity x unitPrice -- what a full period bills. */
        BigDecimal periodAmount,
        String status,
        String startDate,
        String cancelledAt,
        /** Twelve rows, oldest first. */
        List<BillingPeriodResponse> periods
) {}
