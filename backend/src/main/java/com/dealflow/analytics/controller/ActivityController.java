package com.dealflow.analytics.controller;

import com.dealflow.analytics.dto.ActivityResponse;
import com.dealflow.analytics.service.ActivityService;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The home dashboard's Recent Activity feed.
 *
 * <p>Open to any signed-in member of staff, exactly as the quotations list and the
 * approvals queue are. The feed says who did what to which deal -- it carries no cost,
 * margin or risk figure of its own, so there is nothing here a rep may not see that they
 * could not already read off the quotation.
 */
@RestController
public class ActivityController {

    private final ActivityService service;

    public ActivityController(ActivityService service) {
        this.service = service;
    }

    @GetMapping("/api/activity")
    public List<ActivityResponse> recent(@RequestParam(defaultValue = "20") int limit) {
        return service.recent(limit);
    }
}
