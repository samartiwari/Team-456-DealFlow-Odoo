package com.dealflow.allocation.dto;

import java.util.List;

/** lines null or empty accepts the suggestion unchanged; otherwise it is a manual override. */
public record AcceptAllocationRequest(List<OverrideLine> lines) {

    public boolean isOverride() {
        return lines != null && !lines.isEmpty();
    }
}
