package com.dealflow.analytics.service;

import com.dealflow.analytics.model.AlertSeverity;
import com.dealflow.analytics.model.AlertType;
import com.dealflow.analytics.model.DealHealthAlert;
import com.dealflow.analytics.repository.DealHealthAlertRepository;
import com.dealflow.quotation.model.Quotation;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inserts one alert, in a transaction of its own.
 *
 * <p>Separate so that a duplicate losing the race against the unique index rolls back only
 * itself. Left inline, a single collision would mark the whole dashboard load for rollback
 * and every other alert found in that pass would be lost with it.
 */
@Component
public class AlertRaiser {

    private final DealHealthAlertRepository alerts;

    public AlertRaiser(DealHealthAlertRepository alerts) {
        this.alerts = alerts;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void raise(Quotation quotation, AlertType type, AlertSeverity severity,
                      String explanation, String payloadJson) {
        try {
            alerts.save(new DealHealthAlert(quotation, type, severity, explanation, payloadJson));
        } catch (DataIntegrityViolationException alreadyOpen) {
            // The index did its job: this alert is already on the board.
        }
    }
}
