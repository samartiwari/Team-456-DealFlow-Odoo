package com.dealflow.upsell.controller;

import com.dealflow.upsell.dto.SuggestionResponse;
import com.dealflow.upsell.service.SuggestionService;

import java.util.List;

import org.springframework.web.bind.annotation.*;

/** B5: the upsell panel beside the cart. */
@RestController
@RequestMapping("/api/quotations/{quotationId}/suggestions")
public class SuggestionController {

    private final SuggestionService service;

    public SuggestionController(SuggestionService service) {
        this.service = service;
    }

    @GetMapping
    public List<SuggestionResponse> suggest(@PathVariable long quotationId) {
        return service.suggest(quotationId);
    }

    /** Hides one card for this quotation and answers with what is left. */
    @DeleteMapping("/{productId}")
    public List<SuggestionResponse> dismiss(@PathVariable long quotationId,
                                            @PathVariable long productId) {
        return service.dismiss(quotationId, productId);
    }
}
