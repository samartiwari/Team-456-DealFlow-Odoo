package com.dealflow.quotation;

import java.math.BigDecimal;
import java.util.List;

import com.dealflow.domain.risk.RiskAssessment;

public record PricedQuotation(
        Quotation quotation,
        List<PricedLine> lines,
        BigDecimal subtotal,
        BigDecimal marginPct,
        RiskAssessment risk
) {}
