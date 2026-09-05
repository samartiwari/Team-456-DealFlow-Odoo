package com.dealflow.domain.pricing;

import java.math.BigDecimal;
import java.util.List;

/**
 * Settles the price of one unit for one customer.
 *
 * <p>Three layers, applied in order, each overriding the last:
 *
 * <ol>
 *   <li><b>base</b> -- what the product costs by default
 *   <li><b>variant</b> -- the same product in a different shape, carrying its own price
 *   <li><b>price list</b> -- what this customer's tier is published at
 * </ol>
 *
 * <p>The order is the whole feature, and it is the part that goes wrong silently: read the
 * other way round, a customer on a price list would still be quoted the base price and
 * nobody would notice until an invoice was disputed.
 *
 * <p>A price list overrides a variant deliberately. A list is a commercial agreement with a
 * named customer tier; a variant is a fact about the product. When the two disagree, the
 * agreement wins -- that is what having signed one means.
 *
 * <p>Pure Java on purpose -- no Spring, no JPA -- so resolution order is tested without a
 * database.
 */
public final class PriceResolver {

    /**
     * @param variant     null when the line is for the plain product
     * @param listedPrice the tier's published price for this product, or null if the tier
     *                    has no list or the list does not name this product
     */
    public ResolvedPrice resolve(BasePrice base, VariantPrice variant, ListedPrice listedPrice) {
        if (base == null) {
            throw new IllegalArgumentException("A product must have a base price.");
        }

        BigDecimal unitPrice = base.unitPrice();
        BigDecimal unitCost = base.unitCost();
        PriceSource source = PriceSource.BASE;
        String label = null;

        if (variant != null) {
            unitPrice = variant.unitPrice();
            unitCost = variant.unitCost();
            source = PriceSource.VARIANT;
            label = variant.name();
        }

        if (listedPrice != null) {
            // The list sets what the customer pays. It says nothing about what the thing
            // costs us, so the cost stays wherever the layer below left it -- otherwise a
            // price list would quietly rewrite margin.
            unitPrice = listedPrice.unitPrice();
            source = PriceSource.PRICE_LIST;
            label = listedPrice.priceListName();
        }

        return new ResolvedPrice(unitPrice, unitCost, source, label);
    }

    /** Convenience for the common case of no variant. */
    public ResolvedPrice resolve(BasePrice base, ListedPrice listedPrice) {
        return resolve(base, null, listedPrice);
    }

    /** Picks the entry for a product out of a tier's list, if it names one. */
    public static ListedPrice listedFor(long productId, List<ListedPrice> list) {
        return list == null ? null : list.stream()
                .filter(item -> item.productId() == productId)
                .findFirst()
                .orElse(null);
    }

    public record BasePrice(long productId, BigDecimal unitPrice, BigDecimal unitCost) {}

    public record VariantPrice(long variantId, String name, BigDecimal unitPrice,
                               BigDecimal unitCost) {}

    public record ListedPrice(long productId, String priceListName, BigDecimal unitPrice) {}
}
