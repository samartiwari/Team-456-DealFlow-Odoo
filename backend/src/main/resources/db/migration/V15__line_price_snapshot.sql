-- A quotation line stored product_id, quantity and discount_pct -- and no price. Every read
-- re-resolved the price from the catalog. That is invisible while the catalog is read-only,
-- and becomes a rewrite of history the moment an admin can edit it: changing one product's
-- price would silently move every confirmed order, the risk scores those orders were
-- approved against, and the figures already published to customers -- while invoice_line,
-- which does snapshot unit_price, kept the old number and disagreed with its own quotation.
--
-- The price is frozen onto the line when the quotation is confirmed. Null means "not frozen
-- yet": a DRAFT or RETURNED quotation still tracks the catalog, which is the useful half of
-- the rule -- correcting a price updates the quotes still being written.
alter table quotation_line
    add column unit_price numeric(14, 2),
    add column unit_cost  numeric(14, 2);

-- Freeze existing history at exactly what it resolves to today, so every figure already
-- published -- Gate 4's table, the 40 seeded orders, the invoices raised against them --
-- keeps the number it was computed from. The resolution mirrors PriceResolver: the
-- customer's active tier list wins over the base price. No line carries a variant yet.
update quotation_line ql
set unit_price = (
        select coalesce(pli.unit_price, p.unit_price)
        from product p
                 join quotation q on q.id = ql.quotation_id
                 join customer c on c.id = q.customer_id
                 left join price_list pl on pl.tier_id = c.tier_id and pl.active
                 left join price_list_item pli
                           on pli.price_list_id = pl.id and pli.product_id = p.id
        where p.id = ql.product_id
    ),
    unit_cost = (select p.unit_cost from product p where p.id = ql.product_id)
where exists (
    select 1
    from quotation q
    where q.id = ql.quotation_id
      and q.state not in ('DRAFT', 'RETURNED')
);

-- Either both are set or neither is. A line with a price but no cost would report an
-- infinite margin.
alter table quotation_line
    add constraint ck_line_snapshot_paired
        check ((unit_price is null) = (unit_cost is null));
