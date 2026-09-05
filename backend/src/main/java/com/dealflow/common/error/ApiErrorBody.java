package com.dealflow.common.error;

/** Every non-2xx response has this shape. */
public record ApiErrorBody(int status, String message, String field) {}
