package com.dealflow.billing.dto;

import java.math.BigDecimal;

/**
 * @param deltaAmount positive was charged, negative was credited. Never null; may be zero
 * @param explanation plain English, written to be rendered verbatim
 */
public record ProrationResultResponse(
        BigDecimal deltaAmount,
        String explanation,
        CreditNoteResponse creditNote,
        BillingViewResponse billing
) {}
