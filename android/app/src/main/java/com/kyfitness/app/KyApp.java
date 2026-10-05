package com.kyfitness.app;

import android.app.Application;
import android.content.Context;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Writes any crash to a private file on the device (never sent anywhere) so it can be viewed in Settings. */
public class KyApp extends Application {
    static final String CRASH_FILE = "crash.log";
    private static final int MAX_BYTES = 40_000;

    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                StringWriter sw = new StringWriter();
                error.printStackTrace(new PrintWriter(sw));
                String stamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
                File f = new File(getFilesDir(), CRASH_FILE);
                try (FileWriter w = new FileWriter(f, true)) {
                    w.write("[" + stamp + "] thread " + thread.getName() + "\n" + sw + "\n");
                }
                if (f.length() > MAX_BYTES) trim(f);
            } catch (Exception ignored) {
                // never let logging hide the original crash
            }
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    private static void trim(File f) throws java.io.IOException {
        byte[] all = java.nio.file.Files.readAllBytes(f.toPath());
        int keep = MAX_BYTES / 2;
        java.nio.file.Files.write(f.toPath(), java.util.Arrays.copyOfRange(all, all.length - keep, all.length));
    }

    static File crashFile(Context c) {
        return new File(c.getFilesDir(), CRASH_FILE);
    }
}