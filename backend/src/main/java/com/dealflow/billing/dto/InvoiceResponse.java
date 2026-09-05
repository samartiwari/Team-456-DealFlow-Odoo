package com.dealflow.billing.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * @param status      derived from payments and credits, never assigned by a client
 * @param outstanding total minus paid minus credited, floored at zero
 */
public record InvoiceResponse(
        long id,
        String ref,
        long quotationId,
        String status,
        String issuedAt,
        List<InvoiceLineResponse> lines,
        BigDecimal total,
        BigDecimal paid,
        BigDecimal outstanding,
        List<PaymentResponse> payments,
        List<CreditNoteResponse> creditNotes
) {}
