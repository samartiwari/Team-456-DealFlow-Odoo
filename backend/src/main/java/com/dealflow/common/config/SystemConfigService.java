package com.dealflow.common.config;

import com.dealflow.domain.risk.RiskWeights;

import java.math.BigDecimal;
import java.util.Map;
import java.util.stream.Collectors;


import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads every tunable constant out of {@code system_config}.
 *
 * <p>Deliberately re-read on each call rather than cached at startup: it is four rows, and it
 * means changing a band in the database re-routes the very next quotation with no restart.
 */
@Service
public class SystemConfigService {

    static final String WEIGHT_WEIGHTED = "risk.weight.weighted";
    static final String WEIGHT_MAX = "risk.weight.max";
    static final String BAND_MANAGER_MIN = "approval.band.manager.min";
    static final String BAND_FINANCE_MIN = "approval.band.finance.min";

    /**
     * The date billing considers "today". Empty means the real one, which is what
     * production runs on; the demo's advance-clock action moves it forward so twelve
     * future periods can be made to fall due inside five minutes.
     */
    static final String BILLING_CLOCK = "billing.clock";

    private final SystemConfigRepository repository;

    public SystemConfigService(SystemConfigRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public RiskWeights riskWeights() {
        Map<String, String> config = repository.findAll().stream()
                .collect(Collectors.toMap(SystemConfig::getKey, SystemConfig::getValue));

        return new RiskWeights(
                decimal(config, WEIGHT_WEIGHTED),
                decimal(config, WEIGHT_MAX),
                integer(config, BAND_MANAGER_MIN),
                integer(config, BAND_FINANCE_MIN));
    }

    /**
     * Writes the four risk rows back. Kept here rather than exposing the repository so the
     * key names stay in one place -- nothing outside this class needs to know them.
     */
    @Transactional
    public void writeRiskWeights(RiskWeights next) {
        put(WEIGHT_WEIGHTED, next.weighted().stripTrailingZeros().toPlainString());
        put(WEIGHT_MAX, next.max().stripTrailingZeros().toPlainString());
        put(BAND_MANAGER_MIN, Integer.toString(next.managerBandMin()));
        put(BAND_FINANCE_MIN, Integer.toString(next.financeBandMin()));
    }

    private void put(String key, String value) {
        SystemConfig row = repository.findById(key).orElseThrow(() -> new IllegalStateException(
                "Missing system_config row '" + key + "'. Business constants are never Java literals, "
                        + "so the application cannot create one on the fly."));
        row.setValue(value);
        repository.save(row);
    }

    /** The real date unless someone has wound the billing clock forward. */
    @Transactional(readOnly = true)
    public java.time.LocalDate billingToday() {
        String value = repository.findById(BILLING_CLOCK).map(SystemConfig::getValue).orElse("");
        return value == null || value.isBlank()
                ? java.time.LocalDate.now()
                : java.time.LocalDate.parse(value);
    }

    @Transactional
    public void setBillingClock(java.time.LocalDate date) {
        put(BILLING_CLOCK, date.toString());
    }

    private static BigDecimal decimal(Map<String, String> config, String key) {
        return new BigDecimal(require(config, key));
    }

    private static int integer(Map<String, String> config, String key) {
        return Integer.parseInt(require(config, key));
    }

    private static String require(Map<String, String> config, String key) {
        String value = config.get(key);
        if (value == null) {
            throw new IllegalStateException(
                    "Missing system_config row '" + key + "'. Business constants are never Java literals, "
                            + "so the application cannot fall back to one.");
        }
        return value;
    }
}
