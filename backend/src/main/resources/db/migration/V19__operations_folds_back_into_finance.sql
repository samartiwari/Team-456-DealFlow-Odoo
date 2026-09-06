-- Operations was never a role of its own.
--
-- V18 split it out on the strength of a gap analysis that read the brief as
-- naming five separate roles. The brief's own heading is "Finance / Operations
-- User" -- one role, carrying all three duties listed under it: second-level
-- approvals, warehouse splits and backorder decisions, and billing
-- reconciliation. FINANCE already held every one of them, so the split created
-- an identity with nothing that was not already somebody's job.
--
-- Admin stays. That one the brief does name separately, with duties -- backend
-- setup and platform-wide analytics -- that no other role covers.

-- An audit row records who did something. Releasing it rather than deleting it,
-- because losing the row would lose the history; the actor column is already
-- nullable for exactly this reason, since a customer acting through the portal
-- is not a user of this system either.
update audit_event set actor_id = null
where actor_id in (select id from app_user where role = 'OPERATIONS');

update quotation set rep_id = 1
where rep_id in (select id from app_user where role = 'OPERATIONS');

delete from app_user where role = 'OPERATIONS';

alter table app_user drop constraint if exists app_user_role_check;
alter table app_user
    add constraint app_user_role_check
        check (role in ('REP', 'MANAGER', 'FINANCE', 'ADMIN'));
