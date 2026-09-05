package com.dealflow.domain.pricing;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Resolution order is the whole feature, and getting it backwards fails silently: a
 * customer on a price list would keep being quoted the base price, and nobody would find
 * out until an invoice was disputed. So the order is asserted directly, layer by layer,
 * rather than inferred from one happy-path price.
 *
 * <p>Figures are the seeded catalog: Laptop Pro at 80,000 base, 88,000 on Standard
 * (Bronze), 84,000 on Growth (Silver), with a 32GB variant at 96,000.
 */
class PriceResolverTest {

    private final PriceResolver resolver = new PriceResolver();

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    private static final PriceResolver.BasePrice LAPTOP =
            new PriceResolver.BasePrice(1, bd("80000"), bd("58000"));

    private static final PriceResolver.VariantPrice BIGGER =
            new PriceResolver.VariantPrice(2, "32GB / 1TB", bd("96000"), bd("69000"));

    private static final PriceResolver.ListedPrice STANDARD =
            new PriceResolver.ListedPrice(1, "Standard", bd("88000"));

    @Test
    @DisplayName("With nothing else, the base price stands")
    void basePriceIsTheFloorOfTheChain() {
        ResolvedPrice price = resolver.resolve(LAPTOP, null, null);

        assertThat(price.unitPrice()).isEqualByComparingTo("80000");
        assertThat(price.unitCost()).isEqualByComparingTo("58000");
        assertThat(price.source()).isEqualTo(PriceSource.BASE);
        assertThat(price.label()).isNull();
    }

    @Test
    @DisplayName("A variant replaces both the price and the cost")
    void variantOverridesBase() {
        ResolvedPrice price = resolver.resolve(LAPTOP, BIGGER, null);

        assertThat(price.unitPrice()).isEqualByComparingTo("96000");
        assertThat(price.unitCost())
                .as("a different build costs us something different to make")
                .isEqualByComparingTo("69000");
        assertThat(price.source()).isEqualTo(PriceSource.VARIANT);
        assertThat(price.label()).isEqualTo("32GB / 1TB");
    }

    @Test
    @DisplayName("A price list overrides the base")
    void priceListOverridesBase() {
        ResolvedPrice price = resolver.resolve(LAPTOP, null, STANDARD);

        assertThat(price.unitPrice()).isEqualByComparingTo("88000");
        assertThat(price.source()).isEqualTo(PriceSource.PRICE_LIST);
        assertThat(price.label()).isEqualTo("Standard");
    }

    @Test
    @DisplayName("A price list also overrides a variant -- an agreement beats a spec sheet")
    void priceListOutranksVariant() {
        ResolvedPrice price = resolver.resolve(LAPTOP, BIGGER, STANDARD);

        assertThat(price.unitPrice())
                .as("the last layer in the chain wins")
                .isEqualByComparingTo("88000");
        assertThat(price.source()).isEqualTo(PriceSource.PRICE_LIST);
    }

    @Test
    @DisplayName("A price list never rewrites what a thing costs us")
    void aListSetsPriceNotCost() {
        // The list says what the customer pays. Letting it touch cost would mean a
        // commercial agreement silently changing the margin the business reports.
        assertThat(resolver.resolve(LAPTOP, null, STANDARD).unitCost())
                .isEqualByComparingTo("58000");
        assertThat(resolver.resolve(LAPTOP, BIGGER, STANDARD).unitCost())
                .isEqualByComparingTo("69000");
    }

    @Test
    @DisplayName("The same product prices differently for Bronze and Gold")
    void gateFour() {
        // Gold has no list, so it pays the base -- which is the keenest rate in the system.
        ResolvedPrice gold = resolver.resolve(LAPTOP, null, null);
        ResolvedPrice silver = resolver.resolve(LAPTOP, null,
                new PriceResolver.ListedPrice(1, "Growth", bd("84000")));
        ResolvedPrice bronze = resolver.resolve(LAPTOP, null, STANDARD);

        assertThat(gold.unitPrice()).isEqualByComparingTo("80000");
        assertThat(silver.unitPrice()).isEqualByComparingTo("84000");
        assertThat(bronze.unitPrice()).isEqualByComparingTo("88000");
        assertThat(gold.unitPrice()).isLessThan(bronze.unitPrice());
    }

    @Test
    @DisplayName("A list that does not name the product leaves the price alone")
    void aListOnlyAppliesToWhatItNames() {
        List<PriceResolver.ListedPrice> list = List.of(
                new PriceResolver.ListedPrice(4, "Standard", bd("13500")));

        assertThat(PriceResolver.listedFor(1, list)).isNull();
        assertThat(resolver.resolve(LAPTOP, null, PriceResolver.listedFor(1, list)).unitPrice())
                .isEqualByComparingTo("80000");
        assertThat(PriceResolver.listedFor(4, list).unitPrice()).isEqualByComparingTo("13500");
    }

    @Test
    @DisplayName("No list at all is not an error")
    void aTierWithoutAListIsFine() {
        assertThat(PriceResolver.listedFor(1, null)).isNull();
        assertThat(PriceResolver.listedFor(1, List.of())).isNull();
    }

    @Test
    @DisplayName("A product with no base price is a broken catalog, not a zero")
    void aMissingBaseIsRefused() {
        assertThatThrownBy(() -> resolver.resolve(null, BIGGER, STANDARD))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Margin is a percentage of revenue, and an empty order is zero rather than a crash")
    void marginIsOfRevenue() {
        // 80,000 sold at a cost of 58,000 keeps 22,000, which is 27.5% of what came in --
        // not the 37.93% it would be if measured against cost.
        assertThat(MarginCalculator.marginPct(bd("80000"), bd("58000")))
                .isEqualByComparingTo("27.50");
        assertThat(MarginCalculator.margin(bd("80000"), bd("58000")))
                .isEqualByComparingTo("22000");
        assertThat(MarginCalculator.marginPct(BigDecimal.ZERO, BigDecimal.ZERO))
                .isEqualByComparingTo("0.00");
    }
}
