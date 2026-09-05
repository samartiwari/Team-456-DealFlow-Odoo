package com.dealflow.catalog.service;

import com.dealflow.catalog.dto.*;
import com.dealflow.catalog.model.*;
import com.dealflow.catalog.repository.*;
import com.dealflow.common.error.ApiException;
import com.dealflow.crm.model.CustomerTier;
import com.dealflow.crm.repository.CustomerTierRepository;
import com.dealflow.domain.pricing.MarginCalculator;
import com.dealflow.quotation.repository.QuotationRepository;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The write side of the catalog.
 *
 * <p>Reads stay on {@code ProductController} and {@code PriceListController} in their
 * existing shapes; everything here is manager-only and returns shapes that carry cost.
 *
 * <p>Two rules run through all of it. A delete archives rather than deletes, because
 * quotations and invoices point at these rows and orphaning them would break history. And
 * nothing here can move a settled price: lines freeze at confirm, so an edit reaches open
 * drafts and stops there.
 */
@Service
public class AdminCatalogService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final ProductRepository products;
    private final ProductVariantRepository variants;
    private final ProductCategoryRepository categories;
    private final PriceListRepository priceLists;
    private final CustomerTierRepository tiers;
    private final QuotationRepository quotations;

    public AdminCatalogService(ProductRepository products, ProductVariantRepository variants,
                               ProductCategoryRepository categories,
                               PriceListRepository priceLists, CustomerTierRepository tiers,
                               QuotationRepository quotations) {
        this.products = products;
        this.variants = variants;
        this.categories = categories;
        this.priceLists = priceLists;
        this.tiers = tiers;
        this.quotations = quotations;
    }

    // ---------------------------------------------------------------- products

    @Transactional(readOnly = true)
    public List<AdminProductResponse> listProducts() {
        return products.findAllByOrderById().stream().map(this::toAdmin).toList();
    }

    @Transactional
    public AdminProductResponse createProduct(ProductBody body) {
        String name = required(body.name(), "name");
        BigDecimal price = requiredMoney(body.unitPrice(), "unitPrice");
        BigDecimal cost = requiredMoney(body.unitCost(), "unitCost");
        checkMargin(price, cost);

        Product product = new Product();
        product.setName(name);
        product.setCategory(category(required(body.categoryId(), "categoryId")));
        product.setUnitPrice(price);
        product.setUnitCost(cost);
        return toAdmin(products.save(product));
    }

    @Transactional
    public AdminProductResponse updateProduct(long id, ProductBody body) {
        Product product = product(id);

        // A partial: absent means unchanged. The two money fields are validated against
        // each other after the merge, so raising a cost and a price together is one legal
        // edit rather than two illegal halves.
        if (body.name() != null) {
            product.setName(required(body.name(), "name"));
        }
        if (body.categoryId() != null) {
            product.setCategory(category(body.categoryId()));
        }
        if (body.unitPrice() != null) {
            product.setUnitPrice(money(body.unitPrice(), "unitPrice"));
        }
        if (body.unitCost() != null) {
            product.setUnitCost(money(body.unitCost(), "unitCost"));
        }
        checkMargin(product.getUnitPrice(), product.getUnitCost());
        return toAdmin(products.save(product));
    }

    @Transactional
    public void archiveProduct(long id) {
        Product product = product(id);
        product.setArchived(true);
        products.save(product);
    }

    @Transactional
    public AdminProductResponse restoreProduct(long id) {
        Product product = product(id);
        product.setArchived(false);
        return toAdmin(products.save(product));
    }

    @Transactional(readOnly = true)
    public ProductImpactResponse impact(long id) {
        product(id);
        QuotationRepository.PriceChangeImpact impact = quotations.impactOfRepricing(id);
        return new ProductImpactResponse(impact.getOpenDrafts(), impact.getFrozenQuotations());
    }

    // ---------------------------------------------------------------- variants

    @Transactional
    public AdminProductResponse addVariant(long productId, VariantBody body) {
        Product product = product(productId);
        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        applyVariant(variant, body, true);
        variants.save(variant);
        return toAdmin(product);
    }

    @Transactional
    public AdminProductResponse updateVariant(long variantId, VariantBody body) {
        ProductVariant variant = variants.findById(variantId)
                .orElseThrow(() -> ApiException.notFound("Variant", variantId));
        applyVariant(variant, body, false);
        variants.save(variant);
        return toAdmin(variant.getProduct());
    }

    @Transactional
    public AdminProductResponse deleteVariant(long variantId) {
        ProductVariant variant = variants.findById(variantId)
                .orElseThrow(() -> ApiException.notFound("Variant", variantId));
        Product product = variant.getProduct();
        // A variant cannot be put on a quotation line yet, so nothing points at it and this
        // one really is a delete.
        variants.delete(variant);
        return toAdmin(product);
    }

    private void applyVariant(ProductVariant variant, VariantBody body, boolean creating) {
        if (creating || body.name() != null) {
            variant.setName(required(body.name(), "name"));
        }
        if (creating || body.unitPrice() != null) {
            variant.setUnitPrice(requiredMoney(body.unitPrice(), "unitPrice"));
        }
        if (creating || body.unitCost() != null) {
            variant.setUnitCost(requiredMoney(body.unitCost(), "unitCost"));
        }
        checkMargin(variant.getUnitPrice(), variant.getUnitCost());
    }

    // ---------------------------------------------------------------- categories

    @Transactional(readOnly = true)
    public List<CategoryResponse> listCategories() {
        return categories.findAll().stream()
                .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                .map(c -> new CategoryResponse(c.getId(), c.getName(), c.getCeilingPct(),
                        c.isStockable(), c.isRecurring()))
                .toList();
    }

    /**
     * Tunes an existing category. There is deliberately no create.
     *
     * <p>These three flags are wired into three different engines -- {@code ceilingPct}
     * into risk, {@code stockable} into fulfilment, {@code recurring} into billing. Tuning
     * the three that exist is useful; inventing a fourth mid-demo reaches a state nothing
     * else was built for.
     */
    @Transactional
    public CategoryResponse updateCategory(long id, CategoryBody body) {
        ProductCategory category = category(id);
        if (body.ceilingPct() != null) {
            category.setCeilingPct(percent(body.ceilingPct(), "ceilingPct"));
        }
        if (body.stockable() != null) {
            category.setStockable(body.stockable());
        }
        if (body.recurring() != null) {
            category.setRecurring(body.recurring());
        }
        categories.save(category);
        return new CategoryResponse(category.getId(), category.getName(),
                category.getCeilingPct(), category.isStockable(), category.isRecurring());
    }

    // ---------------------------------------------------------------- price lists

    @Transactional(readOnly = true)
    public List<AdminPriceListResponse> listPriceLists() {
        return priceLists.findAllWithItemsIncludingArchived().stream()
                .map(this::toAdmin).toList();
    }

    @Transactional
    public AdminPriceListResponse createPriceList(PriceListBody body) {
        PriceList list = new PriceList();
        list.setName(required(body.name(), "name"));
        list.setTier(body.tierId() == null ? null : tier(body.tierId()));
        list.setActive(body.active() == null || body.active());
        checkOneActiveListPerTier(list);
        return toAdmin(priceLists.save(list));
    }

    @Transactional
    public AdminPriceListResponse updatePriceList(long id, PriceListBody body) {
        PriceList list = priceList(id);
        if (body.name() != null) {
            list.setName(required(body.name(), "name"));
        }
        if (body.tierId() != null) {
            list.setTier(tier(body.tierId()));
        }
        if (body.active() != null) {
            list.setActive(body.active());
        }
        checkOneActiveListPerTier(list);
        return toAdmin(priceLists.save(list));
    }

    @Transactional
    public void archivePriceList(long id) {
        PriceList list = priceList(id);
        list.setArchived(true);
        // An archived list is not a live one, or it would keep holding the tier's slot.
        list.setActive(false);
        priceLists.save(list);
    }

    /**
     * Brings a list back, inactive.
     *
     * <p>Deliberately not reactivated: the tier it names may have acquired a different
     * active list while this one was away, and silently taking the slot back would reprice
     * every open draft for that tier without anyone asking.
     */
    @Transactional
    public AdminPriceListResponse restorePriceList(long id) {
        PriceList list = priceList(id);
        list.setArchived(false);
        list.setActive(false);
        return toAdmin(priceLists.save(list));
    }

    /** Upsert: one call whether the product is already on the list or not. */
    @Transactional
    public AdminPriceListResponse setPrice(long listId, long productId, PriceListItemBody body) {
        PriceList list = priceList(listId);
        Product product = product(productId);
        BigDecimal price = requiredMoney(body.unitPrice(), "unitPrice");

        list.getItems().stream()
                .filter(i -> i.getProduct().getId().equals(productId))
                .findFirst()
                .ifPresentOrElse(
                        item -> item.setUnitPrice(price),
                        () -> {
                            PriceListItem item = new PriceListItem();
                            item.setPriceList(list);
                            item.setProduct(product);
                            item.setUnitPrice(price);
                            list.getItems().add(item);
                        });
        return toAdmin(priceLists.save(list));
    }

    @Transactional
    public AdminPriceListResponse removePrice(long listId, long productId) {
        PriceList list = priceList(listId);
        boolean removed = list.getItems()
                .removeIf(i -> i.getProduct().getId().equals(productId));
        if (!removed) {
            throw ApiException.notFound("Price list item", productId);
        }
        // Orphan removal deletes the row; the product falls back to its base price.
        return toAdmin(priceLists.save(list));
    }

    /**
     * At most one live list per tier.
     *
     * <p>The database enforces this too, with a partial unique index. Checking here as well
     * is not redundant -- it is what turns a constraint violation into a 409 that names the
     * list already holding the slot.
     */
    private void checkOneActiveListPerTier(PriceList candidate) {
        if (!candidate.isActive() || candidate.getTier() == null) {
            return;
        }
        priceLists.findActiveForTier(candidate.getTier().getId())
                .filter(existing -> !existing.getId().equals(candidate.getId()))
                .ifPresent(existing -> {
                    throw ApiException.conflict(existing.getName()
                            + " is already the active list for this tier. Deactivate it first.");
                });
    }

    // ---------------------------------------------------------------- shared

    private Product product(long id) {
        return products.findById(id).orElseThrow(() -> ApiException.notFound("Product", id));
    }

    private ProductCategory category(long id) {
        return categories.findById(id).orElseThrow(() -> ApiException.notFound("Category", id));
    }

    private PriceList priceList(long id) {
        return priceLists.findById(id).orElseThrow(() -> ApiException.notFound("Price list", id));
    }

    private CustomerTier tier(long id) {
        return tiers.findById(id).orElseThrow(() -> ApiException.notFound("Tier", id));
    }

    /**
     * A product sold below cost is almost always a typo, and it would put a negative margin
     * into the risk engine and every report downstream. Refused rather than warned about.
     */
    private static void checkMargin(BigDecimal price, BigDecimal cost) {
        if (cost.compareTo(price) > 0) {
            throw ApiException.invalid(
                    "Cost cannot be higher than price -- the product would sell at a loss.",
                    "unitCost");
        }
    }

    private static String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw ApiException.invalid(field + " is required.", field);
        }
        return value.trim();
    }

    private static long required(Long value, String field) {
        if (value == null) {
            throw ApiException.invalid(field + " is required.", field);
        }
        return value;
    }

    private static BigDecimal requiredMoney(BigDecimal value, String field) {
        if (value == null) {
            throw ApiException.invalid(field + " is required.", field);
        }
        return money(value, field);
    }

    private static BigDecimal money(BigDecimal value, String field) {
        if (value.signum() < 0) {
            throw ApiException.invalid(field + " cannot be negative.", field);
        }
        return value.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static BigDecimal percent(BigDecimal value, String field) {
        if (value.signum() < 0 || value.compareTo(HUNDRED) > 0) {
            throw ApiException.invalid(field + " must be between 0 and 100.", field);
        }
        return value.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private AdminProductResponse toAdmin(Product p) {
        return new AdminProductResponse(
                p.getId(),
                p.getName(),
                p.getCategory().getId(),
                p.getCategory().getName(),
                p.getUnitPrice(),
                p.getUnitCost(),
                MarginCalculator.marginPct(p.getUnitPrice(), p.getUnitCost()),
                p.getCategory().isStockable(),
                p.getCategory().isRecurring(),
                p.isArchived(),
                variants.findByProductIdOrderById(p.getId()).stream()
                        .map(v -> new AdminVariantResponse(v.getId(), v.getName(),
                                v.getUnitPrice(), v.getUnitCost()))
                        .toList());
    }

    private AdminPriceListResponse toAdmin(PriceList list) {
        return new AdminPriceListResponse(
                list.getId(),
                list.getName(),
                list.getTier() == null ? null : list.getTier().getId(),
                list.getTier() == null ? null : list.getTier().getName(),
                list.isActive(),
                list.isArchived(),
                list.getItems().stream()
                        .map(i -> new PriceListItemResponse(
                                i.getProduct().getId(),
                                i.getProduct().getName(),
                                i.getUnitPrice(),
                                i.getProduct().getUnitPrice()))
                        .toList());
    }
}
