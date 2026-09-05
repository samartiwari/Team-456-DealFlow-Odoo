package com.dealflow.analytics.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * @param query the filters echoed back, so the screen can show what it actually asked for
 *              and an export can be held against it
 */
public record ReportResultResponse(List<ReportRowResponse> rows, Totals totals, ReportQuery query) {

    public record Totals(int count, BigDecimal revenue,
                         BigDecimal averageDiscountPct, BigDecimal averageMarginPct) {}
}
