package com.dealflow.catalog.dto;

import java.util.List;

/**
 * What a tier is published at.
 *
 * @param tier null would mean a list for everyone; every seeded list names a tier
 */
public record PriceListResponse(long id, String name, String tier, boolean active,
                                List<PriceListItemResponse> items) {}
