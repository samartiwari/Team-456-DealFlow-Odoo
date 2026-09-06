package com.dealflow.analytics.dto;

/**
 * One entry in the cross-quotation activity feed.
 *
 * <p>The same facts {@code AuditResponse} carries inside a single approval, plus the two
 * fields a feed cannot do without: which quotation it belongs to, and that quotation's
 * reference, so a row can name the deal and link to it without a second call.
 *
 * @param actorName null for anything the system did on its own -- the nightly close, say
 */
public record ActivityResponse(
        long id,
        long quotationId,
        String ref,
        String action,
        String fromState,
        String toState,
        String actorName,
        String reason,
        String createdAt
) {}
