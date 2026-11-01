package com.dongzhiwei.kb.web;

import com.dongzhiwei.kb.service.SnippetService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class MetaController {

    private final SnippetService snippetService;
    private final String appName;

    public MetaController(SnippetService snippetService, @Value("${spring.application.name}") String appName) {
        this.snippetService = snippetService;
        this.appName = appName;
    }

    /** Electron 启动时探活 */
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP", "app", appName);
    }

    @GetMapping("/tags")
    public List<String> tags() {
        return snippetService.allTags();
    }
}
