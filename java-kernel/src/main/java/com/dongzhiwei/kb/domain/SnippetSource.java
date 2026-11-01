package com.dongzhiwei.kb.domain;

/** 条目来源，创建时确定、之后不可修改。未指定时默认 {@link #MANUAL}。 */
public enum SnippetSource {
    MANUAL, CLIPBOARD, ALMA
}
