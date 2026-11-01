package com.dongzhiwei.kb.support;

import java.util.*;
import java.util.regex.Pattern;

/** 标签规范化：拆分（半角/全角逗号）、trim、去空、大小写不敏感去重（保留首次出现的写法）。 */
public final class TagNormalizer {

    private static final Pattern SEP = Pattern.compile("[,，]");

    private TagNormalizer() {}

    public static List<String> normalize(Collection<String> raw) {
        if (raw == null || raw.isEmpty()) return List.of();
        Map<String, String> seen = new LinkedHashMap<>();
        for (String item : raw) {
            if (item == null) continue;
            for (String part : SEP.split(item)) {
                String t = part.trim();
                if (!t.isEmpty()) seen.putIfAbsent(t.toLowerCase(Locale.ROOT), t);
            }
        }
        return List.copyOf(seen.values());
    }

    /** 存库格式；空列表存 null */
    public static String join(List<String> tags) {
        return (tags == null || tags.isEmpty()) ? null : String.join(",", tags);
    }

    public static List<String> split(String stored) {
        if (stored == null || stored.isBlank()) return List.of();
        return normalize(List.of(stored));
    }
}
