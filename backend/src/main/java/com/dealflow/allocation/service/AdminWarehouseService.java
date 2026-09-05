package com.dealflow.allocation.service;

import com.dealflow.allocation.dto.AdminWarehouseResponse;
import com.dealflow.allocation.dto.WarehouseBody;
import com.dealflow.allocation.model.Warehouse;
import com.dealflow.allocation.repository.AllocationPlanRepository;
import com.dealflow.allocation.repository.StockItemRepository;
import com.dealflow.allocation.repository.WarehouseRepository;
import com.dealflow.common.error.ApiException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A4. The warehouse screen is not cosmetic: all three fields are read by the allocation
 * engine on every split, so raising one warehouse's weight visibly changes which one the
 * next quotation ships from.
 */
@Service
public class AdminWarehouseService {

    private final WarehouseRepository warehouses;
    private final StockItemRepository stock;
    private final AllocationPlanRepository plans;

    public AdminWarehouseService(WarehouseRepository warehouses, StockItemRepository stock,
                                 AllocationPlanRepository plans) {
        this.warehouses = warehouses;
        this.stock = stock;
        this.plans = plans;
    }

    @Transactional(readOnly = true)
    public List<AdminWarehouseResponse> list() {
        return warehouses.findAllByOrderById().stream().map(AdminWarehouseService::toResponse).toList();
    }

    @Transactional
    public AdminWarehouseResponse create(WarehouseBody body) {
        Warehouse warehouse = new Warehouse();
        warehouse.setName(required(body.name()));
        warehouse.setShipmentFee(money(body.shipmentFee(), "shipmentFee", BigDecimal.ZERO));
        warehouse.setShippingWeight(weight(body.shippingWeight(), BigDecimal.ONE));
        warehouse.setReplenishmentDays(days(body.replenishmentDays(), 5));
        return toResponse(warehouses.save(warehouse));
    }

    @Transactional
    public AdminWarehouseResponse update(long id, WarehouseBody body) {
        Warehouse warehouse = load(id);
        if (body.name() != null) {
            warehouse.setName(required(body.name()));
        }
        if (body.shipmentFee() != null) {
            warehouse.setShipmentFee(money(body.shipmentFee(), "shipmentFee", null));
        }
        if (body.shippingWeight() != null) {
            warehouse.setShippingWeight(weight(body.shippingWeight(), null));
        }
        if (body.replenishmentDays() != null) {
            warehouse.setReplenishmentDays(days(body.replenishmentDays(), null));
        }
        return toResponse(warehouses.save(warehouse));
    }

    /**
     * Closes a warehouse, once it has nothing left to ship.
     *
     * <p>Refused while it holds stock or sits on an accepted plan: a closed warehouse is
     * removed from every future split, and doing that to one that still owes a customer
     * goods would strand the order rather than move it.
     */
    @Transactional
    public void archive(long id) {
        Warehouse warehouse = load(id);

        boolean holdsStock = stock.findAllWithRefs().stream()
                .anyMatch(s -> s.getWarehouse().getId().equals(id) && s.getQuantity() > 0);
        if (holdsStock) {
            throw ApiException.conflict(warehouse.getName()
                    + " still holds stock. Move it out before closing the warehouse.");
        }

        boolean onOpenPlan = plans.findAllWithLines().stream()
                .flatMap(plan -> plan.getLines().stream())
                .anyMatch(line -> line.getWarehouse().getId().equals(id));
        if (onOpenPlan) {
            throw ApiException.conflict(warehouse.getName()
                    + " is shipping an accepted order and cannot be closed yet.");
        }

        warehouse.setArchived(true);
        warehouses.save(warehouse);
    }

    /** Reopens a closed warehouse. It rejoins the allocator's candidates immediately. */
    @Transactional
    public AdminWarehouseResponse restore(long id) {
        Warehouse warehouse = load(id);
        warehouse.setArchived(false);
        return toResponse(warehouses.save(warehouse));
    }

    private Warehouse load(long id) {
        return warehouses.findById(id)
                .orElseThrow(() -> ApiException.notFound("Warehouse", id));
    }

    private static AdminWarehouseResponse toResponse(Warehouse w) {
        return new AdminWarehouseResponse(w.getId(), w.getName(), w.getShipmentFee(),
                w.getShippingWeight(), w.getReplenishmentDays(), w.isArchived());
    }

    private static String required(String name) {
        if (name == null || name.isBlank()) {
            throw ApiException.invalid("name is required.", "name");
        }
        return name.trim();
    }

    private static BigDecimal money(BigDecimal value, String field, BigDecimal fallback) {
        if (value == null) {
            return fallback;
        }
        if (value.signum() < 0) {
            throw ApiException.invalid(field + " cannot be negative.", field);
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal weight(BigDecimal value, BigDecimal fallback) {
        if (value == null) {
            return fallback;
        }
        // Zero would make a warehouse free to ship from and drain it before every other,
        // which is a configuration mistake rather than a preference.
        if (value.signum() <= 0) {
            throw ApiException.invalid("shippingWeight must be greater than zero.",
                    "shippingWeight");
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static int days(Integer value, Integer fallback) {
        if (value == null) {
            return fallback;
        }
        if (value < 0) {
            throw ApiException.invalid("replenishmentDays cannot be negative.",
                    "replenishmentDays");
        }
        return value;
    }
}
