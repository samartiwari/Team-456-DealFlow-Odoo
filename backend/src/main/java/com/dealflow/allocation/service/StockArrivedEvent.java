package com.dealflow.allocation.service;

/** Published when a stock receipt lands, so waiting plans can be flagged for consolidation. */
public record StockArrivedEvent(long warehouseId, long productId, int quantity) {}
