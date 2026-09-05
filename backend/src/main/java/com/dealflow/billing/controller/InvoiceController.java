package com.dealflow.billing.controller;

import com.dealflow.billing.dto.InvoiceResponse;
import com.dealflow.billing.dto.RecordPaymentRequest;
import com.dealflow.billing.service.BillingService;

import java.util.List;

import jakarta.validation.Valid;

import com.dealflow.identity.security.CurrentUser;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/invoices")
public class InvoiceController {

    private final BillingService service;
    private final CurrentUser currentUser;

    public InvoiceController(BillingService service, CurrentUser currentUser) {
        this.currentUser = currentUser;
        this.service = service;
    }

    @GetMapping
    public List<InvoiceResponse> list() {
        return service.listInvoices();
    }

    @GetMapping("/{id}")
    public InvoiceResponse detail(@PathVariable long id) {
        return service.invoice(id);
    }

    /** The status is not in the request body on purpose -- it is recomputed from payments. */
    @PostMapping("/{id}/payments")
    public InvoiceResponse recordPayment(@PathVariable long id,
                                         @Valid @RequestBody RecordPaymentRequest request) {
        return service.recordPayment(id, request, currentUser.id());
    }

    /**
     * Screen 13's Download Invoice.
     *
     * <p>A blob with an attachment disposition, so a plain anchor is enough on
     * the client -- no fetch, no object URL to revoke.
     */
    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable long id) {
        InvoiceResponse invoice = service.invoice(id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + invoice.ref() + ".pdf\"")
                .body(service.invoicePdf(id));
    }
}
