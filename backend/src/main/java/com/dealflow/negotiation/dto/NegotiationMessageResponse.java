package com.dealflow.negotiation.dto;

public record NegotiationMessageResponse(
        long id,
        String author,
        String authorName,
        Long lineId,
        String body,
        String createdAt
) {}
