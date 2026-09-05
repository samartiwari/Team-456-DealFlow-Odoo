package com.dealflow.common;

import java.math.BigDecimal;
import java.util.Map;
import java.util.stream.Collectors;

import com.dealflow.domain.risk.RiskWeights;

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
