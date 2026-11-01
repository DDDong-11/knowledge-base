package com.dongzhiwei.kb.web;

import com.dongzhiwei.kb.repository.SnippetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TokenAuthFilterTest {

    @Nested
    @SpringBootTest
    @AutoConfigureMockMvc
    @ActiveProfiles("test")
    class WhenTokenUnset {
        @Autowired MockMvc mvc;
        @Autowired SnippetRepository repository;

        @BeforeEach
        void clean() {
            repository.deleteAll();
        }

        @Test
        void healthAndCreateWorkWithoutHeader() throws Exception {
            mvc.perform(get("/api/health"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("UP"));

            mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"title\":\"t\",\"content\":\"c\",\"tags\":[]}"))
                    .andExpect(status().isCreated());
        }
    }

    @Nested
    @SpringBootTest
    @AutoConfigureMockMvc
    @ActiveProfiles("test")
    @TestPropertySource(properties = "kb.token=test-secret-token")
    class WhenTokenConfigured {
        @Autowired MockMvc mvc;
        @Autowired SnippetRepository repository;

        @BeforeEach
        void clean() {
            repository.deleteAll();
        }

        @Test
        void missingTokenReturns401UnauthorizedShape() throws Exception {
            mvc.perform(get("/api/health"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                    .andExpect(jsonPath("$.status").value(401))
                    .andExpect(jsonPath("$.error").value("UNAUTHORIZED"))
                    .andExpect(jsonPath("$.message", containsString("token")))
                    .andExpect(jsonPath("$.path").value("/api/health"))
                    .andExpect(jsonPath("$.timestamp").exists());
        }

        @Test
        void wrongTokenReturns401() throws Exception {
            mvc.perform(get("/api/health").header("X-KB-Token", "nope"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("UNAUTHORIZED"));
        }

        @Test
        void matchingTokenAllowsHealthAndCreate() throws Exception {
            mvc.perform(get("/api/health").header("X-KB-Token", "test-secret-token"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("UP"))
                    .andExpect(jsonPath("$.app").value("kb-kernel"));

            mvc.perform(post("/api/snippets").header("X-KB-Token", "test-secret-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"title\":\"secured\",\"content\":\"x\",\"tags\":[\"a\"]}"))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.title").value("secured"));
        }
    }
}
