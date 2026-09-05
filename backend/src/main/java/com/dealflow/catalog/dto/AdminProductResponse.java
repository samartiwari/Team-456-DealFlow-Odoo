package com.dealflow.catalog.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * A product as an administrator sees it.
 *
 * <p>The difference from {@link ProductResponse} is {@code unitCost}, and it is the reason
 * this is a separate shape rather than a field added to the existing one. Cost is what
 * margin is computed from and it does not leave the server on any rep-facing endpoint; it
 * leaves here because a product cannot be edited without it. Keeping the two records
 * distinct means the rep-facing one cannot grow a cost field by accident.
 *
 * @param marginPct derived, so the edit form can warn before a thin price is saved
 */
public record AdminProductResponse(
        long id,
        String name,
        long categoryId,
        String categoryName,
        BigDecimal unitPrice,
        BigDecimal unitCost,
        BigDecimal marginPct,
        boolean stockable,
        boolean recurring,
        boolean archived,
        List<AdminVariantResponse> variants
) {}
