-- A3's fourth and fifth roles.
--
-- The spec names five. Three were built, with Admin folded into Manager and Operations
-- into Finance, and that collapse was defensible while nothing distinguished them: both
-- pairs had identical permissions. They are separated here because the identities are
-- different even where the permissions overlap -- "Operations manages splits, backorders
-- and reconciliation" is a job, and a Finance login doing it says the wrong thing about
-- who is accountable for it.
--
-- Deliberately not a hierarchy. Admin configures the platform and reads everything;
-- Operations moves stock and nothing else. Neither can sign an approval step: the chain
-- names MANAGER and FINANCE, and widening it would let a deal be cleared by somebody the
-- policy never nominated.
alter table app_user drop constraint if exists app_user_role_check;
alter table app_user
    add constraint app_user_role_check
        check (role in ('REP', 'MANAGER', 'FINANCE', 'ADMIN', 'OPERATIONS'));

-- Two more accounts on the same shared demo password as everyone else, so a reviewer can
-- sign in as all five in seconds.
insert into app_user (id, name, role, email, password_hash)
values (7, 'Devi Admin', 'ADMIN', 'admin@dealflow.test',
        '$2a$10$7wIRrX6Lko0GiSynMNeW5OimEcNXFmD4R6w62MeeXdIJQCEvuDYoi'),
       (8, 'Omar Operations', 'OPERATIONS', 'ops@dealflow.test',
        '$2a$10$7wIRrX6Lko0GiSynMNeW5OimEcNXFmD4R6w62MeeXdIJQCEvuDYoi');
