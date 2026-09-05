package com.dealflow.allocation.dto;

import java.util.List;

/** The stock list and the orders queue in one call -- they are one screen. */
public record FulfilmentBoardResponse(List<StockRowResponse> stock, List<FulfilmentOrderResponse> orders) {}
