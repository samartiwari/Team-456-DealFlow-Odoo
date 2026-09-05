package com.dealflow.portal.dto;

public record PortalMessageResponse(
        long id,
        /** CUSTOMER | SALES */
        String author,
        String authorName,
        Long lineId,
        String body,
        String createdAt
) {}
