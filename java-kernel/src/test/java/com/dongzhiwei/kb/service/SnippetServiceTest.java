package com.dongzhiwei.kb.service;

import com.dongzhiwei.kb.domain.SnippetKind;
import com.dongzhiwei.kb.domain.SnippetSource;
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

    @Test
    void defaultsKindNoteAndSourceManual() {
        SnippetResponse r = service.create(new SnippetRequest("t", "c", null));
        assertThat(r.kind()).isEqualTo(SnippetKind.NOTE);
        assertThat(r.source()).isEqualTo(SnippetSource.MANUAL);
    }

    @Test
    void createHonoursExplicitKindAndSource() {
        SnippetResponse r = service.create(new SnippetRequest("t", "c", null, SnippetKind.CLIP, SnippetSource.CLIPBOARD));
        assertThat(r.kind()).isEqualTo(SnippetKind.CLIP);
        assertThat(r.source()).isEqualTo(SnippetSource.CLIPBOARD);
        assertThat(service.get(r.id()).kind()).isEqualTo(SnippetKind.CLIP);
    }

    @Test
    void updateWithoutKindKeepsKindAndSourceIsImmutable() {
        SnippetResponse c = service.create(new SnippetRequest("t", "c", null, SnippetKind.CODE, SnippetSource.ALMA));
        SnippetResponse u = service.update(c.id(), new SnippetRequest("t2", "c2", null, null, SnippetSource.CLIPBOARD));
        assertThat(u.kind()).isEqualTo(SnippetKind.CODE);
        assertThat(u.source()).isEqualTo(SnippetSource.ALMA);
        assertThat(service.get(c.id()).source()).isEqualTo(SnippetSource.ALMA);
        SnippetResponse u2 = service.update(c.id(), new SnippetRequest("t3", "c3", null, SnippetKind.CLIP, null));
        assertThat(u2.kind()).isEqualTo(SnippetKind.CLIP);
    }

    @Test
    void listFiltersByKind() {
        service.create(new SnippetRequest("a", "", null, SnippetKind.CODE, null));
        service.create(new SnippetRequest("b", "", null));
        assertThat(service.list(0, 20, SnippetKind.CODE).items()).extracting(SnippetResponse::title).containsExactly("a");
        assertThat(service.list(0, 20, SnippetKind.CODE).totalElements()).isEqualTo(1);
        assertThat(service.list(0, 20, null).items()).hasSize(2);
    }
}
