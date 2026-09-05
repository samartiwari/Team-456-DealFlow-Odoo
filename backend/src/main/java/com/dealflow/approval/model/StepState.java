package com.dealflow.approval.model;

public enum StepState {
    /** Actionable now. */
    PENDING,
    /** Waiting on an earlier step -- Finance can never act before the Manager. */
    BLOCKED,
    APPROVED,
    REJECTED,
    RETURNED
}
