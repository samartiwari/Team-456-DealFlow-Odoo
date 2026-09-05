-- A2, the last piece. Variants were modelled and displayed but could not be put on a
-- quotation line, which made them decoration: the resolver's middle layer existed and was
-- unit-tested, and nothing in the running system ever reached it.
--
-- Nullable, because most lines are for the plain product. A line with a variant prices off
-- the variant's own price and cost; a line without one prices off the product, exactly as
-- before -- so every existing row keeps its meaning without being touched.
alter table quotation_line
    add column variant_id bigint references product_variant (id);

-- A variant belongs to exactly one product, and a line naming a variant of some other
-- product would price off one thing while claiming to be another. The service refuses it
-- with a 422; this is the backstop for anything that gets past it.
create index ix_quotation_line_variant on quotation_line (variant_id);
