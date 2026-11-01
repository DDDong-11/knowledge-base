package com.dongzhiwei.kb.web;

import com.dongzhiwei.kb.repository.SnippetRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SnippetControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired SnippetRepository repository;
    @Autowired Environment env;

    @BeforeEach
    void clean() { repository.deleteAll(); }

    private long create(String title, String content, String tagsJson) throws Exception {
        String body = "{\"title\":" + om.writeValueAsString(title) + ",\"content\":" + om.writeValueAsString(content)
                + ",\"tags\":" + tagsJson + "}";
        String json = mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern(".*/api/snippets/\\d+")))
                .andReturn().getResponse().getContentAsString();
        JsonNode node = om.readTree(json);
        return node.get("id").asLong();
    }

    @Test
    void crudRoundTrip() throws Exception {
        long id = create("Hello", "System.out.println(1);", "[\" java \",\"java\",\"\"]");

        mvc.perform(get("/api/snippets/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Hello"))
                .andExpect(jsonPath("$.content").value("System.out.println(1);"))
                .andExpect(jsonPath("$.tags", contains("java")))
                .andExpect(jsonPath("$.createTime").exists())
                .andExpect(jsonPath("$.updateTime").exists());

        mvc.perform(put("/api/snippets/{id}", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Hello2\",\"content\":\"x\",\"tags\":[\"a\",\"b\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Hello2"))
                .andExpect(jsonPath("$.tags", contains("a", "b")));

        mvc.perform(delete("/api/snippets/{id}", id)).andExpect(status().isNoContent());
        mvc.perform(get("/api/snippets/{id}", id)).andExpect(status().isNotFound());
    }

    @Test
    void missingIdGives404WithUniformErrorBody() throws Exception {
        mvc.perform(get("/api/snippets/424242"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.error").value("NOT_FOUND"))
                .andExpect(jsonPath("$.message", containsString("424242")))
                .andExpect(jsonPath("$.path").value("/api/snippets/424242"))
                .andExpect(jsonPath("$.timestamp").exists());
        mvc.perform(delete("/api/snippets/424242")).andExpect(status().isNotFound());
        mvc.perform(put("/api/snippets/424242").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"t\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void validationErrors() throws Exception {
        mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"  \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("title"));

        String longTitle = "x".repeat(201);
        mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + longTitle + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[0].field").value("title"));

        mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("MALFORMED_REQUEST"));

        mvc.perform(get("/api/snippets/abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("BAD_REQUEST"));
    }

    @Test
    void listIsPagedNewestUpdatedFirst() throws Exception {
        long a = create("a", "", "[]");
        long b = create("b", "", "[]");
        long c = create("c", "", "[]");
        Thread.sleep(5);
        mvc.perform(put("/api/snippets/{id}", a).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"a2\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/snippets").param("page", "0").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", contains((int) a, (int) c)))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2));
        mvc.perform(get("/api/snippets").param("page", "1").param("size", "2"))
                .andExpect(jsonPath("$.items[*].id", contains((int) b)));
        mvc.perform(get("/api/snippets").param("size", "0")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/snippets").param("size", "101")).andExpect(status().isBadRequest());
    }

    @Test
    void searchEndpointRanksAndRequiresQuery() throws Exception {
        long content = create("x", "redis ttl", "[]");
        long title = create("Redis 命令", "y", "[]");
        mvc.perform(get("/api/snippets/search").param("q", "REDIS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("REDIS"))
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.hits[*].snippet.id", contains((int) title, (int) content)))
                .andExpect(jsonPath("$.hits[0].matchedFields", hasItem("title")));
        mvc.perform(get("/api/snippets/search")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/snippets/search").param("q", "redis").param("limit", "0"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void tagsEndpoint() throws Exception {
        create("1", "", "[\"java\",\"spring\"]");
        create("2", "", "[\"git\",\"Java\"]");
        mvc.perform(get("/api/tags"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", contains("git", "java", "spring")));
    }

    @Test
    void healthEndpoint() throws Exception {
        mvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.app").value("kb-kernel"));
    }

    @Test
    void noCorsHeadersForBrowserOrigins() throws Exception {
        mvc.perform(get("/api/health").header("Origin", "http://evil.example"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        mvc.perform(options("/api/snippets").header("Origin", "http://evil.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void serverBindsToLoopbackByDefault() {
        assertThat(env.getProperty("server.address")).isEqualTo("127.0.0.1");
        assertThat(env.getProperty("server.port")).isEqualTo("17321");
    }

    @Test
    void kindAndSourceRoundTripAndFilters() throws Exception {
        mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"docker prune\",\"content\":\"docker system prune\",\"kind\":\"CODE\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("CODE"))
                .andExpect(jsonPath("$.source").value("MANUAL"));
        long note = create("docker note", "remember", "[]");
        mvc.perform(get("/api/snippets/{id}", note))
                .andExpect(jsonPath("$.kind").value("NOTE"))
                .andExpect(jsonPath("$.source").value("MANUAL"));
        mvc.perform(get("/api/snippets").param("kind", "CODE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].kind").value("CODE"))
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/snippets"))
                .andExpect(jsonPath("$.items", hasSize(2)));
        mvc.perform(get("/api/snippets/search").param("q", "docker").param("kind", "NOTE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.hits[0].snippet.kind").value("NOTE"));
        mvc.perform(get("/api/snippets/search").param("q", "docker"))
                .andExpect(jsonPath("$.total").value(2));
    }

    @Test
    void putWithoutKindKeepsKindAndIgnoresSource() throws Exception {
        String json = mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t\",\"kind\":\"CODE\",\"source\":\"ALMA\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.source").value("ALMA"))
                .andReturn().getResponse().getContentAsString();
        long id = om.readTree(json).get("id").asLong();
        mvc.perform(put("/api/snippets/{id}", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t2\",\"source\":\"MANUAL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("CODE"))
                .andExpect(jsonPath("$.source").value("ALMA"));
        mvc.perform(put("/api/snippets/{id}", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t3\",\"kind\":\"NOTE\"}"))
                .andExpect(jsonPath("$.kind").value("NOTE"));
    }

    @Test
    void badEnumGives400BadRequestListingAllowedValues() throws Exception {
        mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t\",\"kind\":\"BOGUS\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.message", allOf(containsString("BOGUS"), containsString("kind"),
                        containsString("CODE, NOTE, CLIP"))));
        mvc.perform(post("/api/snippets").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t\",\"source\":\"WEB\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.message", containsString("MANUAL, CLIPBOARD, ALMA")));
        mvc.perform(get("/api/snippets").param("kind", "bogus"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.message", allOf(containsString("kind"), containsString("CODE, NOTE, CLIP"))));
        mvc.perform(get("/api/snippets/search").param("q", "x").param("kind", "nope"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("BAD_REQUEST"));
    }
}
