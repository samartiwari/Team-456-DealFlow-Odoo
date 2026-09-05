package com.dealflow.billing.service;

import com.dealflow.common.config.SystemConfigService;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Closes every period that has come due, once a night.
 *
 * <p>Calls exactly the method the admin's advance-clock action calls. The only difference
 * is where the date comes from, which is the point: the demo exercises the production job
 * rather than something that merely resembles it.
 */
@Component
public class NightlyBillingJob {

    private final BillingService billing;
    private final SystemConfigService config;

    public NightlyBillingJob(BillingService billing, SystemConfigService config) {
        this.billing = billing;
        this.config = config;
    }

    /** 02:00 daily. Re-running it bills nothing twice. */
    @Scheduled(cron = "0 0 2 * * *")
    public void closeDuePeriods() {
        billing.closePeriodsUpTo(config.billingToday());
    }
}
