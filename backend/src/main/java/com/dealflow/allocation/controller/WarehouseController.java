package com.dealflow.allocation.controller;

import com.dealflow.allocation.dto.StockReceiptRequest;
import com.dealflow.allocation.dto.WarehouseResponse;
import com.dealflow.allocation.service.AllocationService;

import java.util.List;



import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/warehouses")
public class WarehouseController {

    private final AllocationService service;

    public WarehouseController(AllocationService service) {
        this.service = service;
    }

    @GetMapping
    public List<WarehouseResponse> list() {
        return service.listWarehouses();
    }

    /** Receive stock. Anything backordered on this product becomes consolidatable. */
    @PostMapping("/{warehouseId}/stock")
    public ResponseEntity<Void> receive(@PathVariable long warehouseId,
                                        @RequestBody StockReceiptRequest request) {
        service.receiveStock(warehouseId, request.productId(), request.quantity());
        return ResponseEntity.noContent().build();
    }
}
