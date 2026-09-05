-- Contact number for the customer. Added nullable so the existing rows can be
-- backfilled first, then tightened to not null -- the entity maps it as
-- @Column(nullable = false), and ddl-auto=validate holds the two in step.

alter table customer add column phone varchar(20);

update customer set phone = '9999999999' where phone is null;

alter table customer alter column phone set not null;
