package com.dealflow.policy.service;

import com.dealflow.catalog.model.ProductCategory;
import com.dealflow.catalog.repository.ProductCategoryRepository;
import com.dealflow.common.config.SystemConfigService;
import com.dealflow.common.error.ApiException;
import com.dealflow.crm.model.CustomerTier;
import com.dealflow.crm.repository.CustomerTierRepository;
import com.dealflow.domain.risk.RiskWeights;
import com.dealflow.identity.model.AppUser;
import com.dealflow.identity.model.UserRole;
import com.dealflow.identity.repository.AppUserRepository;
import com.dealflow.policy.dto.*;
import com.dealflow.policy.model.PolicyChange;
import com.dealflow.policy.repository.PolicyChangeRepository;
import com.dealflow.quotation.service.QuotationMapper;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The discount policy: tier ceilings, category ceilings and the approval bands.
 *
 * <p>These are the numbers the risk engine measures every quotation against, and
 * {@link SystemConfigService} re-reads them on each call -- so an edit here re-routes the
 * very next quotation with no redeploy, which is the point of the screen.
 */
@Service
public class DiscountPolicyService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final CustomerTierRepository tiers;
    private final ProductCategoryRepository categories;
    private final SystemConfigService config;
    private final PolicyChangeRepository changes;
    private final AppUserRepository users;

    public DiscountPolicyService(CustomerTierRepository tiers, ProductCategoryRepository categories,
                                 SystemConfigService config, PolicyChangeRepository changes,
                                 AppUserRepository users) {
        this.tiers = tiers;
        this.categories = categories;
        this.config = config;
        this.changes = changes;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public DiscountPolicyResponse read() {
        RiskWeights w = config.riskWeights();
        return new DiscountPolicyResponse(
                tiers.findAll().stream()
                        .sorted(java.util.Comparator.comparing(CustomerTier::getId))
                        .map(t -> new TierResponse(t.getId(), t.getName(), t.getCeilingPct()))
                        .toList(),
                categories.findAll().stream()
                        .sorted(java.util.Comparator.comparing(ProductCategory::getId))
                        .map(c -> new CategoryResponse(c.getId(), c.getName(), c.getCeilingPct(),
                                c.isStockable(), c.isRecurring()))
                        .toList(),
                new ApprovalPolicyResponse(
                        w.weighted(), w.max(), w.managerBandMin(), w.financeBandMin()),
                changes.findAllNewestFirst().stream()
                        .map(c -> new PolicyChangeResponse(
                                c.getId(),
                                c.getActor() == null ? null : c.getActor().getName(),
                                c.getSummary(),
                                QuotationMapper.iso(c.getCreatedAt())))
                        .toList());
    }

    /**
     * Applies an edit, or rejects the whole thing.
     *
     * <p>Every field is validated before a single value is written. The engine reads these
     * rows on every recompute, so a half-applied policy would price quotations against a
     * combination nobody chose.
     */
    @Transactional
    public DiscountPolicyResponse update(UpdatePolicyRequest request, long actorId) {
        AppUser actor = users.findById(actorId)
                .orElseThrow(() -> ApiException.notFound("User", actorId));

        // Ceilings and bands decide what needs approval, so changing them is a manager's call.
        if (!actor.getRole().canSetPolicy()) {
            throw ApiException.forbidden(actor.getName() + " is a "
                    + actor.getRole().name().toLowerCase()
                    + ". Only a sales manager can change the discount policy.");
        }

        /* ---- validate everything first ---- */

        List<TierEdit> tierEdits = new ArrayList<>();
        for (UpdatePolicyRequest.TierEdit edit : nullSafe(request.tiers())) {
            CustomerTier row = tiers.findById(requireId(edit.id(), "tiers"))
                    .orElseThrow(() -> ApiException.invalid(
                            "Tier " + edit.id() + " not found.", "tiers"));
            tierEdits.add(new TierEdit(row, percent(edit.ceilingPct(),
                    "The " + row.getName() + " ceiling", "tiers")));
        }

        List<CategoryEdit> categoryEdits = new ArrayList<>();
        for (UpdatePolicyRequest.CategoryEdit edit : nullSafe(request.categories())) {
            ProductCategory row = categories.findById(requireId(edit.id(), "categories"))
                    .orElseThrow(() -> ApiException.invalid(
                            "Category " + edit.id() + " not found.", "categories"));
            // null is meaningful here: it clears the ceiling and defers to the tier.
            BigDecimal next = edit.ceilingPct() == null ? null
                    : percent(edit.ceilingPct(), "The " + row.getName() + " ceiling", "categories");
            categoryEdits.add(new CategoryEdit(row, next));
        }

        RiskWeights current = config.riskWeights();
        RiskWeights next = merge(current, request.approval());
        validateApproval(next);

        /* ---- only now write ---- */

        List<String> summary = new ArrayList<>();

        for (TierEdit e : tierEdits) {
            if (same(e.row().getCeilingPct(), e.next())) {
                continue;
            }
            summary.add(e.row().getName() + " tier ceiling "
                    + pct(e.row().getCeilingPct()) + " to " + pct(e.next()));
            e.row().setCeilingPct(e.next());
            tiers.save(e.row());
        }

        for (CategoryEdit e : categoryEdits) {
            if (same(e.row().getCeilingPct(), e.next())) {
                continue;
            }
            summary.add(e.row().getName() + " category ceiling "
                    + pct(e.row().getCeilingPct()) + " to " + pct(e.next()));
            e.row().setCeilingPct(e.next());
            categories.save(e.row());
        }

        if (!same(current.weighted(), next.weighted())) {
            summary.add("Weighted overage weight " + plain(current.weighted())
                    + " to " + plain(next.weighted()));
        }
        if (!same(current.max(), next.max())) {
            summary.add("Worst line weight " + plain(current.max()) + " to " + plain(next.max()));
        }
        if (current.managerBandMin() != next.managerBandMin()) {
            summary.add("Manager band starts at " + current.managerBandMin()
                    + " to " + next.managerBandMin());
        }
        if (current.financeBandMin() != next.financeBandMin()) {
            summary.add("Finance band starts at " + current.financeBandMin()
                    + " to " + next.financeBandMin());
        }
        config.writeRiskWeights(next);

        // An edit that changes nothing is not logged -- the history is a record of changes,
        // not of who opened the screen.
        if (!summary.isEmpty()) {
            changes.save(new PolicyChange(actor, String.join(" / ", summary)));
        }

        return read();
    }

    // ---------- validation ----------

    private static void validateApproval(RiskWeights w) {
        percent(BigDecimal.valueOf(w.managerBandMin()), "The manager band", "managerBandMin");
        percent(BigDecimal.valueOf(w.financeBandMin()), "The finance band", "financeBandMin");
        if (w.managerBandMin() > w.financeBandMin()) {
            throw ApiException.invalid(
                    "The finance band cannot start below the manager band. "
                            + "Finance is the second step, not the first.", "financeBandMin");
        }
        percent(w.weighted(), "The weighted overage weight", "weightedWeight");
        percent(w.max(), "The worst line weight", "maxWeight");
        if (w.weighted().signum() == 0 && w.max().signum() == 0) {
            throw ApiException.invalid(
                    "Both weights cannot be zero. Every quotation would score 0 "
                            + "and nothing would ever need approval.", "weightedWeight");
        }
    }

    private static BigDecimal percent(BigDecimal value, String what, String field) {
        if (value == null) {
            throw ApiException.invalid(what + " is required.", field);
        }
        if (value.signum() < 0 || value.compareTo(HUNDRED) > 0) {
            throw ApiException.invalid(what + " must be between 0 and 100.", field);
        }
        return value;
    }

    private static long requireId(Long id, String field) {
        if (id == null) {
            throw ApiException.invalid("Each edit needs an id.", field);
        }
        return id;
    }

    // ---------- helpers ----------

    private static RiskWeights merge(RiskWeights current, UpdatePolicyRequest.ApprovalEdit edit) {
        if (edit == null) {
            return current;
        }
        return new RiskWeights(
                edit.weightedWeight() == null ? current.weighted() : edit.weightedWeight(),
                edit.maxWeight() == null ? current.max() : edit.maxWeight(),
                edit.managerBandMin() == null ? current.managerBandMin() : edit.managerBandMin(),
                edit.financeBandMin() == null ? current.financeBandMin() : edit.financeBandMin());
    }

    /** compareTo, not equals -- 15.00 and 15 are the same ceiling. */
    private static boolean same(BigDecimal a, BigDecimal b) {
        if (a == null || b == null) {
            return a == b;
        }
        return a.compareTo(b) == 0;
    }

    private static String pct(BigDecimal value) {
        return value == null ? "tier ceiling" : plain(value) + "%";
    }

    private static String plain(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }

    private record TierEdit(CustomerTier row, BigDecimal next) {}

    private record CategoryEdit(ProductCategory row, BigDecimal next) {}
}
