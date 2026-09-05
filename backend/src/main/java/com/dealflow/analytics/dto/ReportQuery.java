package com.dealflow.analytics.dto;

/**
 * The four filters, as one object.
 *
 * <p>Every field is optional and absent means "no constraint". The same instance drives the
 * table and the export, which is the point: the brief asks for the PDF to take this object
 * rather than rebuild the filters, so an export cannot disagree with the screen that
 * produced it.
 *
 * @param status a {@code QuotationState} name, or null for any stage
 */
public record ReportQuery(String from, String to, Long repId, String status, Long categoryId) {

    /**
     * Named without the {@code is} prefix on purpose: as {@code isEmpty()} the serialiser
     * treats it as a property and adds an {@code empty} field to the echoed query, which
     * the client's type does not declare.
     */
    public boolean hasNoFilters() {
        return from == null && to == null && repId == null && status == null && categoryId == null;
    }
}
