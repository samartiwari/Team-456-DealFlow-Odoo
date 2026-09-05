package com.dealflow.domain.allocation;

/** One product the order needs. */
public record DemandLine(long productId, int quantity) {}
