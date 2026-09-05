package com.dealflow.catalog.dto;

import java.math.BigDecimal;

/** @param basePrice what the product costs without this list, for comparison on screen */
public record PriceListItemResponse(long productId, String productName,
                                    BigDecimal unitPrice, BigDecimal basePrice) {}
