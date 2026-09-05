package com.dealflow.billing.service;

/**
 * Published when a quotation reaches APPROVED, by either route -- auto-approval at risk 0,
 * or the last signature on an approval chain.
 *
 * <p>An event rather than a direct call because both routes live in different services, and
 * neither should have to know that billing exists.
 */
public record QuotationApprovedEvent(long quotationId) {}
