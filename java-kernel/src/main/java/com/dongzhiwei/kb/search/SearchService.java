package com.dongzhiwei.kb.search;

import com.dongzhiwei.kb.domain.SnippetKind;
import com.dongzhiwei.kb.dto.SearchHit;

import java.util.List;

/**
 * 全文检索抽象。MVP 实现为 {@link LikeSearchService}（数据库 LIKE 模糊匹配），
 * 后续可替换为 Lucene 实现而不影响 Controller。
 */
public interface SearchService {

    /**
     * @param query 用户输入，按空白拆分为多个词，所有词都需命中（AND）
     * @param limit 最多返回条数
     * @param kind  只返回该类型；null 表示不过滤（额外的 AND 条件，不影响打分）
     * @return 按匹配度降序（title &gt; tags &gt; content），同分按更新时间倒序
     */
    List<SearchHit> search(String query, int limit, SnippetKind kind);

    /** 不按类型过滤 */
    default List<SearchHit> search(String query, int limit) {
        return search(query, limit, null);
    }
}
