package com.dealflow.approval.controller;

import com.dealflow.approval.dto.ApprovalDetailResponse;
import com.dealflow.approval.dto.ApprovalSummaryResponse;
import com.dealflow.approval.dto.DecideRequest;
import com.dealflow.approval.service.ApprovalService;

import java.util.List;


import com.dealflow.identity.security.CurrentUser;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/approvals")
public class ApprovalController {

    private final ApprovalService service;
    private final CurrentUser currentUser;

    public ApprovalController(ApprovalService service, CurrentUser currentUser) {
        this.currentUser = currentUser;
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
                                         @RequestBody DecideRequest request) {
        return service.decide(id, request, currentUser.id());
    }
}
