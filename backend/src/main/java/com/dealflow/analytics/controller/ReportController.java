package com.dealflow.analytics.controller;

import com.dealflow.analytics.dto.ReportQuery;
import com.dealflow.analytics.dto.ReportResultResponse;
import com.dealflow.analytics.service.PdfReportWriter;
import com.dealflow.analytics.service.ReportService;
import com.dealflow.common.error.ApiException;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
    private final PdfReportWriter pdf;

    public ReportController(ReportService service, PdfReportWriter pdf) {
        this.service = service;
        this.pdf = pdf;
    }

    @GetMapping
    public ReportResultResponse run(@RequestParam(required = false) String from,
                                    @RequestParam(required = false) String to,
                                    @RequestParam(required = false) Long repId,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(required = false) Long categoryId,
                                    @RequestParam long userId) {
        return service.run(new ReportQuery(from, to, repId, status, categoryId), userId);
    }

    /** XLS is the documented cut; anything but pdf is refused rather than quietly ignored. */
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam(defaultValue = "pdf") String format,
                                         @RequestParam(required = false) String from,
                                         @RequestParam(required = false) String to,
                                         @RequestParam(required = false) Long repId,
                                         @RequestParam(required = false) String status,
                                         @RequestParam(required = false) Long categoryId,
                                         @RequestParam long userId) {
        if (!"pdf".equalsIgnoreCase(format)) {
            throw ApiException.invalid("Only pdf is available; xls was not built.", "format");
        }

        ReportQuery query = new ReportQuery(from, to, repId, status, categoryId);
        byte[] body = pdf.write(service.run(query, userId));

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"dealflow-report.pdf\"")
                .body(body);
    }
}
