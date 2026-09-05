-- Services and subscriptions are delivered, not shipped. They have no stock, occupy no
-- warehouse and must never appear in a fulfilment plan or carry a promised date.
--
-- The flag sits on the category rather than the product: whether a thing is physical is a
-- property of its kind, and keeping it in a table means it stays configurable.

alter table product_category
    add column stockable boolean not null default true;

update product_category set stockable = false where name in ('Services', 'Subscriptions');

-- Remove the stock rows that should never have existed.
delete from stock_item
 where product_id in (select p.id
                        from product p
                        join product_category c on c.id = p.category_id
                       where c.stockable = false);
