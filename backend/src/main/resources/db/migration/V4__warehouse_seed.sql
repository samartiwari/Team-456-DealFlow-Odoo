-- Seeded for failure, not success: Main holds only 3 of the 6 laptops the demo orders,
-- so the split across two warehouses is guaranteed rather than lucky.

insert into warehouse (id, name, shipment_fee, shipping_weight, replenishment_days)
values (1, 'Main Warehouse', 500, 1.0, 5),
       (2, 'East Depot',     500, 1.4, 7);

insert into stock_item (warehouse_id, product_id, quantity)
values (1, 1,   3),    -- Main: Laptop Pro x3   <- deliberately short
       (1, 2, 100),    -- Main: Setup Service
       (1, 3, 100),    -- Main: Support Plan
       (1, 4,  10),    -- Main: Docking Station
       (1, 5, 100),    -- Main: Onsite Training
       (2, 1,   5),    -- East: Laptop Pro x5
       (2, 4,  20),    -- East: Docking Station
       (2, 3,  50);    -- East: Support Plan
