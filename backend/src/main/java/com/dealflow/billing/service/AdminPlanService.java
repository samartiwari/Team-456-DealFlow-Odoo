package com.dealflow.billing.service;

import com.dealflow.billing.dto.PlanBody;
import com.dealflow.billing.dto.SubscriptionPlanResponse;
import com.dealflow.billing.model.*;
import com.dealflow.billing.repository.SubscriptionPlanRepository;
import com.dealflow.catalog.model.Product;
import com.dealflow.catalog.repository.ProductRepository;
import com.dealflow.common.error.ApiException;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A5. Plan setup.
 *
 * <p>What this screen edits used to be three constants in {@code BillingService}. Changing
 * one here changes what the next period, the next quantity change and the next cancellation
 * actually do -- so a plan is a live setting, not a label.
 */
@Service
public class AdminPlanService {

    private final SubscriptionPlanRepository plans;
    private final ProductRepository products;

    public AdminPlanService(SubscriptionPlanRepository plans, ProductRepository products) {
        this.plans = plans;
        this.products = products;
    }

    @Transactional(readOnly = true)
    public List<SubscriptionPlanResponse> list() {
        return plans.findAllForEditing().stream().map(AdminPlanService::toResponse).toList();
    }

    @Transactional
    public SubscriptionPlanResponse create(PlanBody body) {
        SubscriptionPlan plan = new SubscriptionPlan();
        plan.setName(required(body.name()));
        plan.setProduct(recurringProduct(requiredId(body.productId())));
        plan.setInterval(parse(BillingInterval.class, body.interval(), "interval",
                BillingInterval.MONTHLY));
        plan.setProrationPolicy(parse(ProrationPolicy.class, body.prorationPolicy(),
                "prorationPolicy", ProrationPolicy.PRORATE));
        plan.setCancellationPolicy(parse(CancellationPolicy.class, body.cancellationPolicy(),
                "cancellationPolicy", CancellationPolicy.IMMEDIATE_WITH_CREDIT));
        plan.setActive(body.active() == null || body.active());
        checkOneActivePlanPerProduct(plan);
        return toResponse(plans.save(plan));
    }

    @Transactional
    public SubscriptionPlanResponse update(long id, PlanBody body) {
        SubscriptionPlan plan = load(id);
        if (body.name() != null) {
            plan.setName(required(body.name()));
        }
        if (body.productId() != null) {
            plan.setProduct(recurringProduct(body.productId()));
        }
        if (body.interval() != null) {
            plan.setInterval(parse(BillingInterval.class, body.interval(), "interval", null));
        }
        if (body.prorationPolicy() != null) {
            plan.setProrationPolicy(parse(ProrationPolicy.class, body.prorationPolicy(),
                    "prorationPolicy", null));
        }
        if (body.cancellationPolicy() != null) {
            plan.setCancellationPolicy(parse(CancellationPolicy.class, body.cancellationPolicy(),
                    "cancellationPolicy", null));
        }
        if (body.active() != null) {
            plan.setActive(body.active());
        }
        checkOneActivePlanPerProduct(plan);
        return toResponse(plans.save(plan));
    }

    /**
     * A real delete: nothing historical points at a plan.
     *
     * <p>Subscriptions already running keep their schedule, because the periods were written
     * when the subscription was created. What they lose is the policy behind the next
     * change or cancellation, which falls back to the built-in default.
     */
    @Transactional
    public void delete(long id) {
        plans.delete(load(id));
    }

    private SubscriptionPlan load(long id) {
        return plans.findById(id).orElseThrow(() -> ApiException.notFound("Plan", id));
    }

    /**
     * A plan only means something on a product that bills again next period. Attaching one
     * to a laptop would produce a setting that silently never applies.
     */
    private Product recurringProduct(long productId) {
        Product product = products.findById(productId)
                .orElseThrow(() -> ApiException.notFound("Product", productId));
        if (!product.getCategory().isRecurring()) {
            throw ApiException.invalid(product.getName()
                    + " is not a recurring product, so it cannot have a billing plan.",
                    "productId");
        }
        return product;
    }

    private void checkOneActivePlanPerProduct(SubscriptionPlan candidate) {
        if (!candidate.isActive()) {
            return;
        }
        plans.findByProductIdAndActiveTrue(candidate.getProduct().getId())
                .filter(existing -> !existing.getId().equals(candidate.getId()))
                .ifPresent(existing -> {
                    throw ApiException.conflict(existing.getName()
                            + " is already the active plan for this product. Deactivate it first.");
                });
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String value, String field,
                                               E fallback) {
        if (value == null) {
            return fallback;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.invalid(
                    value + " is not a " + field + ". Expected one of "
                            + String.join(", ", java.util.Arrays.stream(type.getEnumConstants())
                            .map(Enum::name).toList()) + ".",
                    field);
        }
    }

    private static String required(String name) {
        if (name == null || name.isBlank()) {
            throw ApiException.invalid("name is required.", "name");
        }
        return name.trim();
    }

    private static long requiredId(Long value) {
        if (value == null) {
            throw ApiException.invalid("productId is required.", "productId");
        }
        return value;
    }

    private static SubscriptionPlanResponse toResponse(SubscriptionPlan p) {
        return new SubscriptionPlanResponse(
                p.getId(), p.getName(), p.getProduct().getId(), p.getProduct().getName(),
                p.getInterval().name(), p.getProrationPolicy().name(),
                p.getCancellationPolicy().name(), p.isActive());
    }
}
