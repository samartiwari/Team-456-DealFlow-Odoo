package com.dealflow.analytics.service;

import com.dealflow.analytics.dto.*;
import com.dealflow.analytics.model.AlertSeverity;
import com.dealflow.analytics.model.AlertType;
import com.dealflow.analytics.model.DealHealthAlert;
import com.dealflow.analytics.repository.DealHealthAlertRepository;
import com.dealflow.analytics.repository.DealHealthQueries;
import com.dealflow.approval.service.ApprovalService;
import com.dealflow.common.error.ApiException;
import com.dealflow.domain.health.AnomalyRule;
import com.dealflow.domain.health.DiscountBaseline;
import com.dealflow.identity.model.AppUser;
import com.dealflow.identity.model.UserRole;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.repository.QuotationRepository;
import com.dealflow.quotation.service.QuotationMapper;
import com.dealflow.quotation.service.QuotationService;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What needs a manager's attention, and why.
 *
 * <p>Detectors run on load rather than on a schedule. The brief calls the scheduled job the
 * upgrade and not the requirement, and running on load has a property a nightly job does
 * not: what a manager sees is what is true now, rather than what was true at 2am.
 */
@Service
public class DealHealthService {

    private final DealHealthQueries queries;
    private final DealHealthAlertRepository alerts;
    private final QuotationRepository quotations;
    private final QuotationService quotationService;
    private final ApprovalService approvalService;
    private final AlertRaiser raiser;

    public DealHealthService(DealHealthQueries queries, DealHealthAlertRepository alerts,
                             QuotationRepository quotations, QuotationService quotationService,
                             ApprovalService approvalService, AlertRaiser raiser) {
        this.queries = queries;
        this.alerts = alerts;
        this.quotations = quotations;
        this.quotationService = quotationService;
        this.approvalService = approvalService;
        this.raiser = raiser;
    }

    @Transactional
    public DealHealthBoardResponse board(long actorId) {
        requireManager(actorId, "see the deal health dashboard");
        evaluate();
        return toBoard(alerts.findOpen());
    }

    @Transactional(readOnly = true)
    public List<DealHealthAlertResponse> list(long actorId) {
        requireManager(actorId, "see deal health alerts");
        return alerts.findOpen().stream().map(DealHealthService::toAlert).toList();
    }

    // ---------- the detectors ----------

    /**
     * Runs every detector and reconciles the alert table with what they found.
     *
     * <p>Raising is idempotent by construction: the unique partial index refuses a second
     * open alert for the same quotation and type, so this can run on every page load
     * without a stalled deal collecting one alert per visit.
     */
    private void evaluate() {
        Map<Long, Quotation> byId = new LinkedHashMap<>();
        Set<String> found = new LinkedHashSet<>();

        for (DealHealthQueries.Stalled s : queries.stalled()) {
            found.add(key(s.quotationId(), AlertType.STALLED));
            raise(byId, s.quotationId(), AlertType.STALLED, AlertSeverity.MEDIUM,
                    "No activity for " + s.idleDays() + " days. A quotation in "
                            + s.stage().toLowerCase().replace('_', ' ')
                            + " is considered stalled after " + s.thresholdDays() + ".",
                    null);
        }

        for (DealHealthQueries.Slipped s : queries.slipped()) {
            found.add(key(s.quotationId(), AlertType.SLIPPAGE));
            raise(byId, s.quotationId(), AlertType.SLIPPAGE, AlertSeverity.HIGH,
                    s.units() + " unit(s) were promised by " + s.promisedDate()
                            + " and have not shipped.",
                    null);
        }

        detectAnomalies(byId, found);
        detectCeilingHuggers(byId, found);

        // Anything still open that no detector found this time has stopped being true --
        // the deal moved, the discount was cut, the shipment went out. Closing it here is
        // what keeps resolvedAt meaningful and stops the board filling with history.
        for (DealHealthAlert open : alerts.findOpen()) {
            if (!found.contains(key(open.getQuotation().getId(), open.getType()))) {
                open.setResolvedAt(Instant.now());
                alerts.save(open);
            }
        }
    }

    private static String key(long quotationId, AlertType type) {
        return quotationId + ":" + type;
    }

    private void detectAnomalies(Map<Long, Quotation> byId, Set<String> found) {
        DealHealthQueries.RepBaseline team = queries.teamBaseline();
        Map<Long, DealHealthQueries.RepBaseline> own = new LinkedHashMap<>();
        queries.repBaselines().forEach(b -> own.put(b.repId(), b));

        for (DealHealthQueries.LiveQuote quote : queries.liveQuotes()) {
            DealHealthQueries.RepBaseline mine = own.get(quote.repId());
            boolean tooNew = mine == null || mine.sampleSize() < AnomalyRule.MIN_OWN_HISTORY;
            DealHealthQueries.RepBaseline source = tooNew ? team : mine;

            if (source == null || source.sampleSize() == 0) {
                continue;
            }
            DiscountBaseline baseline = new DiscountBaseline(
                    source.mean(), source.stdDev(), source.sampleSize(), tooNew);

            if (!AnomalyRule.isAnomalous(quote.discountPct(), baseline)) {
                continue;
            }
            Quotation quotation = load(byId, quote.quotationId());
            String whose = tooNew
                    ? "the team's average of " + round(baseline.mean()) + "%"
                    : quotation.getRep().getName() + "'s average of " + round(baseline.mean()) + "%";

            found.add(key(quote.quotationId(), AlertType.DISCOUNT_ANOMALY));
            raise(byId, quote.quotationId(), AlertType.DISCOUNT_ANOMALY, AlertSeverity.HIGH,
                    quote.discountPct().stripTrailingZeros().toPlainString()
                            + "% is well above " + whose + " over "
                            + baseline.sampleSize() + " confirmed quotes"
                            + (tooNew ? " -- too few of their own to judge them by." : "."),
                    metrics(quote.discountPct(), baseline));
        }
    }

    private void detectCeilingHuggers(Map<Long, Quotation> byId, Set<String> found) {
        for (DealHealthQueries.CeilingUse use : queries.ceilingUse()) {
            if (!AnomalyRule.isCeilingHugger(use.atCeiling(), use.considered())) {
                continue;
            }
            // The pattern belongs to a rep, but an alert hangs off a quotation, so it is
            // attached to their most recent live one -- the deal a manager can still act on.
            queries.liveQuotes().stream()
                    .filter(q -> q.repId() == use.repId())
                    .findFirst()
                    .ifPresent(q -> {
                        found.add(key(q.quotationId(), AlertType.CEILING_HUGGER));
                        raise(byId, q.quotationId(), AlertType.CEILING_HUGGER,
                                AlertSeverity.LOW,
                                use.atCeiling() + " of their last " + use.considered()
                                        + " quotes sit within a point of the ceiling. No single "
                                        + "deal is wrong; the pattern is worth a conversation.",
                                null);
                    });
        }
    }

    private void raise(Map<Long, Quotation> byId, long quotationId, AlertType type,
                       AlertSeverity severity, String explanation, String payload) {
        if (alerts.findOpenFor(quotationId, type).isPresent()) {
            return;
        }
        raiser.raise(load(byId, quotationId), type, severity, explanation, payload);
    }

    // ---------- actions ----------

    @Transactional
    public NudgeResponse nudge(long alertId, long actorId) {
        requireManager(actorId, "nudge a deal");
        DealHealthAlert alert = load(alertId);
        Quotation q = alert.getQuotation();

        alert.setAckedAt(Instant.now());
        alerts.save(alert);

        // Returned rather than sent. There is no mail server, and a screen that claims an
        // email went out when none did is worse than one that shows the draft.
        String draft = "Hi " + q.getRep().getName() + ",\n\n"
                + q.ref() + " for " + q.getCustomer().getName() + " needs a look: "
                + alert.getExplanation() + "\n\nCould you pick it up today?";
        return new NudgeResponse(draft, toBoard(alerts.findOpen()));
    }

    @Transactional
    public DealHealthBoardResponse escalate(long alertId, long actorId) {
        AppUser actor = requireManager(actorId, "escalate a deal");
        DealHealthAlert alert = load(alertId);

        approvalService.escalateToFinance(alert.getQuotation().getId(), actor);
        alert.setAckedAt(Instant.now());
        alerts.save(alert);
        return toBoard(alerts.findOpen());
    }

    // ---------- helpers ----------

    private Quotation load(Map<Long, Quotation> cache, long quotationId) {
        return cache.computeIfAbsent(quotationId, id -> quotations.findById(id)
                .orElseThrow(() -> ApiException.notFound("Quotation", id)));
    }

    private DealHealthAlert load(long alertId) {
        return alerts.findById(alertId)
                .orElseThrow(() -> ApiException.notFound("Alert", alertId));
    }

    private AppUser requireManager(long actorId, String what) {
        AppUser actor = quotationService.actor(actorId);
        if (actor.getRole() == UserRole.REP) {
            throw ApiException.forbidden(actor.getName() + " is a rep. Only a manager can "
                    + what + ".");
        }
        return actor;
    }

    private static String metrics(BigDecimal discount, DiscountBaseline baseline) {
        return "{\"discountPct\":" + discount
                + ",\"mean\":" + round(baseline.mean())
                + ",\"stdDev\":" + round(AnomalyRule.effectiveStdDev(baseline.stdDev()))
                + ",\"sampleSize\":" + baseline.sampleSize()
                + ",\"usedTeamBaseline\":" + baseline.fromTeam() + "}";
    }

    private static BigDecimal round(BigDecimal v) {
        return v.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static DealHealthBoardResponse toBoard(List<DealHealthAlert> open) {
        List<DealHealthAlertResponse> rows = open.stream()
                .map(DealHealthService::toAlert).toList();
        return new DealHealthBoardResponse(rows,
                new DealHealthBoardResponse.AlertCounts(
                        count(open, AlertSeverity.HIGH),
                        count(open, AlertSeverity.MEDIUM),
                        count(open, AlertSeverity.LOW),
                        open.size()),
                QuotationMapper.iso(Instant.now()));
    }

    private static int count(List<DealHealthAlert> open, AlertSeverity severity) {
        return (int) open.stream().filter(a -> a.getSeverity() == severity).count();
    }

    private static DealHealthAlertResponse toAlert(DealHealthAlert a) {
        Quotation q = a.getQuotation();
        return new DealHealthAlertResponse(
                a.getId(), q.getId(), q.ref(), q.getCustomer().getName(), q.getRep().getName(),
                a.getType().name(), a.getSeverity().name(), a.getExplanation(),
                QuotationMapper.iso(a.getOpenedAt()),
                a.getAckedAt() == null ? null : QuotationMapper.iso(a.getAckedAt()),
                a.getResolvedAt() == null ? null : QuotationMapper.iso(a.getResolvedAt()),
                parseMetrics(a.getPayloadJson()));
    }

    private static AlertMetricsResponse parseMetrics(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        return new AlertMetricsResponse(
                num(json, "discountPct"), num(json, "mean"), num(json, "stdDev"),
                num(json, "sampleSize").intValue(), json.contains("\"usedTeamBaseline\":true"));
    }

    private static BigDecimal num(String json, String field) {
        int at = json.indexOf('"' + field + "\":");
        if (at < 0) {
            return BigDecimal.ZERO;
        }
        int from = at + field.length() + 3;
        int to = from;
        while (to < json.length() && (Character.isDigit(json.charAt(to)) || json.charAt(to) == '.'
                || json.charAt(to) == '-')) {
            to++;
        }
        return new BigDecimal(json.substring(from, to));
    }
}
