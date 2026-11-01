package com.dongzhiwei.kb.dto;

import java.util.List;

/** 单条搜索结果：片段 + 匹配得分 + 命中字段（title / tags / content） */
public record SearchHit(SnippetResponse snippet, double score, List<String> matchedFields) {}
