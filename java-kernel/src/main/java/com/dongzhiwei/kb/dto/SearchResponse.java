package com.dongzhiwei.kb.dto;

import java.util.List;

public record SearchResponse(String query, int total, List<SearchHit> hits) {}
