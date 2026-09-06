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
        /**
         * Named for the stage, not the column.
         *
         * <p>The client and the mock both call these fromStage/toStage, and the feed sent
         * fromState/toState -- so the arrow between stages rendered on mocks and silently
         * vanished against the real backend. The screen's vocabulary wins: a reader of the
         * feed is looking at stages.
         */
        String fromStage,
        String toStage,
        String actorName,
        String reason,
        String createdAt
) {}
