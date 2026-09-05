package com.dealflow.quotation.service;

import com.dealflow.catalog.model.Product;
import com.dealflow.catalog.model.PriceList;
import com.dealflow.catalog.model.PriceListItem;
import com.dealflow.catalog.repository.PriceListRepository;
import com.dealflow.common.config.SystemConfigService;
import com.dealflow.domain.pricing.MarginCalculator;
import com.dealflow.domain.pricing.PriceResolver;
import com.dealflow.domain.pricing.ResolvedPrice;
import com.dealflow.domain.risk.BlendedRiskEngine;
import com.dealflow.domain.risk.LineInput;
import com.dealflow.domain.risk.RiskAssessment;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationLine;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;


import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The only place money is computed. The client never multiplies a price by a quantity;
 * it renders exactly what this produces.
 */
@Service
public class PricingService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final int MONEY_SCALE = 2;

    /** Intermediate scale -- money is only rounded when it is persisted or displayed. */
    private static final int WORKING_SCALE = 8;

    private final SystemConfigService configService;
    private final PriceListRepository priceLists;
    private final BlendedRiskEngine riskEngine = new BlendedRiskEngine();
    private final PriceResolver priceResolver = new PriceResolver();

    public PricingService(SystemConfigService configService, PriceListRepository priceLists) {
        this.configService = configService;
        this.priceLists = priceLists;
    }

    @Transactional(readOnly = true)
    public PricedQuotation price(Quotation quotation) {
        BigDecimal orderDiscount = quotation.getOrderDiscountPct();
        BigDecimal tierCeiling = quotation.getCustomer().getTier().getCeilingPct();

        // What this customer's tier is published at, read once for the whole quotation
        // rather than per line. A tier with no list simply resolves to the base price.
        List<PriceResolver.ListedPrice> listed = listedPricesFor(quotation);

        List<PricedLine> priced = new ArrayList<>();
        List<LineInput> riskInputs = new ArrayList<>();

        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal totalMargin = BigDecimal.ZERO;

        for (QuotationLine line : quotation.getLines()) {
            Product product = line.getProduct();
            BigDecimal quantity = BigDecimal.valueOf(line.getQuantity());

            // The push-down. Without it a rep sets every line at its ceiling, adds 10% at the
            // order level, and escapes governance entirely while the risk score stays 0.
            BigDecimal effective = clampPercent(line.getDiscountPct().add(orderDiscount));

            // base -> variant -> price list. Lines carry no variant yet, so the middle
            // layer is exercised by the catalog rather than by the builder.
            ResolvedPrice unit = priceResolver.resolve(
                    new PriceResolver.BasePrice(product.getId(), product.getUnitPrice(),
                            product.getUnitCost()),
                    PriceResolver.listedFor(product.getId(), listed));

            BigDecimal gross = unit.unitPrice().multiply(quantity);
            BigDecimal net = gross
                    .multiply(HUNDRED.subtract(effective))
                    .divide(HUNDRED, WORKING_SCALE, RoundingMode.HALF_UP);
            BigDecimal cost = unit.unitCost().multiply(quantity);
            BigDecimal margin = MarginCalculator.margin(net, cost);

            subtotal = subtotal.add(net);
            totalMargin = totalMargin.add(margin);

            priced.add(new PricedLine(
                    line.getId(),
                    product.getName(),
                    product.getCategory().getName(),
                    line.getQuantity(),
                    unit.unitPrice(),
                    line.getDiscountPct(),
                    effective,
                    money(net),
                    money(margin)));

            riskInputs.add(new LineInput(
                    line.getId(),
                    net,
                    effective,
                    tierCeiling,
                    product.getCategory().getCeilingPct()));
        }

        RiskAssessment risk = riskEngine.assess(riskInputs, configService.riskWeights());

        BigDecimal marginPct = MarginCalculator.marginPct(subtotal, subtotal.subtract(totalMargin));

        return new PricedQuotation(
                quotation, priced, money(subtotal), money(subtotal.subtract(totalMargin)),
                marginPct, risk);
    }

    /** The live list for this customer's tier, flattened for the resolver. */
    private List<PriceResolver.ListedPrice> listedPricesFor(Quotation quotation) {
        Long tierId = quotation.getCustomer().getTier().getId();
        return priceLists.findActiveForTier(tierId)
                .map(PricingService::flatten)
                .orElseGet(List::of);
    }

    private static List<PriceResolver.ListedPrice> flatten(PriceList list) {
        List<PriceResolver.ListedPrice> out = new ArrayList<>();
        for (PriceListItem item : list.getItems()) {
            out.add(new PriceResolver.ListedPrice(
                    item.getProduct().getId(), list.getName(), item.getUnitPrice()));
        }
        return out;
    }

    /** A discount below 0 or above 100 is nonsense; clamping keeps net totals sane. */
    private static BigDecimal clampPercent(BigDecimal pct) {
        return pct.max(BigDecimal.ZERO).min(HUNDRED);
    }

    private static BigDecimal money(BigDecimal value) {
        return value.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }
}
