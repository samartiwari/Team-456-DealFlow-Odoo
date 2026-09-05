package com.dealflow.allocation.dto;

import java.math.BigDecimal;
import java.util.List;

/** An approved quotation as the fulfilment queue shows it. */
public record FulfilmentOrderResponse(
        long quotationId,
        String ref,
        String customerName,
        /** AWAITING_SPLIT | SPLIT_ACCEPTED | BACKORDER */
        String status,
        /** Empty until a split is accepted. */
        List<String> warehouseNames,
        int backorderedUnits,
        BigDecimal grandTotal,
        String currency
) {}
