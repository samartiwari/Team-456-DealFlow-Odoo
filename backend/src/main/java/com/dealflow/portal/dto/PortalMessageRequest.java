package com.dealflow.portal.dto;

/** lineId is optional -- absent means the message is about the order as a whole. */
public record PortalMessageRequest(Long lineId, String body) {}
