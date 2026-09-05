package com.dealflow.negotiation.dto;

import com.dealflow.quotation.dto.RecomputeResponse;

/**
 * @param portalUrl the magic link. Returned here because there is no mail server yet;
 *                  in production this is the one thing that would only ever be emailed
 */
public record SendToCustomerResponse(String portalUrl, String expiresAt,
                                     RecomputeResponse quotation) {}
