package com.dongzhiwei.kb.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.context.WebServerApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class PortReporter {

    private static final Logger log = LoggerFactory.getLogger(PortReporter.class);

    private final String portFile;

    public PortReporter(@Value("${kb.port-file:}") String portFile) {
        this.portFile = portFile == null ? "" : portFile;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady(ApplicationReadyEvent event) {
        if (!(event.getApplicationContext() instanceof WebServerApplicationContext webCtx)) {
            return;
        }
        int port = webCtx.getWebServer().getPort();
        System.out.println("KB_READY port=" + port);
        try {
            writePortFile(portFile, port);
        } catch (IOException e) {
            log.error("failed to write KB_PORT_FILE={}", portFile, e);
            throw new IllegalStateException("failed to write KB_PORT_FILE=" + portFile, e);
        }
    }

    static void writePortFile(String path, int port) throws IOException {
        if (path == null || path.isBlank()) {
            return;
        }
        Path file = Path.of(path);
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.writeString(file, Integer.toString(port), StandardCharsets.UTF_8);
    }
}
