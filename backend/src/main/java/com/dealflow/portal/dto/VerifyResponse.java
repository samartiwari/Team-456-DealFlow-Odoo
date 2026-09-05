package com.dealflow.portal.dto;

/**
 * @param portalToken send as {@code X-Portal-Token} from here on. The link that produced
 *                    it is now burned and will not verify a second time.
 */
public record VerifyResponse(String portalToken, String expiresAt, String customerName) {}
