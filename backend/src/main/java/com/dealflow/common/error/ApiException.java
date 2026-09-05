package com.dealflow.common.error;

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

    /**
     * No usable credential at all -- distinct from having one that is not permitted.
     *
     * <p>Portal messages here are deliberately identical whether a link is unknown, spent
     * or expired: telling them apart would confirm to a stranger that a link once existed.
     */
    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, message, null);
    }

    /** The actor is known but holds no authority to do this. Distinct from a state conflict. */
    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, message, null);
    }

    public static ApiException invalid(String message, String field) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, message, field);
    }
}
