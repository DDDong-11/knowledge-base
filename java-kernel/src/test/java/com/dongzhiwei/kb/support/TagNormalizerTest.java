package com.dongzhiwei.kb.support;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TagNormalizerTest {

    @Test
    void trimsDedupesAndDropsEmpty() {
        assertThat(TagNormalizer.normalize(Arrays.asList(" java ", "Spring", "", null, "java", "JAVA", "  ")))
                .containsExactly("java", "Spring");
    }

    @Test
    void splitsEmbeddedCommasIncludingFullWidth() {
        assertThat(TagNormalizer.normalize(List.of("git, shell", "踩坑，linux")))
                .containsExactly("git", "shell", "踩坑", "linux");
    }

    @Test
    void nullOrEmptyGivesEmptyList() {
        assertThat(TagNormalizer.normalize(null)).isEmpty();
        assertThat(TagNormalizer.normalize(List.of())).isEmpty();
    }

    @Test
    void joinAndSplitRoundTrip() {
        String stored = TagNormalizer.join(List.of("a", "b c"));
        assertThat(stored).isEqualTo("a,b c");
        assertThat(TagNormalizer.split(stored)).containsExactly("a", "b c");
        assertThat(TagNormalizer.split(null)).isEmpty();
        assertThat(TagNormalizer.join(List.of())).isNull();
    }
}
