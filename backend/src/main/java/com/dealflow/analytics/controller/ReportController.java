package com.dealflow.analytics.controller;

import com.dealflow.analytics.dto.ReportQuery;
import com.dealflow.analytics.dto.ReportResultResponse;
import com.dealflow.analytics.service.PdfReportWriter;
import com.dealflow.analytics.service.ReportService;
import com.dealflow.analytics.service.XlsxReportWriter;
import com.dealflow.common.error.ApiException;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import com.dealflow.identity.security.CurrentUser;

import org.springframework.web.bind.annotation.*;

/**
 * A7. Manager and finance only.
 *
 * <p>Both endpoints build the same {@link ReportQuery} from the same parameters and hand it
 * to the same service. That is what the brief means by an export that cannot disagree with
 * the screen: there is no second query to drift.
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService service;
    private final CurrentUser currentUser;
    private final PdfReportWriter pdf;
    private final XlsxReportWriter xlsx;

    public ReportController(ReportService service, PdfReportWriter pdf,
                            XlsxReportWriter xlsx, CurrentUser currentUser) {
        this.currentUser = currentUser;
        this.service = service;
        this.pdf = pdf;
        this.xlsx = xlsx;
    }

    @GetMapping
    public ReportResultResponse run(@RequestParam(required = false) String from,
                                    @RequestParam(required = false) String to,
                                    @RequestParam(required = false) Long repId,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(required = false) Long categoryId) {
        return service.run(new ReportQuery(from, to, repId, status, categoryId), currentUser.id());
    }

    /**
     * The same query, a different file.
     *
     * <p>{@code xls} is accepted as an alias for {@code xlsx}: the spec and the mockup both
     * say XLS, and refusing the word people were told to use would be pedantry. Anything
     * else is refused rather than quietly treated as a PDF.
     */
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam(defaultValue = "pdf") String format,
                                         @RequestParam(required = false) String from,
                                         @RequestParam(required = false) String to,
                                         @RequestParam(required = false) Long repId,
                                         @RequestParam(required = false) String status,
                                         @RequestParam(required = false) Long categoryId) {
        boolean spreadsheet = "xlsx".equalsIgnoreCase(format) || "xls".equalsIgnoreCase(format);
        if (!"pdf".equalsIgnoreCase(format) && !spreadsheet) {
            throw ApiException.invalid("format must be pdf or xlsx.", "format");
        }

        // One query object behind the table and both exports, which is what makes an export
        // unable to disagree with the screen it came from.
        ReportQuery query = new ReportQuery(from, to, repId, status, categoryId);
        ReportResultResponse report = service.run(query, currentUser.id());

        if (spreadsheet) {
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"dealflow-report.xlsx\"")
                    .body(xlsx.write(report));
        }

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"dealflow-report.pdf\"")
                .body(pdf.write(report));
    }
}
