package com.dongzhiwei.kb.config;

import com.dongzhiwei.kb.dto.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Objects;

@Component
public class TokenAuthFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-KB-Token";

    private final String configuredToken;
    private final ObjectMapper objectMapper;

    public TokenAuthFilter(@Value("${kb.token:}") String configuredToken, ObjectMapper objectMapper) {
        this.configuredToken = configuredToken == null ? "" : configuredToken;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null || !path.startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (configuredToken.isBlank()) {
            filterChain.doFilter(request, response);
            return;
        }
        String provided = request.getHeader(HEADER);
        if (!Objects.equals(configuredToken, provided)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            ErrorResponse body = new ErrorResponse(
                    OffsetDateTime.now(),
                    401,
                    "UNAUTHORIZED",
                    "missing or invalid token (X-KB-Token)",
                    request.getRequestURI(),
                    null);
            objectMapper.writeValue(response.getOutputStream(), body);
            return;
        }
        filterChain.doFilter(request, response);
    }
}
