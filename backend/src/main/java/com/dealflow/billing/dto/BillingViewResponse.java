package com.dealflow.billing.dto;

import java.util.List;

/** Both halves of one order's billing, in one call. */
public record BillingViewResponse(
        long quotationId,
        String ref,
        String customerName,
        String currency,
        /** The one-time half. Null when every line is recurring. */
        InvoiceResponse invoice,
        /** The recurring half -- one per recurring line. Empty when there are none. */
        List<SubscriptionResponse> subscriptions
) {}
