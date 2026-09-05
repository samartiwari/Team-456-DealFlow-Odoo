package com.dealflow.allocation.controller;

import com.dealflow.allocation.dto.AcceptAllocationRequest;
import com.dealflow.allocation.dto.AllocationPlanResponse;
import com.dealflow.allocation.service.AllocationService;

import com.dealflow.identity.security.CurrentUser;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quotations/{id}/allocation")
public class AllocationController {

    private final AllocationService service;
    private final CurrentUser currentUser;

    public AllocationController(AllocationService service, CurrentUser currentUser) {
        this.currentUser = currentUser;
        this.service = service;
    }

    /** The suggested split. Computes and stores nothing, so it is safe to poll. */
    @GetMapping
    public AllocationPlanResponse suggest(@PathVariable long id) {
        return service.suggest(id);
    }

    /** Commits the plan -- the suggestion as-is, or a manual override of it. */
    @PostMapping
    public AllocationPlanResponse accept(@PathVariable long id,
                                         @RequestBody(required = false) AcceptAllocationRequest request) {
        return service.accept(id,
                request == null ? new AcceptAllocationRequest(null) : request,
                currentUser.id());
    }
}
