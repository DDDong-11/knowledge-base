package com.dongzhiwei.kb.web;

import com.dongzhiwei.kb.domain.SnippetKind;
import com.dongzhiwei.kb.dto.*;
import com.dongzhiwei.kb.search.SearchService;
import com.dongzhiwei.kb.service.SnippetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/snippets")
@Validated
public class SnippetController {

    private final SnippetService snippetService;
    private final SearchService searchService;

    public SnippetController(SnippetService snippetService, SearchService searchService) {
        this.snippetService = snippetService;
        this.searchService = searchService;
    }

    @PostMapping
    public ResponseEntity<SnippetResponse> create(@Valid @RequestBody SnippetRequest req) {
        SnippetResponse created = snippetService.create(req);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}")
                .buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @GetMapping("/{id}")
    public SnippetResponse get(@PathVariable Long id) {
        return snippetService.get(id);
    }

    @PutMapping("/{id}")
    public SnippetResponse update(@PathVariable Long id, @Valid @RequestBody SnippetRequest req) {
        return snippetService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        snippetService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public PageResponse<SnippetResponse> list(@RequestParam(defaultValue = "0") @Min(0) int page,
                                              @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
                                              @RequestParam(required = false) SnippetKind kind) {
        return snippetService.list(page, size, kind);
    }

    @GetMapping("/search")
    public SearchResponse search(@RequestParam @NotBlank @Size(max = 200) String q,
                                 @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit,
                                 @RequestParam(required = false) SnippetKind kind) {
        List<SearchHit> hits = searchService.search(q, limit, kind);
        return new SearchResponse(q, hits.size(), hits);
    }
}
