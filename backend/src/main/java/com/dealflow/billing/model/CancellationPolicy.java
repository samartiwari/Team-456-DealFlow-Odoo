package com.dealflow.billing.model;

/** What cancelling does to the period the customer is in the middle of. */
public enum CancellationPolicy {
    /** Runs to the end of the period already paid for, then stops. Nothing is credited. */
    END_OF_PERIOD,
    /** Stops now, and the unused remainder comes back as a credit note. */
    IMMEDIATE_WITH_CREDIT,
    /** Stops now, and the remainder of the period is kept. */
    IMMEDIATE_NO_CREDIT
}
