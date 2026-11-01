package com.dongzhiwei.kb.dto;

import com.dongzhiwei.kb.domain.Snippet;
import com.dongzhiwei.kb.support.TagNormalizer;

import java.time.LocalDateTime;
import java.util.List;

public record SnippetResponse(Long id, String title, String content, List<String> tags,
                              LocalDateTime createTime, LocalDateTime updateTime) {
    public static SnippetResponse from(Snippet s) {
        return new SnippetResponse(s.getId(), s.getTitle(), s.getContent(), TagNormalizer.split(s.getTags()),
                s.getCreateTime(), s.getUpdateTime());
    }
}
