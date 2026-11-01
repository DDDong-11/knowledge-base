package com.dongzhiwei.kb.dto;

import com.dongzhiwei.kb.domain.SnippetKind;
import com.dongzhiwei.kb.domain.SnippetSource;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 新建 / 更新请求体。
 * <ul>
 *   <li>{@code kind}：可选；新建缺省为 NOTE，更新缺省时保留原值。</li>
 *   <li>{@code source}：可选；仅新建时生效（缺省 MANUAL），更新时忽略。</li>
 * </ul>
 */
public record SnippetRequest(
        @NotBlank(message = "title is required")
        @Size(max = 200, message = "title must be at most 200 characters")
        String title,

        @Size(max = 1_000_000, message = "content must be at most 1000000 characters")
        String content,

        @Size(max = 20, message = "at most 20 tags")
        List<@Size(max = 40, message = "each tag must be at most 40 characters") String> tags,

        SnippetKind kind,

        SnippetSource source
) {
    public SnippetRequest(String title, String content, List<String> tags) {
        this(title, content, tags, null, null);
    }
}
