package com.dongzhiwei.kb.search;

import com.dongzhiwei.kb.domain.Snippet;
import com.dongzhiwei.kb.dto.SearchHit;
import com.dongzhiwei.kb.dto.SnippetResponse;
import com.dongzhiwei.kb.repository.SnippetRepository;
import com.dongzhiwei.kb.support.TagNormalizer;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * MVP 检索：数据库 LIKE（大小写不敏感）召回候选，再在内存中按字段权重打分排序。
 * 权重：标题 &gt; 标签 &gt; 正文。
 */
@Service
@Transactional(readOnly = true)
public class LikeSearchService implements SearchService {

    /** 召回候选上限，防止大库时全量加载 */
    static final int MAX_CANDIDATES = 500;
    private static final char ESCAPE = '\\';

    private final SnippetRepository repository;

    public LikeSearchService(SnippetRepository repository) {
        this.repository = repository;
    }

    @Override
    public List<SearchHit> search(String query, int limit) {
        List<String> terms = terms(query);
        if (terms.isEmpty() || limit <= 0) return List.of();

        Sort recent = Sort.by(Sort.Order.desc("updateTime"), Sort.Order.desc("id"));
        List<Snippet> candidates = repository
                .findAll(matchAll(terms), PageRequest.of(0, MAX_CANDIDATES, recent))
                .getContent();

        List<SearchHit> hits = new ArrayList<>(candidates.size());
        for (Snippet s : candidates) {
            hits.add(score(s, terms));
        }
        // List.sort 稳定：同分保留按更新时间倒序的召回顺序
        hits.sort(Comparator.comparingDouble(SearchHit::score).reversed());
        return hits.size() > limit ? List.copyOf(hits.subList(0, limit)) : hits;
    }

    static List<String> terms(String query) {
        if (query == null || query.isBlank()) return List.of();
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String t : query.trim().split("\\s+")) {
            if (!t.isEmpty()) out.add(t.toLowerCase(Locale.ROOT));
        }
        return List.copyOf(out);
    }

    private static Specification<Snippet> matchAll(List<String> terms) {
        return (root, cq, cb) -> {
            Expression<String> title = cb.lower(root.get("title"));
            Expression<String> tags = cb.lower(cb.coalesce(root.<String>get("tags"), ""));
            Expression<String> content = cb.lower(cb.coalesce(root.<String>get("content"), ""));
            List<Predicate> all = new ArrayList<>();
            for (String term : terms) {
                String pattern = "%" + escapeLike(term) + "%";
                all.add(cb.or(
                        cb.like(title, pattern, ESCAPE),
                        cb.like(tags, pattern, ESCAPE),
                        cb.like(content, pattern, ESCAPE)));
            }
            return cb.and(all.toArray(Predicate[]::new));
        };
    }

    static String escapeLike(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (char c : s.toCharArray()) {
            if (c == '%' || c == '_' || c == ESCAPE) sb.append(ESCAPE);
            sb.append(c);
        }
        return sb.toString();
    }

    private static SearchHit score(Snippet s, List<String> terms) {
        String title = lower(s.getTitle());
        String content = lower(s.getContent());
        List<String> tagList = TagNormalizer.split(s.getTags()).stream()
                .map(t -> t.toLowerCase(Locale.ROOT)).toList();

        double score = 0;
        Set<String> fields = new LinkedHashSet<>();
        for (String term : terms) {
            if (title.contains(term)) {
                fields.add("title");
                score += 100;
                if (title.equals(term)) score += 50;
                else if (title.startsWith(term)) score += 20;
            }
            if (tagList.contains(term)) {
                fields.add("tags");
                score += 40;
            } else if (tagList.stream().anyMatch(t -> t.contains(term))) {
                fields.add("tags");
                score += 20;
            }
            int occurrences = count(content, term);
            if (occurrences > 0) {
                fields.add("content");
                score += 5 + Math.min(occurrences, 5);
            }
        }
        return new SearchHit(SnippetResponse.from(s), score, List.copyOf(fields));
    }

    private static String lower(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT);
    }

    private static int count(String haystack, String needle) {
        int n = 0;
        for (int i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length())) n++;
        return n;
    }
}
