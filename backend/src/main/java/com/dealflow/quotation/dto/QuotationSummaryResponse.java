package com.dealflow.quotation.dto;

import java.math.BigDecimal;

/**
 * @param customerCountered the customer has proposed terms nobody has settled yet. On the
 *                          list and the pipeline this is the difference between "waiting on
 *                          someone" and "waiting on you" -- without it a counter is only
 *                          discoverable by opening the quotation that received it.
 */
public record QuotationSummaryResponse(
        long id,
        String ref,
        String customerName,
        String stage,
        BigDecimal grandTotal,
        String currency,
        boolean customerCountered
) {}
