package com.dealflow.allocation.controller;

import com.dealflow.allocation.dto.FulfilmentBoardResponse;
import com.dealflow.allocation.service.FulfilmentService;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** B6: live stock levels plus everything approved and waiting to ship. */
@RestController
@RequestMapping("/api/fulfilment")
public class FulfilmentController {

    private final FulfilmentService service;

    public FulfilmentController(FulfilmentService service) {
        this.service = service;
    }

    @GetMapping
    public FulfilmentBoardResponse board() {
        return service.board();
    }
}
