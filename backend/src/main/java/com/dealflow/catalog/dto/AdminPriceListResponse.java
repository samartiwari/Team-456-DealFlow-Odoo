package com.dealflow.catalog.dto;

import java.util.List;

/** Adds the tier id the editor needs, and the archived flag, to {@link PriceListResponse}. */
public record AdminPriceListResponse(long id, String name, Long tierId, String tierName,
                                     boolean active, boolean archived,
                                     List<PriceListItemResponse> items) {}
