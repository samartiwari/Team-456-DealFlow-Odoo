package com.dealflow.quotation;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

import com.dealflow.catalog.Product;
import com.dealflow.common.SystemConfigService;
import com.dealflow.domain.risk.BlendedRiskEngine;
import com.dealflow.domain.risk.LineInput;
import com.dealflow.domain.risk.RiskAssessment;

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
    private final BlendedRiskEngine riskEngine = new BlendedRiskEngine();

    public PricingService(SystemConfigService configService) {
        this.configService = configService;
    }

    @Transactional(readOnly = true)
    public PricedQuotation price(Quotation quotation) {
        BigDecimal orderDiscount = quotation.getOrderDiscountPct();
        BigDecimal tierCeiling = quotation.getCustomer().getTier().getCeilingPct();

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

            BigDecimal gross = product.getUnitPrice().multiply(quantity);
            BigDecimal net = gross
                    .multiply(HUNDRED.subtract(effective))
                    .divide(HUNDRED, WORKING_SCALE, RoundingMode.HALF_UP);
            BigDecimal cost = product.getUnitCost().multiply(quantity);
            BigDecimal margin = net.subtract(cost);

            subtotal = subtotal.add(net);
            totalMargin = totalMargin.add(margin);

            priced.add(new PricedLine(
                    line.getId(),
                    product.getName(),
                    product.getCategory().getName(),
                    line.getQuantity(),
                    product.getUnitPrice(),
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

        BigDecimal marginPct = subtotal.signum() == 0
                ? BigDecimal.ZERO
                : totalMargin.multiply(HUNDRED).divide(subtotal, MONEY_SCALE, RoundingMode.HALF_UP);

        return new PricedQuotation(quotation, priced, money(subtotal), marginPct, risk);
    }

    /** A discount below 0 or above 100 is nonsense; clamping keeps net totals sane. */
    private static BigDecimal clampPercent(BigDecimal pct) {
        return pct.max(BigDecimal.ZERO).min(HUNDRED);
    }

    private static BigDecimal money(BigDecimal value) {
        return value.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }
}
