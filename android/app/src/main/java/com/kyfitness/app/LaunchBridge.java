package com.kyfitness.app;

import android.content.Intent;

/** Holds the action that opened the app (a widget button) until the web app collects it. */
final class LaunchBridge {
    static final String EXTRA = "ky_action";
    private static String pending = null;

    private LaunchBridge() {}

    static synchronized void capture(Intent intent) {
        if (intent == null) return;
        String a = intent.getStringExtra(EXTRA);
        if (a != null && !"open".equals(a)) pending = a;
        intent.removeExtra(EXTRA);
    }

    static synchronized String take() {
        String a = pending;
        pending = null;
        return a;
    }
}