package com.dealflow.billing.model;

/** How long one billing period runs. */
public enum BillingInterval {
    MONTHLY(1),
    QUARTERLY(3),
    YEARLY(12);

    private final int months;

    BillingInterval(int months) {
        this.months = months;
    }

    public int months() {
        return months;
    }

    /**
     * How many periods to schedule ahead.
     *
     * <p>A year's worth either way, so the horizon is the same length of real time whatever
     * the interval -- twelve monthly periods, four quarters, or one year.
     */
    public int periodsPerYear() {
        return 12 / months;
    }
}
