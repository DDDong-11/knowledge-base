package com.dongzhiwei.kb.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class PortReporterTest {

    @TempDir Path temp;

    @Test
    void writePortFileOverwritesWithDigits() throws Exception {
        Path portFile = temp.resolve("nested/kb.port");
        PortReporter.writePortFile(portFile.toString(), 18080);
        PortReporter.writePortFile(portFile.toString(), 19090);
        assertThat(Files.readString(portFile, StandardCharsets.UTF_8).trim()).isEqualTo("19090");
    }

    @Test
    void writePortFileNoOpWhenPathBlank() throws Exception {
        PortReporter.writePortFile("  ", 1);
        PortReporter.writePortFile(null, 1);
    }
}
