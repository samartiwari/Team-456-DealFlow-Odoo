package com.dealflow.billing.controller;

import com.dealflow.billing.dto.BillingViewResponse;
import com.dealflow.billing.dto.ClockAdvanceResponse;
import com.dealflow.billing.service.BillingService;

import org.springframework.web.bind.annotation.*;

/** B7: one order, both halves of its billing. */
@RestController
public class BillingController {

    private final BillingService service;

    public BillingController(BillingService service) {
        this.service = service;
    }

    @GetMapping("/api/quotations/{quotationId}/billing")
    public BillingViewResponse billing(@PathVariable long quotationId) {
        return service.view(quotationId);
    }

    /**
     * Demo aid: winds the billing clock one cycle forward and runs the nightly close.
     *
     * <p>The same method the scheduler calls, with the date as a parameter -- so what is
     * demonstrated is the job that actually runs, not a separate path that resembles it.
     */
    @PostMapping("/api/billing/advance-clock")
    public ClockAdvanceResponse advanceClock(@RequestParam long userId) {
        return service.advanceClock(userId);
    }
}
