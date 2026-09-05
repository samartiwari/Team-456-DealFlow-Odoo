package com.dealflow.catalog.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * One product with the shapes it comes in.
 *
 * <p>{@code unitCost} is deliberately absent, as it is on the list. The variants carry
 * their own prices rather than deltas.
 */
public record ProductDetailResponse(
        long id,
        String name,
        String category,
        BigDecimal unitPrice,
        BigDecimal categoryCeilingPct,
        boolean stockable,
        boolean recurring,
        List<ProductVariantResponse> variants
) {}
