package com.dealflow.analytics.repository;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The detectors, as queries.
 *
 * <p>The brief is explicit that each should be a query rather than a heuristic buried in a
 * service, and the reason is auditability: a manager asking "why was this flagged?"
 * deserves an answer that can be read, run and checked, not one that has to be traced
 * through branching code.
 */
@Repository
public class DealHealthQueries {

    private final JdbcClient db;

    public DealHealthQueries(JdbcClient db) {
        this.db = db;
    }

    /**
     * Deals that have gone quiet, judged per stage.
     *
     * <p>Five days is patient for a draft or something sitting with a customer; two is
     * already long for a quotation waiting on a colleague's signature. A single timeout
     * would either nag about drafts or let approvals rot.
     */
    public List<Stalled> stalled() {
        return db.sql("""
                select q.id                                            as quotation_id,
                       q.state                                         as stage,
                       extract(day from now() - q.last_activity_at)::int as idle_days,
                       case when q.state = 'PENDING_APPROVAL' then 2 else 5 end as threshold_days
                  from quotation q
                 where q.state in ('DRAFT', 'RETURNED', 'PENDING_APPROVAL', 'SENT', 'UNDER_NEGOTIATION')
                   and q.last_activity_at < now() - (case when q.state = 'PENDING_APPROVAL'
                                                          then interval '2 days'
                                                          else interval '5 days' end)
                """)
                .query(Stalled.class).list();
    }

    /** A rep's own recent form: mean and spread over their last twenty confirmed quotes. */
    public List<RepBaseline> repBaselines() {
        return db.sql("""
                with recent as (
                    select q.rep_id, q.order_discount_pct,
                           row_number() over (partition by q.rep_id order by q.created_at desc) as rn
                      from quotation q
                     where q.state = 'CONFIRMED'
                )
                select rep_id                                    as rep_id,
                       count(*)                                  as sample_size,
                       avg(order_discount_pct)                   as mean,
                       coalesce(stddev_samp(order_discount_pct), 0) as std_dev
                  from recent
                 where rn <= 20
                 group by rep_id
                """)
                .query(RepBaseline.class).list();
    }

    /** The same numbers across everyone, for a rep too new to be judged against themselves. */
    public RepBaseline teamBaseline() {
        return db.sql("""
                select 0                                         as rep_id,
                       count(*)                                  as sample_size,
                       coalesce(avg(order_discount_pct), 0)      as mean,
                       coalesce(stddev_samp(order_discount_pct), 0) as std_dev
                  from quotation
                 where state = 'CONFIRMED'
                """)
                .query(RepBaseline.class).single();
    }

    /** Live quotations whose discount is still worth questioning. */
    public List<LiveQuote> liveQuotes() {
        return db.sql("""
                select q.id                as quotation_id,
                       q.rep_id            as rep_id,
                       q.order_discount_pct as discount_pct
                  from quotation q
                 where q.state in ('DRAFT', 'RETURNED', 'PENDING_APPROVAL', 'APPROVED',
                                   'SENT', 'UNDER_NEGOTIATION')
                """)
                .query(LiveQuote.class).list();
    }

    /**
     * How often a rep lands within a point of the ceiling they are allowed.
     *
     * <p>The ceiling is the stricter of the customer's tier and the product's category,
     * which is the same rule the risk engine applies -- so this measures discretion against
     * exactly the limit the rep was working to.
     */
    public List<CeilingUse> ceilingUse() {
        return db.sql("""
                with recent as (
                    select q.id, q.rep_id, q.order_discount_pct,
                           row_number() over (partition by q.rep_id order by q.created_at desc) as rn
                      from quotation q
                     where q.state = 'CONFIRMED'
                ),
                ceilings as (
                    select r.rep_id, r.id,
                           min(least(t.ceiling_pct, coalesce(pc.ceiling_pct, t.ceiling_pct))) as ceiling_pct,
                           max(r.order_discount_pct) as discount_pct
                      from recent r
                      join quotation q         on q.id = r.id
                      join customer c          on c.id = q.customer_id
                      join customer_tier t     on t.id = c.tier_id
                      join quotation_line l    on l.quotation_id = q.id
                      join product p           on p.id = l.product_id
                      join product_category pc on pc.id = p.category_id
                     where r.rn <= 20
                     group by r.rep_id, r.id
                )
                select rep_id                                                          as rep_id,
                       count(*)                                                        as considered,
                       -- WITHIN a point of the ceiling, not past it. Exceeding a ceiling
                       -- is what the risk engine is for; this looks for the rep who never
                       -- exceeds it and never leaves anything on the table either.
                       count(*) filter (
                           where discount_pct between ceiling_pct - 1 and ceiling_pct
                       )                                                                as at_ceiling
                  from ceilings
                 group by rep_id
                """)
                .query(CeilingUse.class).list();
    }

    /** A promise already missed: the date has passed and nothing has shipped. */
    public List<Slipped> slipped() {
        return db.sql("""
                select p.quotation_id      as quotation_id,
                       min(b.promised_date)::text as promised_date,
                       sum(b.quantity)::int as units
                  from backorder b
                  join allocation_plan p on p.id = b.plan_id
                 where b.promised_date < current_date
                 group by p.quotation_id
                """)
                .query(Slipped.class).list();
    }

    public record Stalled(long quotationId, String stage, int idleDays, int thresholdDays) {}

    public record RepBaseline(long repId, int sampleSize, BigDecimal mean, BigDecimal stdDev) {}

    public record LiveQuote(long quotationId, long repId, BigDecimal discountPct) {}

    public record CeilingUse(long repId, int considered, int atCeiling) {}

    public record Slipped(long quotationId, String promisedDate, int units) {}
}
