package com.dealflow.billing.dto;

import java.math.BigDecimal;

/** Amount is always positive -- it is a credit by nature, not by sign. */
public record CreditNoteResponse(long id, String ref, BigDecimal amount,
                                 String reason, String issuedAt) {}
