package com.dealflow.allocation.repository;

import com.dealflow.allocation.model.Warehouse;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {}
