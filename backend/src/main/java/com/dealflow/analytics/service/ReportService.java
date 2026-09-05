package com.dealflow.analytics.service;

import com.dealflow.analytics.dto.ReportQuery;
import com.dealflow.analytics.dto.ReportResultResponse;
import com.dealflow.analytics.dto.ReportRowResponse;
import com.dealflow.common.error.ApiException;
import com.dealflow.identity.model.AppUser;
import com.dealflow.identity.model.UserRole;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationState;
import com.dealflow.quotation.service.PricedQuotation;
import com.dealflow.quotation.service.PricingService;
import com.dealflow.quotation.service.QuotationMapper;
import com.dealflow.quotation.service.QuotationService;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A7. One query, four optional filters, and one object that drives both the table and the
 * export.
 *
 * <p>The predicates are appended only when present rather than written as
 * {@code (:repId is null or ...)}. The second form reads tidily and then defeats the query
 * planner, because a predicate that might be null cannot use an index -- and it needs
 * casts to keep Postgres from guessing at the type of a null parameter.
 */
@Service
public class ReportService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final int MONEY_SCALE = 2;

    private final EntityManager em;
    private final PricingService pricing;
    private final QuotationService quotations;

    public ReportService(EntityManager em, PricingService pricing, QuotationService quotations) {
        this.em = em;
        this.pricing = pricing;
        this.quotations = quotations;
    }

    @Transactional(readOnly = true)
    public ReportResultResponse run(ReportQuery query, long actorId) {
        requireManager(actorId);
        validate(query);

        List<ReportRowResponse> rows = new ArrayList<>();
        BigDecimal revenue = BigDecimal.ZERO;
        BigDecimal discountSum = BigDecimal.ZERO;
        BigDecimal marginSum = BigDecimal.ZERO;

        for (Quotation q : matching(query)) {
            PricedQuotation priced = pricing.price(q);
            rows.add(new ReportRowResponse(
                    q.getId(), q.ref(), q.getCustomer().getName(), q.getRep().getName(),
                    q.getState().name(), q.getOrderDiscountPct(), priced.subtotal(),
                    priced.marginPct(), q.getRiskScore(),
                    QuotationMapper.iso(q.getCreatedAt())));

            revenue = revenue.add(priced.subtotal());
            discountSum = discountSum.add(q.getOrderDiscountPct());
            marginSum = marginSum.add(priced.marginPct());
        }

        int count = rows.size();
        return new ReportResultResponse(rows,
                new ReportResultResponse.Totals(
                        count,
                        revenue.setScale(MONEY_SCALE, RoundingMode.HALF_UP),
                        average(discountSum, count),
                        average(marginSum, count)),
                query);
    }

    /** The single query. Every filter is optional; an empty one returns everything. */
    private List<Quotation> matching(ReportQuery query) {
        StringBuilder jpql = new StringBuilder("""
                select distinct q from Quotation q
                  join fetch q.customer c
                  join fetch c.tier
                  join fetch q.rep
                  left join fetch q.lines l
                  left join fetch l.product p
                  left join fetch p.category
                 where 1 = 1
                """);
        Map<String, Object> params = new LinkedHashMap<>();

        if (query.from() != null) {
            jpql.append(" and q.createdAt >= :from");
            params.put("from", date(query.from(), "from").atStartOfDay(ZoneOffset.UTC).toInstant());
        }
        if (query.to() != null) {
            // Inclusive: a report "to the 31st" that excluded the 31st would be a bug
            // nobody notices until a month-end total is short.
            jpql.append(" and q.createdAt < :to");
            params.put("to", date(query.to(), "to").plusDays(1)
                    .atStartOfDay(ZoneOffset.UTC).toInstant());
        }
        if (query.repId() != null) {
            jpql.append(" and q.rep.id = :repId");
            params.put("repId", query.repId());
        }
        if (query.status() != null) {
            jpql.append(" and q.state = :state");
            params.put("state", state(query.status()));
        }
        if (query.categoryId() != null) {
            // A quotation counts if any line is in that category -- the filter is about
            // what a deal contains, not what it consists entirely of.
            jpql.append(" and exists (select 1 from QuotationLine ql"
                    + " where ql.quotation = q and ql.product.category.id = :categoryId)");
            params.put("categoryId", query.categoryId());
        }
        jpql.append(" order by q.createdAt desc");

        TypedQuery<Quotation> q = em.createQuery(jpql.toString(), Quotation.class);
        params.forEach(q::setParameter);
        return q.getResultList();
    }

    // ---------- validation ----------

    private static void validate(ReportQuery query) {
        if (query.from() != null && query.to() != null
                && date(query.from(), "from").isAfter(date(query.to(), "to"))) {
            throw ApiException.invalid("The start of the period is after its end.", "from");
        }
    }

    private static LocalDate date(String iso, String field) {
        try {
            return LocalDate.parse(iso);
        } catch (DateTimeParseException ex) {
            throw ApiException.invalid("Use an ISO date such as 2026-01-31.", field);
        }
    }

    private static QuotationState state(String raw) {
        try {
            return QuotationState.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw ApiException.invalid("That is not a quotation stage.", "status");
        }
    }

    private void requireManager(long actorId) {
        AppUser actor = quotations.actor(actorId);
        if (actor.getRole() == UserRole.REP) {
            throw ApiException.forbidden(actor.getName()
                    + " is a rep. Reporting is for managers and finance.");
        }
    }

    private static BigDecimal average(BigDecimal sum, int count) {
        return count == 0
                ? BigDecimal.ZERO.setScale(MONEY_SCALE)
                : sum.divide(BigDecimal.valueOf(count), MONEY_SCALE, RoundingMode.HALF_UP);
    }
}
