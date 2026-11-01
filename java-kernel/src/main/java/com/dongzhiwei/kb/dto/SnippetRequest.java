package com.dongzhiwei.kb.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SnippetRequest(
        @NotBlank(message = "title is required")
        @Size(max = 200, message = "title must be at most 200 characters")
        String title,

        @Size(max = 1_000_000, message = "content must be at most 1000000 characters")
        String content,

        @Size(max = 20, message = "at most 20 tags")
        List<@Size(max = 40, message = "each tag must be at most 40 characters") String> tags
) {}
