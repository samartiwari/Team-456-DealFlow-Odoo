package com.dealflow.portal.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Everything the customer may see, and nothing else.
 *
 * <p>There is no {@code unitCost}, {@code margin}, {@code riskScore}, {@code requiredChain}
 * or {@code approvalSteps} field on this record or on anything it holds. That is structural
 * rather than filtered: a serialisation mistake cannot leak a field that does not exist.
 *
 * <p>There is also no numeric quotation id. The customer gets {@link #publicRef}, and the
 * real id comes from their token rather than the URL -- so there is no neighbouring id to
 * try.
 */
public record PortalQuotationResponse(
        String publicRef,
        String customerName,
        /** SENT | UNDER_NEGOTIATION | PENDING_APPROVAL | CONFIRMED */
        String status,
        String currency,
        List<PortalLineResponse> lines,
        BigDecimal orderDiscountPct,
        BigDecimal subtotal,
        BigDecimal grandTotal,
        List<PortalMessageResponse> messages,
        PortalCounterResponse counter,
        boolean canCounter,
        boolean canConfirm
) {}
