package com.dealflow.upsell.service;

import com.dealflow.catalog.model.Product;
import com.dealflow.catalog.repository.ProductRepository;
import com.dealflow.common.error.ApiException;
import com.dealflow.upsell.dto.AdminUpsellRuleResponse;
import com.dealflow.upsell.dto.UpsellRuleBody;
import com.dealflow.upsell.model.UpsellRule;
import com.dealflow.upsell.repository.UpsellRuleRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A6. Rule setup.
 *
 * <p>The two fields here are the two the ranker actually reads: {@code promoted} is 30% of
 * a suggestion's score, and {@code minMarginPct} withholds a suggestion whose margin would
 * fall below it. Editing either changes what the next quotation is offered.
 */
@Service
public class AdminUpsellRuleService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final UpsellRuleRepository rules;
    private final ProductRepository products;

    public AdminUpsellRuleService(UpsellRuleRepository rules, ProductRepository products) {
        this.rules = rules;
        this.products = products;
    }

    @Transactional(readOnly = true)
    public List<AdminUpsellRuleResponse> list() {
        return rules.findAllForEditing().stream().map(AdminUpsellRuleService::toResponse).toList();
    }

    @Transactional
    public AdminUpsellRuleResponse create(UpsellRuleBody body) {
        UpsellRule rule = new UpsellRule();
        rule.setTrigger(product(requiredId(body.triggerProductId(), "triggerProductId")));
        rule.setSuggested(product(requiredId(body.suggestedProductId(), "suggestedProductId")));
        rule.setMinMarginPct(percent(body.minMarginPct() == null
                ? BigDecimal.ZERO : body.minMarginPct()));
        rule.setPromoted(Boolean.TRUE.equals(body.promoted()));
        validate(rule, null);
        return toResponse(rules.save(rule));
    }

    @Transactional
    public AdminUpsellRuleResponse update(long id, UpsellRuleBody body) {
        UpsellRule rule = load(id);
        if (body.triggerProductId() != null) {
            rule.setTrigger(product(body.triggerProductId()));
        }
        if (body.suggestedProductId() != null) {
            rule.setSuggested(product(body.suggestedProductId()));
        }
        if (body.minMarginPct() != null) {
            rule.setMinMarginPct(percent(body.minMarginPct()));
        }
        if (body.promoted() != null) {
            rule.setPromoted(body.promoted());
        }
        validate(rule, id);
        return toResponse(rules.save(rule));
    }

    @Transactional
    public void delete(long id) {
        rules.delete(load(id));
    }

    private void validate(UpsellRule rule, Long selfId) {
        if (rule.getTrigger().getId().equals(rule.getSuggested().getId())) {
            throw ApiException.invalid(
                    "A product cannot suggest itself.", "suggestedProductId");
        }
        // One pairing, one rule. Two would double-count the same product in the ranker and
        // let the weaker of the pair decide whether it is shown.
        boolean duplicate = rules.findAllForEditing().stream()
                .anyMatch(r -> !r.getId().equals(selfId)
                        && r.getTrigger().getId().equals(rule.getTrigger().getId())
                        && r.getSuggested().getId().equals(rule.getSuggested().getId()));
        if (duplicate) {
            throw ApiException.conflict(rule.getTrigger().getName() + " already suggests "
                    + rule.getSuggested().getName() + ". Edit that rule instead.");
        }
    }

    private UpsellRule load(long id) {
        return rules.findById(id).orElseThrow(() -> ApiException.notFound("Upsell rule", id));
    }

    private Product product(long id) {
        return products.findById(id).orElseThrow(() -> ApiException.notFound("Product", id));
    }

    private static long requiredId(Long value, String field) {
        if (value == null) {
            throw ApiException.invalid(field + " is required.", field);
        }
        return value;
    }

    private static BigDecimal percent(BigDecimal value) {
        if (value.signum() < 0 || value.compareTo(HUNDRED) > 0) {
            throw ApiException.invalid("minMarginPct must be between 0 and 100.",
                    "minMarginPct");
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static AdminUpsellRuleResponse toResponse(UpsellRule r) {
        return new AdminUpsellRuleResponse(
                r.getId(),
                r.getTrigger().getId(), r.getTrigger().getName(),
                r.getSuggested().getId(), r.getSuggested().getName(),
                r.getMinMarginPct(), r.isPromoted());
    }
}
