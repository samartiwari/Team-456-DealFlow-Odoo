-- The numbers that make the demo work. Every tunable constant lives here, never in Java.

insert into customer_tier (id, name, ceiling_pct)
values (1, 'Bronze', 5), (2, 'Silver', 10), (3, 'Gold', 15);

-- Services is deliberately stricter than Hardware -- this gap is what creates the demo's risk score
insert into product_category (id, name, ceiling_pct)
values (1, 'Hardware', 15), (2, 'Services', 10), (3, 'Subscriptions', 8);

-- unit_cost is mandatory; margin is impossible without it
insert into product (id, name, category_id, unit_price, unit_cost)
values (1, 'Laptop Pro',      1, 80000, 58000),
       (2, 'Setup Service',   2, 15000,  9000),
       (3, 'Support Plan',    3,  2000,   700),
       (4, 'Docking Station', 1, 12000,  8000),
       (5, 'Onsite Training', 2, 25000, 16000);

insert into customer (id, name, tier_id)
values (1, 'Acme Corp', 3), (2, 'Beta Industries', 2), (3, 'Corex Ltd', 1);

insert into app_user (id, name, role)
values (1, 'Rep One', 'REP'), (2, 'Meera Manager', 'MANAGER'), (3, 'Farid Finance', 'FINANCE');

-- change a value here, restart, and routing changes with no code change
insert into system_config (key, value)
values ('risk.weight.weighted',       '6'),
       ('risk.weight.max',            '4'),
       ('approval.band.manager.min',  '1'),
       ('approval.band.finance.min', '50');
