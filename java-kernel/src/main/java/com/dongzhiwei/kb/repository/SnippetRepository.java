package com.dongzhiwei.kb.repository;

import com.dongzhiwei.kb.domain.Snippet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface SnippetRepository extends JpaRepository<Snippet, Long>, JpaSpecificationExecutor<Snippet> {

    @Query("select s.tags from Snippet s where s.tags is not null and s.tags <> ''")
    List<String> findAllTagStrings();
}
