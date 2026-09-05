package com.dealflow.billing.controller;

import com.dealflow.billing.dto.CancelSubscriptionRequest;
import com.dealflow.billing.dto.ChangeSubscriptionRequest;
import com.dealflow.billing.dto.ProrationResultResponse;
import com.dealflow.billing.service.BillingService;

import jakarta.validation.Valid;

import com.dealflow.identity.security.CurrentUser;

import org.springframework.web.bind.annotation.*;

/** A5: change or cancel a schedule mid-period, and see what it costs. */
@RestController
@RequestMapping("/api/subscriptions/{id}")
public class SubscriptionController {

    private final BillingService service;
    private final CurrentUser currentUser;

    public SubscriptionController(BillingService service, CurrentUser currentUser) {
        this.currentUser = currentUser;
        this.service = service;
    }

    @PostMapping("/change")
    public ProrationResultResponse change(@PathVariable long id,
                                          @Valid @RequestBody ChangeSubscriptionRequest request) {
        return service.change(id, request, currentUser.id());
    }

    @PostMapping("/cancel")
    public ProrationResultResponse cancel(@PathVariable long id,
                                          @RequestBody(required = false) CancelSubscriptionRequest request) {
        return service.cancel(id, request, currentUser.id());
    }
}
