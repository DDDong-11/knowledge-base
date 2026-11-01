package com.dongzhiwei.kb.search;

import com.dongzhiwei.kb.dto.SearchHit;
import com.dongzhiwei.kb.dto.SnippetRequest;
import com.dongzhiwei.kb.repository.SnippetRepository;
import com.dongzhiwei.kb.service.SnippetService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class LikeSearchServiceTest {

    @Autowired SearchService searchService;
    @Autowired SnippetService snippetService;
    @Autowired SnippetRepository repository;

    @BeforeEach
    void clean() { repository.deleteAll(); }

    private long add(String title, String content, String... tags) {
        return snippetService.create(new SnippetRequest(title, content, List.of(tags))).id();
    }

    private List<Long> ids(List<SearchHit> hits) {
        return hits.stream().map(h -> h.snippet().id()).toList();
    }

    @Test
    void searchServiceIsTheLikeImplementation() {
        assertThat(searchService).isInstanceOf(LikeSearchService.class);
    }

    @Test
    void ranksTitleOverTagsOverContent() {
        long content = add("other", "use Docker compose here");
        long tags = add("misc", "nothing", "docker");
        long title = add("Docker cheatsheet", "nothing");

        List<SearchHit> hits = searchService.search("docker", 20);

        assertThat(ids(hits)).containsExactly(title, tags, content);
        assertThat(hits.get(0).score()).isGreaterThan(hits.get(1).score());
        assertThat(hits.get(1).score()).isGreaterThan(hits.get(2).score());
        assertThat(hits.get(0).matchedFields()).contains("title");
        assertThat(hits.get(1).matchedFields()).containsExactly("tags");
        assertThat(hits.get(2).matchedFields()).containsExactly("content");
    }

    @Test
    void isCaseInsensitiveAndMatchesChinese() {
        long a = add("Git 回滚", "git reset --hard HEAD~1", "git");
        assertThat(ids(searchService.search("GIT", 20))).containsExactly(a);
        assertThat(ids(searchService.search("回滚", 20))).containsExactly(a);
    }

    @Test
    void multipleTermsMustAllMatch() {
        long both = add("kafka consumer", "spring config");
        add("kafka producer", "plain");
        assertThat(ids(searchService.search("kafka spring", 20))).containsExactly(both);
    }

    @Test
    void likeWildcardsAreTreatedLiterally() {
        long pct = add("100% coverage", "x");
        add("1000 things", "y");
        long underscore = add("snake_case", "z");
        add("snakeXcase", "w");
        assertThat(ids(searchService.search("100%", 20))).containsExactly(pct);
        assertThat(ids(searchService.search("snake_case", 20))).containsExactly(underscore);
    }

    @Test
    void searchesLargeContent() {
        String big = "x".repeat(300_000) + " needle-at-the-end";
        long id = add("big", big);
        List<SearchHit> hits = searchService.search("NEEDLE-AT-THE-END", 20);
        assertThat(ids(hits)).containsExactly(id);
        assertThat(hits.get(0).snippet().content()).hasSize(big.length());
    }

    @Test
    void blankQueryReturnsNothingAndLimitIsApplied() {
        for (int i = 0; i < 5; i++) add("note " + i, "c");
        assertThat(searchService.search("   ", 20)).isEmpty();
        assertThat(searchService.search("note", 3)).hasSize(3);
    }
}
