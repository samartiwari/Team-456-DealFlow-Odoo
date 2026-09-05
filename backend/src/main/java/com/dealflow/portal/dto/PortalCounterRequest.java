package com.dealflow.portal.dto;

import java.math.BigDecimal;

/** The discount the customer is asking for across the order. */
public record PortalCounterRequest(BigDecimal discountPct, String note) {}
