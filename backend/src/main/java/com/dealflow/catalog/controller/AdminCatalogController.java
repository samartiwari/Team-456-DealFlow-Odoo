package com.dealflow.catalog.controller;

import com.dealflow.catalog.dto.*;
import com.dealflow.catalog.service.AdminCatalogService;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Mockup screens 16 and 17, plus the price list editor.
 *
 * <p>Everything is under {@code /api/admin}, which is gated as a whole in
 * {@code SecurityConfig} rather than endpoint by endpoint -- one rule for the entire
 * configuration area, so a new endpoint added here cannot ship ungated by omission.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminCatalogController {

    private final AdminCatalogService admin;

    public AdminCatalogController(AdminCatalogService admin) {
        this.admin = admin;
    }

    @GetMapping("/products")
    public List<AdminProductResponse> products() {
        return admin.listProducts();
    }

    @PostMapping("/products")
    public AdminProductResponse createProduct(@RequestBody ProductBody body) {
        return admin.createProduct(body);
    }

    @PatchMapping("/products/{id}")
    public AdminProductResponse updateProduct(@PathVariable long id,
                                              @RequestBody ProductBody body) {
        return admin.updateProduct(id, body);
    }

    /** Archives. The row stays, and everything already pointing at it still resolves. */
    @DeleteMapping("/products/{id}")
    public ResponseEntity<Void> archiveProduct(@PathVariable long id) {
        admin.archiveProduct(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/products/{id}/restore")
    public AdminProductResponse restoreProduct(@PathVariable long id) {
        return admin.restoreProduct(id);
    }

    /** What a price change would move, for the warning shown before it is saved. */
    @GetMapping("/products/{id}/impact")
    public ProductImpactResponse impact(@PathVariable long id) {
        return admin.impact(id);
    }

    // Variant writes return the refreshed parent, so one call repaints the detail screen.

    @PostMapping("/products/{productId}/variants")
    public AdminProductResponse addVariant(@PathVariable long productId,
                                           @RequestBody VariantBody body) {
        return admin.addVariant(productId, body);
    }

    @PatchMapping("/variants/{variantId}")
    public AdminProductResponse updateVariant(@PathVariable long variantId,
                                              @RequestBody VariantBody body) {
        return admin.updateVariant(variantId, body);
    }

    @DeleteMapping("/variants/{variantId}")
    public AdminProductResponse deleteVariant(@PathVariable long variantId) {
        return admin.deleteVariant(variantId);
    }

    @GetMapping("/categories")
    public List<CategoryResponse> categories() {
        return admin.listCategories();
    }

    @PatchMapping("/categories/{id}")
    public CategoryResponse updateCategory(@PathVariable long id,
                                           @RequestBody CategoryBody body) {
        return admin.updateCategory(id, body);
    }

    @GetMapping("/price-lists")
    public List<AdminPriceListResponse> priceLists() {
        return admin.listPriceLists();
    }

    @PostMapping("/price-lists")
    public AdminPriceListResponse createPriceList(@RequestBody PriceListBody body) {
        return admin.createPriceList(body);
    }

    @PatchMapping("/price-lists/{id}")
    public AdminPriceListResponse updatePriceList(@PathVariable long id,
                                                  @RequestBody PriceListBody body) {
        return admin.updatePriceList(id, body);
    }

    @DeleteMapping("/price-lists/{id}")
    public ResponseEntity<Void> archivePriceList(@PathVariable long id) {
        admin.archivePriceList(id);
        return ResponseEntity.noContent().build();
    }

    /** Comes back inactive -- the tier may have another live list by now. */
    @PostMapping("/price-lists/{id}/restore")
    public AdminPriceListResponse restorePriceList(@PathVariable long id) {
        return admin.restorePriceList(id);
    }

    @PutMapping("/price-lists/{listId}/items/{productId}")
    public AdminPriceListResponse setPrice(@PathVariable long listId,
                                           @PathVariable long productId,
                                           @RequestBody PriceListItemBody body) {
        return admin.setPrice(listId, productId, body);
    }

    @DeleteMapping("/price-lists/{listId}/items/{productId}")
    public AdminPriceListResponse removePrice(@PathVariable long listId,
                                              @PathVariable long productId) {
        return admin.removePrice(listId, productId);
    }
}
