package com.dealflow.api;

import java.util.List;

import com.dealflow.approval.ApprovalService;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/approvals")
public class ApprovalController {

    private final ApprovalService service;

    public ApprovalController(ApprovalService service) {
        this.service = service;
    }

    @GetMapping
    public List<ApprovalSummaryResponse> queue() {
        return service.queue();
    }

    @GetMapping("/{id}")
    public ApprovalDetailResponse detail(@PathVariable long id) {
        return service.detail(id);
    }

    @PostMapping("/{id}/decide")
    public ApprovalDetailResponse decide(@PathVariable long id,
                                         @RequestBody DecideRequest request,
                                         @RequestParam long userId) {
        return service.decide(id, request, userId);
    }
}
