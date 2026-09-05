package com.dealflow.upsell.service;

import com.dealflow.allocation.model.StockItem;
import com.dealflow.allocation.repository.StockItemRepository;
import com.dealflow.catalog.model.Product;
import com.dealflow.catalog.repository.ProductRepository;
import com.dealflow.common.error.ApiException;
import com.dealflow.domain.upsell.Candidate;
import com.dealflow.domain.upsell.OrderSnapshot;
import com.dealflow.domain.upsell.RankedSuggestion;
import com.dealflow.domain.upsell.SuggestionRanker;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationLine;
import com.dealflow.quotation.service.PricedQuotation;
import com.dealflow.quotation.service.PricingService;
import com.dealflow.quotation.service.QuotationService;
import com.dealflow.upsell.dto.SuggestionResponse;
import com.dealflow.upsell.model.QuotationDismissal;
import com.dealflow.upsell.model.UpsellRule;
import com.dealflow.upsell.repository.QuotationDismissalRepository;
import com.dealflow.upsell.repository.UpsellRuleRepository;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What else belongs on this order (B5).
 *
 * <p>Computed on demand and stored nowhere. The only thing persisted is a dismissal, which
 * is a decision the rep made rather than a number that could be recalculated.
 */
@Service
public class SuggestionService {

    private final QuotationService quotationService;
    private final PricingService pricing;
    private final UpsellRuleRepository rules;
    private final QuotationDismissalRepository dismissals;
    private final StockItemRepository stock;
    private final ProductRepository products;
    private final SuggestionRanker ranker = new SuggestionRanker();

    public SuggestionService(QuotationService quotationService, PricingService pricing,
                             UpsellRuleRepository rules, QuotationDismissalRepository dismissals,
                             StockItemRepository stock, ProductRepository products) {
        this.quotationService = quotationService;
        this.pricing = pricing;
        this.rules = rules;
        this.dismissals = dismissals;
        this.stock = stock;
        this.products = products;
    }

    @Transactional(readOnly = true)
    public List<SuggestionResponse> suggest(long quotationId) {
        Quotation quotation = quotationService.load(quotationId);

        // Adding a line to a quotation that has left the rep's hands is a 409, so a card
        // here would be a dead end. Nothing to offer rather than something unusable.
        if (!quotation.getState().isEditable()) {
            return List.of();
        }

        Set<Long> inCart = new LinkedHashSet<>();
        for (QuotationLine line : quotation.getLines()) {
            inCart.add(line.getProduct().getId());
        }
        if (inCart.isEmpty()) {
            return List.of();
        }

        // The strongest rule wins per candidate: the same product can be paired from two
        // different lines, and being promoted by either is enough to be promoted here.
        Map<Long, UpsellRule> best = new LinkedHashMap<>();
        for (UpsellRule rule : rules.findTriggeredBy(inCart)) {
            best.merge(rule.getSuggested().getId(), rule,
                    (a, b) -> a.isPromoted() || !b.isPromoted() ? a : b);
        }
        if (best.isEmpty()) {
            return List.of();
        }

        Set<Long> dismissed = Set.copyOf(dismissals.findProductIdsFor(quotationId));
        Map<Long, Integer> onHand = availableByProduct();

        PricedQuotation priced = pricing.price(quotation);
        OrderSnapshot order = new OrderSnapshot(
                priced.subtotal(), priced.totalCost(), quotation.getOrderDiscountPct());

        List<Candidate> candidates = best.values().stream()
                .map(rule -> toCandidate(rule, inCart, dismissed, onHand))
                .toList();

        Map<Long, Product> byId = new LinkedHashMap<>();
        best.values().forEach(r -> byId.put(r.getSuggested().getId(), r.getSuggested()));

        return ranker.rank(order, candidates).stream()
                .map(r -> toResponse(r, byId.get(r.productId())))
                .toList();
    }

    /** Idempotent: dismissing something already dismissed is not an error. */
    @Transactional
    public List<SuggestionResponse> dismiss(long quotationId, long productId) {
        Quotation quotation = quotationService.load(quotationId);
        Product product = products.findById(productId)
                .orElseThrow(() -> ApiException.notFound("Product", productId));

        if (dismissals.findByQuotationIdAndProductId(quotationId, productId).isEmpty()) {
            dismissals.save(new QuotationDismissal(quotation, product));
        }
        return suggest(quotationId);
    }

    private static Candidate toCandidate(UpsellRule rule, Set<Long> inCart,
                                         Set<Long> dismissed, Map<Long, Integer> onHand) {
        Product p = rule.getSuggested();
        // Services and subscriptions hold no stock, so stock can never rule them out.
        boolean unavailable = p.getCategory().isStockable()
                && onHand.getOrDefault(p.getId(), 0) <= 0;

        return new Candidate(
                p.getId(),
                p.getUnitPrice(),
                p.getUnitCost(),
                java.math.BigDecimal.ONE,   // admin-authored; mined confidence arrives below this
                rule.isPromoted(),
                rule.getMinMarginPct(),
                inCart.contains(p.getId()),
                dismissed.contains(p.getId()),
                unavailable);
    }

    private static SuggestionResponse toResponse(RankedSuggestion ranked, Product product) {
        return new SuggestionResponse(
                product.getId(),
                product.getName(),
                product.getCategory().getName(),
                product.getUnitPrice(),
                ranked.score(),
                ranked.marginDeltaPt(),
                ranked.promoted());
    }

    /** Free units across every warehouse, which is what a new line could actually draw on. */
    private Map<Long, Integer> availableByProduct() {
        Map<Long, Integer> byProduct = new LinkedHashMap<>();
        for (StockItem item : stock.findAllWithRefs()) {
            byProduct.merge(item.getProduct().getId(), item.getQuantity(), Integer::sum);
        }
        return byProduct;
    }
}
