package com.dealflow.analytics.controller;

import com.dealflow.analytics.dto.DealHealthAlertResponse;
import com.dealflow.analytics.dto.DealHealthBoardResponse;
import com.dealflow.analytics.dto.NudgeResponse;
import com.dealflow.analytics.service.DealHealthService;

import java.util.List;

import org.springframework.web.bind.annotation.*;

/**
 * B9. Manager and admin only -- a rep has no business seeing how their discounting
 * compares to the team's.
 */
@RestController
public class DealHealthController {

    private final DealHealthService service;

    public DealHealthController(DealHealthService service) {
        this.service = service;
    }

    /** Runs the detectors and returns what they found, with counts by severity. */
    @GetMapping("/api/dashboard/health")
    public DealHealthBoardResponse board(@RequestParam long userId) {
        return service.board(userId);
    }

    /** The same alerts without the counts, for a standalone list. */
    @GetMapping("/api/alerts")
    public List<DealHealthAlertResponse> alerts(@RequestParam long userId) {
        return service.list(userId);
    }

    /** Drafts a follow-up. Returned rather than sent -- there is no mail server. */
    @PostMapping("/api/alerts/{id}/nudge")
    public NudgeResponse nudge(@PathVariable long id, @RequestParam long userId) {
        return service.nudge(id, userId);
    }

    /** Appends a Finance step to the quotation's approval, audited like any decision. */
    @PostMapping("/api/alerts/{id}/escalate")
    public DealHealthBoardResponse escalate(@PathVariable long id, @RequestParam long userId) {
        return service.escalate(id, userId);
    }
}
