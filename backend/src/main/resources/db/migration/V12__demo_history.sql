-- Ninety days of trading history.
--
-- The ship checklist calls this non-negotiable, and the reason is not the demo looking
-- busy: the discount-anomaly detector measures a rep against their OWN last twenty
-- confirmed quotes, so with a dozen rows in the database it has no distribution to
-- compare anything to and can only ever report nothing. Reporting has the same problem
-- from the other side -- four filters over five rows prove nothing.
--
-- Deterministic on purpose. Every figure below is fixed, so a clean clone produces the
-- same alerts and the same report totals as this machine, and the demo cannot be
-- undermined by a random seed that happened to generate a quiet week.

-- Three more reps. Per-rep baselines need reps to have histories of their own, and one
-- rep with everything is indistinguishable from a team average.
insert into app_user (id, name, role) values
    (4, 'Priya Rao',   'REP'),
    (5, 'Arjun Mehta', 'REP'),
    (6, 'Nina Desai',  'REP');

/*
 * Forty confirmed orders over ninety days, with a deliberate shape per rep:
 *
 *   Rep One     around 12%, tightly     -- the steady baseline
 *   Priya Rao   around  8%, very tight  -- so 22% on a live quote is far outside her norm
 *   Arjun Mehta around 18%, consistent  -- he discounts more than Priya on every single
 *                                          order and must still trip nothing
 *   Nina Desai  three quotes only       -- too few to be judged against herself, so the
 *                                          detector falls back to the team
 *
 * Arjun is the argument for the whole design. He is the biggest discounter in the company
 * and is never an anomaly, because an anomaly is a departure from a rep's own pattern
 * rather than a number someone picked.
 */
insert into quotation (id, customer_id, rep_id, state, risk_score, order_discount_pct,
                       created_at, last_activity_at, approved_baseline_score)
select
    100 + n,
    1 + (n % 3),
    rep,
    'CONFIRMED',
    0,
    discount,
    now() - make_interval(days => 89 - (n * 2)),
    now() - make_interval(days => 89 - (n * 2)),
    0
from (
    select n,
           case when n < 14 then 1 when n < 27 then 4 when n < 37 then 5 else 6 end as rep,
           case
               -- Rep One: 11 to 13
               when n < 14 then 11 + (n % 3)
               -- Priya: 7 to 9, tightly. Her outlier is a LIVE quote further down,
               -- not a closed one -- an alert on a shipped order is not actionable.
               when n < 27 then 7 + (n % 3)
               -- Arjun: 17 to 19, consistently
               when n < 37 then 17 + (n % 3)
               -- Nina: four quotes only
               else 10 + (n % 3)
           end as discount
    from generate_series(0, 39) as n
) rows;

-- One or two lines each, alternating so the category filter in reporting has something to
-- separate. Hardware on every order, a service or subscription on every third.
insert into quotation_line (quotation_id, product_id, quantity, discount_pct)
select 100 + n, 1, 1 + (n % 4), 0 from generate_series(0, 39) as n;

insert into quotation_line (quotation_id, product_id, quantity, discount_pct)
select 100 + n, case when n % 3 = 0 then 3 else 2 end, 1, 0
from generate_series(0, 39) as n where n % 3 <> 2;

/*
 * Three live quotations, so the detectors have something real to find and -- just as
 * importantly -- something real to leave alone.
 *
 *   200  Priya at 22%   far outside her own 7-9% norm, and stale in PENDING_APPROVAL
 *   201  Arjun at 10%   stale in DRAFT, but an ordinary discount for him
 *   202  Arjun at 19%   his highest, recent, and correctly NOT an anomaly
 *
 * 202 is the control. Without it the dashboard proves only that the detector fires; with
 * it, it proves the detector knows when not to.
 */
insert into quotation (id, customer_id, rep_id, state, risk_score, order_discount_pct,
                       created_at, last_activity_at, approved_baseline_score)
values
    (200, 2, 4, 'PENDING_APPROVAL', 70, 22, now() - interval '9 days',  now() - interval '6 days',  null),
    (201, 3, 5, 'DRAFT',             0, 10, now() - interval '20 days', now() - interval '12 days', null),
    (202, 1, 5, 'PENDING_APPROVAL', 30, 19, now() - interval '1 day',   now() - interval '1 day',   null),
    -- Stale in PENDING_APPROVAL at an ordinary discount for her, so it demonstrates the
    -- two-day threshold on its own without also being an anomaly.
    (203, 3, 4, 'PENDING_APPROVAL', 30,  8, now() - interval '7 days',  now() - interval '4 days',  null);

insert into quotation_line (quotation_id, product_id, quantity, discount_pct) values
    (200, 1, 4, 0),
    (201, 6, 2, 0),
    (202, 1, 3, 0),
    (203, 4, 2, 0);

-- A quotation cannot sit in PENDING_APPROVAL without an approval to be pending on -- the
-- API could never produce that state, so neither should the seed. Both waiting quotations
-- get a real open chain, which is also what makes them escalatable from the dashboard.
insert into approval_request (id, quotation_id, risk_score, state, created_at) values
    (900, 200, 70, 'OPEN', now() - interval '9 days'),
    (901, 202, 30, 'OPEN', now() - interval '1 day'),
    (902, 203, 30, 'OPEN', now() - interval '7 days');

insert into approval_step (request_id, step_order, role, state) values
    (900, 1, 'MANAGER', 'PENDING'),
    (901, 1, 'MANAGER', 'PENDING'),
    (902, 1, 'MANAGER', 'PENDING');
