package com.dealflow.allocation.controller;

import com.dealflow.allocation.dto.AdminWarehouseResponse;
import com.dealflow.allocation.dto.WarehouseBody;
import com.dealflow.allocation.service.AdminWarehouseService;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** A4. Gated as part of {@code /api/admin/**}. */
@RestController
@RequestMapping("/api/admin/warehouses")
public class AdminWarehouseController {

    private final AdminWarehouseService admin;

    public AdminWarehouseController(AdminWarehouseService admin) {
        this.admin = admin;
    }

    @GetMapping
    public List<AdminWarehouseResponse> list() {
        return admin.list();
    }

    @PostMapping
    public AdminWarehouseResponse create(@RequestBody WarehouseBody body) {
        return admin.create(body);
    }

    @PatchMapping("/{id}")
    public AdminWarehouseResponse update(@PathVariable long id, @RequestBody WarehouseBody body) {
        return admin.update(id, body);
    }

    @PostMapping("/{id}/restore")
    public AdminWarehouseResponse restore(@PathVariable long id) {
        return admin.restore(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> archive(@PathVariable long id) {
        admin.archive(id);
        return ResponseEntity.noContent().build();
    }
}
