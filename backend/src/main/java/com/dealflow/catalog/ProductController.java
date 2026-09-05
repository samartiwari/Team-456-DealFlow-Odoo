package com.dealflow.catalog;

import com.dealflow.catalog.dto.ProductResponse;
import com.dealflow.catalog.repository.ProductRepository;
import java.util.List;


import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductRepository products;

    public ProductController(ProductRepository products) {
        this.products = products;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<ProductResponse> list() {
        return products.findAll().stream()
                .map(p -> new ProductResponse(
                        p.getId(),
                        p.getName(),
                        p.getCategory().getName(),
                        p.getUnitPrice(),
                        p.getCategory().getCeilingPct()))
                .toList();
    }
}
