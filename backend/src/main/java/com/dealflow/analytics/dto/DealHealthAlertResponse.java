package com.dealflow.analytics.dto;

public record DealHealthAlertResponse(
        long id,
        long quotationId,
        String ref,
        String customerName,
        String repName,
        String type,
        String severity,
        /** Plain English, safe to render verbatim. */
        String explanation,
        String openedAt,
        String ackedAt,
        String resolvedAt,
        /** Present on DISCOUNT_ANOMALY only; null on the rest. */
        AlertMetricsResponse metrics
) {}
