package com.dealflow.policy.controller;

import com.dealflow.policy.dto.DiscountPolicyResponse;
import com.dealflow.policy.dto.UpdatePolicyRequest;
import com.dealflow.policy.service.DiscountPolicyService;

import com.dealflow.identity.security.CurrentUser;

import org.springframework.web.bind.annotation.*;

/** A3: tier ceilings, category ceilings and the approval chain, editable without a redeploy. */
@RestController
@RequestMapping("/api/config/discount-policy")
public class DiscountPolicyController {

    private final DiscountPolicyService service;
    private final CurrentUser currentUser;

    public DiscountPolicyController(DiscountPolicyService service, CurrentUser currentUser) {
        this.currentUser = currentUser;
        this.service = service;
    }

    @GetMapping
    public DiscountPolicyResponse read() {
        return service.read();
    }

    @PatchMapping
    public DiscountPolicyResponse update(@RequestBody UpdatePolicyRequest request) {
        return service.update(request, currentUser.id());
    }
}
