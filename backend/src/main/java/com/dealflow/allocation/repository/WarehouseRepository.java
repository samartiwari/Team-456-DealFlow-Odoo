package com.dealflow.allocation.repository;

import com.dealflow.allocation.model.Warehouse;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {

    /** The warehouses the allocator may ship from. */
    List<Warehouse> findByArchivedFalseOrderById();

    /** Everything, closed ones included -- the admin list. */
    List<Warehouse> findAllByOrderById();
}
