package com.dealflow.allocation.controller;

import com.dealflow.allocation.dto.FulfilmentBoardResponse;
import com.dealflow.allocation.dto.StockReceiptRequest;
import com.dealflow.allocation.dto.WarehouseResponse;
import com.dealflow.allocation.service.AllocationService;
import com.dealflow.allocation.service.FulfilmentService;

import java.util.List;



import org.springframework.http.ResponseEntity;
import com.dealflow.identity.security.CurrentUser;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/warehouses")
public class WarehouseController {

    private final AllocationService service;
    private final CurrentUser currentUser;
    private final FulfilmentService fulfilment;

    public WarehouseController(AllocationService service, FulfilmentService fulfilment, CurrentUser currentUser) {
        this.currentUser = currentUser;
        this.service = service;
        this.fulfilment = fulfilment;
    }

    @GetMapping
    public List<WarehouseResponse> list() {
        return service.listWarehouses();
    }

    /**
     * Receive stock. Anything backordered on this product becomes consolidatable.
     *
     * <p>Answers with the whole board rather than 204: a receipt changes stock levels, order
     * statuses and consolidation flags at once, so the screen would need a second call to
     * show what just happened.
     */
    @PostMapping("/{warehouseId}/stock")
    public FulfilmentBoardResponse receive(@PathVariable long warehouseId,
                                           @RequestBody StockReceiptRequest request) {
        service.receiveStock(warehouseId, request.productId(), request.quantity(), currentUser.id());
        return fulfilment.board();
    }
}
