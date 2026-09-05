package com.dealflow.catalog.controller;

import com.dealflow.catalog.dto.PriceListItemResponse;
import com.dealflow.catalog.dto.PriceListResponse;
import com.dealflow.catalog.repository.PriceListRepository;

import java.util.List;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A2, read-only. Each item carries the base price alongside the listed one, so the screen
 * can show what a tier actually pays and what it would otherwise have paid.
 */
@RestController
@RequestMapping("/api/price-lists")
public class PriceListController {

    private final PriceListRepository priceLists;

    public PriceListController(PriceListRepository priceLists) {
        this.priceLists = priceLists;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<PriceListResponse> list() {
        return priceLists.findAllWithItems().stream()
                .map(l -> new PriceListResponse(
                        l.getId(),
                        l.getName(),
                        l.getTier() == null ? null : l.getTier().getName().toUpperCase(),
                        l.isActive(),
                        l.getItems().stream()
                                .map(i -> new PriceListItemResponse(
                                        i.getProduct().getId(),
                                        i.getProduct().getName(),
                                        i.getUnitPrice(),
                                        i.getProduct().getUnitPrice()))
                                .toList()))
                .toList();
    }
}
