package com.dongzhiwei.kb.service;

import com.dongzhiwei.kb.dto.SnippetRequest;
import com.dongzhiwei.kb.dto.SnippetResponse;
import com.dongzhiwei.kb.repository.SnippetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
class SnippetServiceTest {

    @Autowired SnippetService service;
    @Autowired SnippetRepository repository;

    @BeforeEach
    void clean() { repository.deleteAll(); }

    @Test
    void createSetsTimestampsAndNormalizesTags() {
        SnippetResponse r = service.create(new SnippetRequest("  Hello  ", "body", List.of(" a ", "a", "", "b")));
        assertThat(r.id()).isNotNull();
        assertThat(r.title()).isEqualTo("Hello");
        assertThat(r.tags()).containsExactly("a", "b");
        assertThat(r.createTime()).isNotNull();
        assertThat(r.updateTime()).isEqualTo(r.createTime());
    }

    @Test
    void updateBumpsUpdateTimeButKeepsCreateTime() throws Exception {
        SnippetResponse created = service.create(new SnippetRequest("t", "c", null));
        Thread.sleep(5);
        SnippetResponse updated = service.update(created.id(), new SnippetRequest("t2", "c2", List.of("x")));
        assertThat(updated.createTime()).isEqualTo(created.createTime());
        assertThat(updated.updateTime()).isAfter(created.updateTime());
        assertThat(updated.title()).isEqualTo("t2");
        assertThat(updated.tags()).containsExactly("x");
    }

    @Test
    void missingIdThrowsNotFound() {
        assertThatThrownBy(() -> service.get(999_999L)).isInstanceOf(SnippetNotFoundException.class);
        assertThatThrownBy(() -> service.delete(999_999L)).isInstanceOf(SnippetNotFoundException.class);
        assertThatThrownBy(() -> service.update(999_999L, new SnippetRequest("t", "c", null)))
                .isInstanceOf(SnippetNotFoundException.class);
    }

    @Test
    void allTagsAreDistinctAndSorted() {
        service.create(new SnippetRequest("1", "", List.of("java", "spring")));
        service.create(new SnippetRequest("2", "", List.of("Java", "git")));
        service.create(new SnippetRequest("3", "", null));
        assertThat(service.allTags()).containsExactly("git", "java", "spring");
    }
}
