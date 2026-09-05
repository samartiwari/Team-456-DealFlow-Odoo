package com.dealflow.common;

import org.springframework.http.HttpStatus;

/** Carries the status and the field so the handler can emit a uniform error body. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String field;

    public ApiException(HttpStatus status, String message, String field) {
        super(message);
        this.status = status;
        this.field = field;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getField() {
        return field;
    }

    public static ApiException notFound(String what, Object id) {
        return new ApiException(HttpStatus.NOT_FOUND, what + " " + id + " not found.", null);
    }

    /** A business guard tripped -- not a bug. The screen stays, the message shows. */
    public static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, message, null);
    }

    public static ApiException invalid(String message, String field) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, message, field);
    }
}
