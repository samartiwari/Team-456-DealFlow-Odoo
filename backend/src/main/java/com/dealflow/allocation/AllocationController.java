package com.dealflow.allocation;

import com.dealflow.allocation.dto.AcceptAllocationRequest;
import com.dealflow.allocation.dto.AllocationPlanResponse;
import com.dealflow.allocation.service.AllocationService;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quotations/{id}/allocation")
public class AllocationController {

    private final AllocationService service;

    public AllocationController(AllocationService service) {
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
                                         @RequestBody(required = false) AcceptAllocationRequest request,
                                         @RequestParam long userId) {
        return service.accept(id,
                request == null ? new AcceptAllocationRequest(null) : request,
                userId);
    }
}
