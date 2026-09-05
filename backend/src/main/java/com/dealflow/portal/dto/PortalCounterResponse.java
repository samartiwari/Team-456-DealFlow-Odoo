package com.dealflow.portal.dto;

import java.math.BigDecimal;

/** The customer's outstanding proposal. PENDING | ACCEPTED. */
public record PortalCounterResponse(BigDecimal discountPct, String note,
                                    String proposedAt, String state) {}
