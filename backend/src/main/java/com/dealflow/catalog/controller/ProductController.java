package com.dealflow.catalog.controller;

import com.dealflow.catalog.dto.ProductDetailResponse;
import com.dealflow.catalog.dto.ProductResponse;
import com.dealflow.catalog.dto.ProductVariantResponse;
import com.dealflow.catalog.model.Product;
import com.dealflow.catalog.repository.ProductRepository;
import com.dealflow.catalog.repository.ProductVariantRepository;
import com.dealflow.common.error.ApiException;

import java.util.List;


import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductRepository products;
    private final ProductVariantRepository variants;

    public ProductController(ProductRepository products, ProductVariantRepository variants) {
        this.products = products;
        this.variants = variants;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<ProductResponse> list() {
        // Archived products are out of the picker. Detail still resolves, because lines
        // that already reference one have to keep rendering.
        return products.findByArchivedFalseOrderById().stream()
                .map(p -> new ProductResponse(
                        p.getId(),
                        p.getName(),
                        p.getCategory().getName(),
                        p.getUnitPrice(),
                        p.getCategory().getCeilingPct(),
                        p.getCategory().isStockable(),
                        p.getCategory().isRecurring()))
                .toList();
    }

    /**
     * One product with the shapes it comes in.
     *
     * <p>Variants live here rather than on the list: the picker needs a flat catalog, and
     * loading every variant of every product to render a dropdown would be wasteful.
     */
    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public ProductDetailResponse detail(@PathVariable long id) {
        Product product = products.findById(id)
                .orElseThrow(() -> ApiException.notFound("Product", id));

        return new ProductDetailResponse(
                product.getId(),
                product.getName(),
                product.getCategory().getName(),
                product.getUnitPrice(),
                product.getCategory().getCeilingPct(),
                product.getCategory().isStockable(),
                product.getCategory().isRecurring(),
                variants.findByProductIdOrderById(id).stream()
                        .map(v -> new ProductVariantResponse(v.getId(), v.getName(), v.getUnitPrice()))
                        .toList());
    }
}
