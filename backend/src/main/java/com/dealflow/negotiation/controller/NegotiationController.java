package com.dealflow.negotiation.controller;

import com.dealflow.negotiation.dto.NegotiationThreadResponse;
import com.dealflow.negotiation.dto.ReplyRequest;
import com.dealflow.negotiation.dto.SendToCustomerResponse;
import com.dealflow.negotiation.service.NegotiationService;

import org.springframework.beans.factory.annotation.Value;
import com.dealflow.identity.security.CurrentUser;

import org.springframework.web.bind.annotation.*;

/** The rep's side of the negotiation: send the link, read the thread, reply. */
@RestController
@RequestMapping("/api/quotations/{quotationId}")
public class NegotiationController {

    private final NegotiationService service;
    private final CurrentUser currentUser;
    private final String portalBaseUrl;

    public NegotiationController(NegotiationService service, CurrentUser currentUser,
                                 @Value("${dealflow.portal-url:http://localhost:5173/portal.html}")
                                 String portalBaseUrl) {
        this.service = service;
        this.currentUser = currentUser;
        this.portalBaseUrl = portalBaseUrl;
    }

    /** Issues the magic link. In production this is the one thing that would only be emailed. */
    @PostMapping("/send")
    public SendToCustomerResponse send(@PathVariable long quotationId) {
        return service.send(quotationId, currentUser.id(), portalBaseUrl);
    }

    @GetMapping("/negotiation")
    public NegotiationThreadResponse thread(@PathVariable long quotationId) {
        return service.thread(quotationId);
    }

    @PostMapping("/negotiation/reply")
    public NegotiationThreadResponse reply(@PathVariable long quotationId,
                                           @RequestBody ReplyRequest request) {
        return service.reply(quotationId, request, currentUser.id());
    }
}
