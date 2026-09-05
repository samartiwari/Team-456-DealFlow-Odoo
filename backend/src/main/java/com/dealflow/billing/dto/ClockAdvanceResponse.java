package com.dealflow.billing.dto;

import java.util.List;

/** What the admin "advance clock" action did. Zero periods is a valid answer. */
public record ClockAdvanceResponse(String billingDate, int periodsBilled, List<Long> invoiceIds) {}
