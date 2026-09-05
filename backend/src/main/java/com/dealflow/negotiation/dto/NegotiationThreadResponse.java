package com.dealflow.negotiation.dto;

import java.util.List;

/** The rep's view of the conversation. Internal, so the figures are all here. */
public record NegotiationThreadResponse(
        long quotationId,
        String ref,
        String customerName,
        String status,
        /** The score the quotation carried when it was last approved. Null if never. */
        Integer approvedBaselineScore,
        String sentAt,
        List<NegotiationMessageResponse> messages,
        NegotiationCounterResponse counter
) {}
