package com.dongzhiwei.kb.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "snippet")
public class Snippet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String title;

    /**
     * 库里是 CLOB（schema.sql）。不用 @Lob：H2 的 CLOB 可按字符串读写，
     * 这样 JPQL/Criteria 的 lower()+like 可直接用于正文检索。
     */
    @Column(columnDefinition = "CHARACTER LARGE OBJECT")
    private String content;

    /** 规范化后的标签，逗号分隔 */
    @Column(length = 1000)
    private String tags;

    @Column(name = "create_time", nullable = false, updatable = false)
    private LocalDateTime createTime;

    @Column(name = "update_time", nullable = false)
    private LocalDateTime updateTime;

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }
    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }

    /** 兜底：若服务层未设置时间则自动补齐 */
    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createTime == null) createTime = now;
        if (updateTime == null) updateTime = createTime;
    }
}
