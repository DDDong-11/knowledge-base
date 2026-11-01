package com.dongzhiwei.kb.service;

public class SnippetNotFoundException extends RuntimeException {
    public SnippetNotFoundException(Long id) {
        super("snippet " + id + " not found");
    }
}
