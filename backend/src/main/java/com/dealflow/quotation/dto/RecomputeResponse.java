package com.dealflow.quotation.dto;

import java.math.BigDecimal;
import java.util.List;

/** The single shape the whole quotation builder renders. */
public record RecomputeResponse(
        long id,
        String ref,
        /** The builder picks the customer inline, so it needs the current selection back. */
        long customerId,
        String customerName,
        /** Whose quotation this is. The builder is read-only for everyone else. */
        long repId,
        String repName,
        String tier,
        String stage,
        String currency,
        BigDecimal orderDiscountPct,
        List<LineResponse> lines,
        BigDecimal subtotal,
        BigDecimal grandTotal,
        BigDecimal marginPct,
        int riskScore,
        /**
         * The approval this quotation is currently in front of, if any.
         *
         * <p>Without it the quotation screen can say a deal is waiting on an approver and
         * offer no way to reach the approval -- which is exactly how an approver ends up
         * on a page where nothing is actionable.
         */
        Long openApprovalId,
        List<String> requiredChain,
        /**
         * The score this quotation carried when it was last approved, or null if it never
         * has been. A counter from the portal is measured against this rather than zero.
         */
        Integer approvedBaselineScore
) {}
