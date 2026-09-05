package com.dealflow.analytics.dto;

import java.util.List;

public record DealHealthBoardResponse(List<DealHealthAlertResponse> alerts,
                                      AlertCounts counts, String evaluatedAt) {

    public record AlertCounts(int high, int medium, int low, int total) {}
}
