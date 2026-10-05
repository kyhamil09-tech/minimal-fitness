package com.kyfitness.wear;

import android.content.Context;

/** Today's readiness score (0 to 100) worked out by the phone app. */
public class ReadinessComplicationService extends GlanceComplicationService {
    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(82, 100, "82", "Ready", "Readiness");
        int score = GlanceStore.readiness(c);
        if (score < 0) return new Reading(0, 100, "--", "Ready", "Readiness: not available yet");
        String label = GlanceStore.readinessLabel(c);
        return new Reading(score, 100, String.valueOf(score), label.isEmpty() ? "Ready" : shorten(label), "Readiness " + score + " " + label);
    }

    /** Titles are tiny: "Take it easy" becomes "Easy". */
    private static String shorten(String label) {
        if ("Take it easy".equals(label)) return "Easy";
        return label.length() > 8 ? label.substring(0, 8) : label;
    }
}
