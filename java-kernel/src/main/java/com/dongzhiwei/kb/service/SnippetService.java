package com.dongzhiwei.kb.service;

import com.dongzhiwei.kb.domain.Snippet;
import com.dongzhiwei.kb.dto.PageResponse;
import com.dongzhiwei.kb.dto.SnippetRequest;
import com.dongzhiwei.kb.dto.SnippetResponse;
import com.dongzhiwei.kb.repository.SnippetRepository;
import com.dongzhiwei.kb.support.TagNormalizer;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@Transactional
public class SnippetService {

    private final SnippetRepository repository;
    private final Clock clock;

    public SnippetService(SnippetRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public SnippetResponse create(SnippetRequest req) {
        Snippet s = new Snippet();
        apply(s, req);
        LocalDateTime now = now();
        s.setCreateTime(now);
        s.setUpdateTime(now);
        return SnippetResponse.from(repository.save(s));
    }

    @Transactional(readOnly = true)
    public SnippetResponse get(Long id) {
        return SnippetResponse.from(load(id));
    }

    public SnippetResponse update(Long id, SnippetRequest req) {
        Snippet s = load(id);
        apply(s, req);
        s.setUpdateTime(now());
        return SnippetResponse.from(repository.saveAndFlush(s));
    }

    public void delete(Long id) {
        repository.delete(load(id));
    }

    @Transactional(readOnly = true)
    public PageResponse<SnippetResponse> list(int page, int size) {
        Sort sort = Sort.by(Sort.Order.desc("updateTime"), Sort.Order.desc("id"));
        return PageResponse.of(repository.findAll(PageRequest.of(page, size, sort)), SnippetResponse::from);
    }

    /** 所有标签去重（大小写不敏感，保留首个写法的小写形式）并排序 */
    @Transactional(readOnly = true)
    public List<String> allTags() {
        SortedSet<String> out = new TreeSet<>();
        for (String stored : repository.findAllTagStrings()) {
            for (String t : TagNormalizer.split(stored)) out.add(t.toLowerCase(Locale.ROOT));
        }
        return List.copyOf(out);
    }

    /** 截断到微秒，与数据库 TIMESTAMP(6) 精度一致，避免返回值与回读值不一致 */
    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.MICROS);
    }

    private Snippet load(Long id) {
        return repository.findById(id).orElseThrow(() -> new SnippetNotFoundException(id));
    }

    private static void apply(Snippet s, SnippetRequest req) {
        s.setTitle(req.title().trim());
        s.setContent(req.content() == null ? "" : req.content());
        s.setTags(TagNormalizer.join(TagNormalizer.normalize(req.tags())));
    }
}
