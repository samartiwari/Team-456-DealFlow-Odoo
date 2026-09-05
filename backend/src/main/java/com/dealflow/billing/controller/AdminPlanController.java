package com.dealflow.billing.controller;

import com.dealflow.billing.dto.PlanBody;
import com.dealflow.billing.dto.SubscriptionPlanResponse;
import com.dealflow.billing.service.AdminPlanService;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** A5. Gated as part of {@code /api/admin/**}. */
@RestController
@RequestMapping("/api/admin/subscription-plans")
public class AdminPlanController {

    private final AdminPlanService admin;

    public AdminPlanController(AdminPlanService admin) {
        this.admin = admin;
    }

    @GetMapping
    public List<SubscriptionPlanResponse> list() {
        return admin.list();
    }

    @PostMapping
    public SubscriptionPlanResponse create(@RequestBody PlanBody body) {
        return admin.create(body);
    }

    @PatchMapping("/{id}")
    public SubscriptionPlanResponse update(@PathVariable long id, @RequestBody PlanBody body) {
        return admin.update(id, body);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        admin.delete(id);
        return ResponseEntity.noContent().build();
    }
}
