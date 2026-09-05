package com.dealflow.policy.controller;

import com.dealflow.policy.dto.DiscountPolicyResponse;
import com.dealflow.policy.dto.UpdatePolicyRequest;
import com.dealflow.policy.service.DiscountPolicyService;

import org.springframework.web.bind.annotation.*;

/** A3: tier ceilings, category ceilings and the approval chain, editable without a redeploy. */
@RestController
@RequestMapping("/api/config/discount-policy")
public class DiscountPolicyController {

    private final DiscountPolicyService service;

    public DiscountPolicyController(DiscountPolicyService service) {
        this.service = service;
    }

    @GetMapping
    public DiscountPolicyResponse read() {
        return service.read();
    }

    @PatchMapping
    public DiscountPolicyResponse update(@RequestBody UpdatePolicyRequest request,
                                         @RequestParam long userId) {
        return service.update(request, userId);
    }
}
