package com.dealflow.allocation.repository;

import java.util.List;
import java.util.Optional;

import com.dealflow.allocation.model.StockItem;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface StockItemRepository extends JpaRepository<StockItem, Long> {

    @Query("""
            select s from StockItem s
              join fetch s.warehouse
              join fetch s.product
            """)
    List<StockItem> findAllWithRefs();

    /**
     * Locks the row for the duration of the transaction, so two reps accepting plans for
     * the last three laptops cannot both succeed -- the second waits, then sees the truth.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from StockItem s where s.warehouse.id = :warehouseId and s.product.id = :productId")
    Optional<StockItem> findForUpdate(Long warehouseId, Long productId);
}
