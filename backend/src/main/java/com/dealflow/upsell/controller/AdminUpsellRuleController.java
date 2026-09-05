package com.dealflow.upsell.controller;

import com.dealflow.upsell.dto.AdminUpsellRuleResponse;
import com.dealflow.upsell.dto.UpsellRuleBody;
import com.dealflow.upsell.service.AdminUpsellRuleService;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** A6. Gated as part of {@code /api/admin/**}. */
@RestController
@RequestMapping("/api/admin/upsell-rules")
public class AdminUpsellRuleController {

    private final AdminUpsellRuleService admin;

    public AdminUpsellRuleController(AdminUpsellRuleService admin) {
        this.admin = admin;
    }

    @GetMapping
    public List<AdminUpsellRuleResponse> list() {
        return admin.list();
    }

    @PostMapping
    public AdminUpsellRuleResponse create(@RequestBody UpsellRuleBody body) {
        return admin.create(body);
    }

    @PatchMapping("/{id}")
    public AdminUpsellRuleResponse update(@PathVariable long id,
                                          @RequestBody UpsellRuleBody body) {
        return admin.update(id, body);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        admin.delete(id);
        return ResponseEntity.noContent().build();
    }
}
