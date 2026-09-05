package com.dealflow.quotation.controller;

import com.dealflow.quotation.dto.AddLineRequest;
import com.dealflow.quotation.dto.ConfirmResponse;
import com.dealflow.quotation.dto.CreateQuotationRequest;
import com.dealflow.quotation.dto.QuotationSummaryResponse;
import com.dealflow.quotation.dto.RecomputeResponse;
import com.dealflow.quotation.dto.UpdateLineRequest;
import com.dealflow.quotation.dto.UpdateQuotationRequest;
import com.dealflow.quotation.service.QuotationService;

import java.util.List;


import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.*;

/**
 * The actor arrives as {@code ?userId=} for now -- a stub, but in the right shape, so
 * real authentication swaps the source without touching a call site.
 */
@RestController
@RequestMapping("/api/quotations")
public class QuotationController {

    private final QuotationService service;

    public QuotationController(QuotationService service) {
        this.service = service;
    }

    @GetMapping
    public List<QuotationSummaryResponse> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public RecomputeResponse get(@PathVariable long id) {
        return service.recompute(id);
    }

    @PostMapping
    public RecomputeResponse create(@Valid @RequestBody CreateQuotationRequest request,
                                    @RequestParam long userId) {
        return service.create(request.customerId(), userId);
    }

    @PostMapping("/{id}/recompute")
    public RecomputeResponse recompute(@PathVariable long id) {
        return service.recompute(id);
    }

    @PatchMapping("/{id}")
    public RecomputeResponse setOrderDiscount(@PathVariable long id,
                                              @Valid @RequestBody UpdateQuotationRequest request,
                                              @RequestParam long userId) {
        return service.setOrderDiscount(id, request.orderDiscountPct(), userId);
    }

    @PostMapping("/{id}/lines")
    public RecomputeResponse addLine(@PathVariable long id,
                                     @Valid @RequestBody AddLineRequest request,
                                     @RequestParam long userId) {
        return service.addLine(id, request, userId);
    }

    @PatchMapping("/{id}/lines/{lineId}")
    public RecomputeResponse updateLine(@PathVariable long id, @PathVariable long lineId,
                                        @Valid @RequestBody UpdateLineRequest request,
                                        @RequestParam long userId) {
        return service.updateLine(id, lineId, request, userId);
    }

    @DeleteMapping("/{id}/lines/{lineId}")
    public RecomputeResponse deleteLine(@PathVariable long id, @PathVariable long lineId,
                                        @RequestParam long userId) {
        return service.deleteLine(id, lineId, userId);
    }

    /** Routes for approval by itself when the score warrants it. */
    @PostMapping("/{id}/confirm")
    public ConfirmResponse confirm(@PathVariable long id, @RequestParam long userId) {
        return service.confirm(id, userId);
    }
}
