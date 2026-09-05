package com.dealflow.portal.dto;

import java.math.BigDecimal;

/**
 * One line as the customer sees it: what they are buying and what it costs them.
 *
 * <p>The line id is here because line-level comments need it, and it reveals nothing --
 * the token already grants this entire quotation. It is the quotation id that never
 * appears.
 */
public record PortalLineResponse(
        long id,
        String productName,
        String category,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal discountPct,
        BigDecimal netTotal
) {}
