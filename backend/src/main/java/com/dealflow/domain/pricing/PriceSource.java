package com.dealflow.domain.pricing;

/** Which layer settled a price. Carried out so a quote can explain itself. */
public enum PriceSource {
    BASE, VARIANT, PRICE_LIST,
    /** No layer won: the line was frozen at confirm and no longer follows the catalog. */
    SNAPSHOT
}
