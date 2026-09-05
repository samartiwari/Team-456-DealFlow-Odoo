package com.dealflow.quotation.service;

import com.dealflow.domain.risk.RiskAssessment;
import com.dealflow.quotation.model.Quotation;

import java.math.BigDecimal;
import java.util.List;


public record PricedQuotation(
        Quotation quotation,
        List<PricedLine> lines,
        BigDecimal subtotal,
        BigDecimal marginPct,
        RiskAssessment risk
) {}
