package com.dealflow.analytics.service;

import com.dealflow.analytics.dto.ActivityResponse;
import com.dealflow.common.audit.AuditEvent;
import com.dealflow.common.audit.AuditEventRepository;
import com.dealflow.common.error.ApiException;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.service.QuotationMapper;

import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The dashboard's Recent Activity feed.
 *
 * <p>Nothing new is recorded here. {@code AuditService} has always written a row on every
 * state change; until now they were only reachable nested inside one approval's detail.
 * This reads the same table across every quotation.
 */
@Service
public class ActivityService {

    static final int DEFAULT_LIMIT = 20;

    /** A feed, not an export. Ask for more than this and you want the audit trail. */
    static final int MAX_LIMIT = 100;

    private final AuditEventRepository events;

    public ActivityService(AuditEventRepository events) {
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<ActivityResponse> recent(int limit) {
        // Nonsense is refused; too much is capped. A zero-row feed is a request that
        // cannot have been meant, while asking for a thousand is only over-eager.
        if (limit < 1) {
            throw ApiException.invalid("Ask for at least one entry.", "limit");
        }

        return events.findRecent(PageRequest.of(0, Math.min(limit, MAX_LIMIT))).stream()
                .map(this::toActivity)
                .toList();
    }

    private ActivityResponse toActivity(AuditEvent event) {
        Quotation quotation = event.getQuotation();
        return new ActivityResponse(
                event.getId(),
                quotation.getId(),
                quotation.ref(),
                event.getAction(),
                event.getFromState(),
                event.getToState(),
                event.getActor() == null ? null : event.getActor().getName(),
                event.getReason(),
                QuotationMapper.iso(event.getCreatedAt()));
    }
}
