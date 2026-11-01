package com.dongzhiwei.kb.web;

import com.dongzhiwei.kb.dto.ErrorResponse;
import com.dongzhiwei.kb.service.SnippetNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.OffsetDateTime;
import java.util.List;

/** 统一 JSON 错误体：{timestamp,status,error,message,path,fieldErrors?} */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(SnippetNotFoundException.class)
    ResponseEntity<ErrorResponse> notFound(SnippetNotFoundException e, HttpServletRequest req) {
        return body(HttpStatus.NOT_FOUND, "NOT_FOUND", e.getMessage(), req, null);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ErrorResponse> noRoute(NoResourceFoundException e, HttpServletRequest req) {
        return body(HttpStatus.NOT_FOUND, "NOT_FOUND", "no such endpoint", req, null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorResponse> invalidBody(MethodArgumentNotValidException e, HttpServletRequest req) {
        List<ErrorResponse.FieldError> fields = e.getBindingResult().getFieldErrors().stream()
                .map(f -> new ErrorResponse.FieldError(f.getField(), f.getDefaultMessage()))
                .toList();
        return body(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "request validation failed", req, fields);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ErrorResponse> invalidParams(HandlerMethodValidationException e, HttpServletRequest req) {
        List<ErrorResponse.FieldError> fields = e.getParameterValidationResults().stream()
                .flatMap(r -> r.getResolvableErrors().stream().map(err -> new ErrorResponse.FieldError(
                        r.getMethodParameter().getParameterName(), err.getDefaultMessage())))
                .toList();
        return body(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "request validation failed", req, fields);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ErrorResponse> constraint(ConstraintViolationException e, HttpServletRequest req) {
        List<ErrorResponse.FieldError> fields = e.getConstraintViolations().stream()
                .map(v -> new ErrorResponse.FieldError(v.getPropertyPath().toString(), v.getMessage()))
                .toList();
        return body(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "request validation failed", req, fields);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErrorResponse> unreadable(HttpMessageNotReadableException e, HttpServletRequest req) {
        return body(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "request body is missing or not valid JSON", req, null);
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ErrorResponse> badParam(Exception e, HttpServletRequest req) {
        return body(HttpStatus.BAD_REQUEST, "BAD_REQUEST", e.getMessage(), req, null);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ErrorResponse> method(HttpRequestMethodNotSupportedException e, HttpServletRequest req) {
        return body(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", e.getMessage(), req, null);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ErrorResponse> mediaType(HttpMediaTypeNotSupportedException e, HttpServletRequest req) {
        return body(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", e.getMessage(), req, null);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorResponse> unexpected(Exception e, HttpServletRequest req) {
        log.error("unhandled error on {} {}", req.getMethod(), req.getRequestURI(), e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "internal error", req, null);
    }

    private static ResponseEntity<ErrorResponse> body(HttpStatus status, String code, String message,
                                                      HttpServletRequest req, List<ErrorResponse.FieldError> fields) {
        return ResponseEntity.status(status).body(new ErrorResponse(OffsetDateTime.now(), status.value(), code,
                message, req.getRequestURI(), fields));
    }
}
