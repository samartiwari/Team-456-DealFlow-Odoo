package com.dealflow.quotation.service;

import com.dealflow.approval.dto.AuditResponse;
import com.dealflow.common.audit.AuditEvent;
import com.dealflow.domain.risk.LineRisk;
import com.dealflow.quotation.dto.LineResponse;
import com.dealflow.quotation.dto.QuotationSummaryResponse;
import com.dealflow.quotation.dto.RecomputeResponse;
import com.dealflow.quotation.model.Quotation;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;


import org.springframework.stereotype.Component;

@Component
public class QuotationMapper {

    /** Single-currency in this slice; price lists and FX arrive later. */
    public static final String CURRENCY = "INR";

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    public RecomputeResponse toRecompute(PricedQuotation priced) {
        Quotation q = priced.quotation();

        Map<Long, LineRisk> riskByLine = priced.risk().lines().stream()
                .collect(Collectors.toMap(LineRisk::lineId, Function.identity()));

        List<LineResponse> lines = priced.lines().stream()
                .map(line -> toLine(line, riskByLine.get(line.lineId())))
                .toList();

        return new RecomputeResponse(
                q.getId(),
                q.ref(),
                q.getCustomer().getId(),
                q.getCustomer().getName(),
                q.getCustomer().getTier().getName().toUpperCase(),
                q.getState().name(),
                CURRENCY,
                q.getOrderDiscountPct(),
                lines,
                priced.subtotal(),
                priced.subtotal(),   // no tax in this slice, so grandTotal tracks subtotal
                priced.marginPct(),
                priced.risk().score(),
                priced.risk().requiredChain());
    }

    private LineResponse toLine(PricedLine line, LineRisk risk) {
        return new LineResponse(
                line.lineId(),
                line.productName(),
                line.category(),
                line.quantity(),
                line.unitPrice(),
                line.lineDiscountPct(),
                line.effectiveDiscountPct(),
                risk == null ? BigDecimal.ZERO : risk.allowedPct(),
                risk == null ? BigDecimal.ZERO : risk.overagePct(),
                risk == null ? BigDecimal.ZERO
                        : risk.weight().multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP),
                line.netTotal());
    }

    public QuotationSummaryResponse toSummary(PricedQuotation priced) {
        Quotation q = priced.quotation();
        return new QuotationSummaryResponse(
                q.getId(), q.ref(), q.getCustomer().getName(),
                q.getState().name(), priced.subtotal(), CURRENCY);
    }

    public AuditResponse toAudit(AuditEvent e) {
        return new AuditResponse(
                e.getId(),
                e.getAction(),
                e.getFromState(),
                e.getToState(),
                e.getActor() == null ? null : e.getActor().getName(),
                e.getReason(),
                iso(e.getCreatedAt()));
    }

    public static String iso(Instant instant) {
        return instant == null ? null : instant.toString();
    }
}
