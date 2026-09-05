package com.dealflow.quotation.service;

import com.dealflow.domain.risk.RiskAssessment;
import com.dealflow.quotation.model.Quotation;

import java.math.BigDecimal;
import java.util.List;


public record PricedQuotation(
        Quotation quotation,
        List<PricedLine> lines,
        BigDecimal subtotal,
        /** Total unit cost. Never leaves the server as-is; the upsell panel needs it to
         *  work out what a candidate would do to the order's margin. */
        BigDecimal totalCost,
        BigDecimal marginPct,
        RiskAssessment risk
) {}
