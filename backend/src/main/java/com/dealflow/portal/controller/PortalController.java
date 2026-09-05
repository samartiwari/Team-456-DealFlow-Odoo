package com.dealflow.portal.controller;

import com.dealflow.portal.dto.*;
import com.dealflow.portal.service.PortalService;

import org.springframework.web.bind.annotation.*;

/**
 * B8. Everything the customer can reach, and nothing else.
 *
 * <p>No {@code userId} parameter anywhere on this controller -- that is the workspace's
 * stand-in identity and it has no meaning here. The caller proves who they are with
 * {@code X-Portal-Token}, and that token names exactly one quotation.
 *
 * <p>No path here takes a quotation id, either. When the two Spring Security filter chains
 * arrive, this whole prefix moves behind the portal chain and none of these signatures
 * change.
 */
@RestController
@RequestMapping("/api/portal")
public class PortalController {

    private static final String TOKEN_HEADER = "X-Portal-Token";
    // The header is declared optional so an absent one reaches the token service and comes
    // back as 401. Left required, Spring would answer 400 -- which reads as "your request
    // was malformed" when the truth is "you did not present a credential".

    private final PortalService service;

    public PortalController(PortalService service) {
        this.service = service;
    }

    /** Exchanges a magic link for a session. The link is burned in the process. */
    @PostMapping("/auth/verify")
    public VerifyResponse verify(@RequestBody VerifyRequest request) {
        return service.verify(request);
    }

    @GetMapping("/quotation")
    public PortalQuotationResponse quotation(@RequestHeader(value = TOKEN_HEADER, required = false) String token) {
        return service.quotation(token);
    }

    @PostMapping("/quotation/messages")
    public PortalQuotationResponse comment(@RequestHeader(value = TOKEN_HEADER, required = false) String token,
                                           @RequestBody PortalMessageRequest request) {
        return service.comment(token, request);
    }

    /** Proposes new terms. The quotation re-scores and re-routes itself if they are worse. */
    @PostMapping("/quotation/counter")
    public PortalQuotationResponse counter(@RequestHeader(value = TOKEN_HEADER, required = false) String token,
                                           @RequestBody PortalCounterRequest request) {
        return service.counter(token, request);
    }

    @PostMapping("/quotation/confirm")
    public PortalQuotationResponse confirm(@RequestHeader(value = TOKEN_HEADER, required = false) String token) {
        return service.confirm(token);
    }
}
