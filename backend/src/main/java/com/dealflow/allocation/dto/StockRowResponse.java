package com.dealflow.allocation.dto;

/**
 * One warehouse-and-product pair, as the stock list shows it.
 *
 * <p>{@code stock_item.quantity} holds what is <em>free</em>, because accepting a plan draws it
 * down. So {@code available} is that column, {@code reserved} is what accepted plans still hold,
 * and {@code onHand} -- what is physically on the shelf -- is the two added back together.
 */
public record StockRowResponse(
        long warehouseId,
        String warehouseName,
        long productId,
        String productName,
        int onHand,
        int reserved,
        int available
) {}
