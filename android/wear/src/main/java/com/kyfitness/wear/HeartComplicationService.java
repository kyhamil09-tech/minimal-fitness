package com.kyfitness.wear;

import android.content.Context;

/** The newest heart rate reading against the user's max heart rate; "--" when nothing came in during the last half hour. */
public class HeartComplicationService extends GlanceComplicationService {
    private static final long FRESH_MS = 30 * 60_000L;
    /** Readings arrive in bursts; redrawing at most once a minute keeps the watch face cheap. */
    private static final long MIN_GAP_MS = 60_000L;
    private static long lastRequest;

    static void notifyChanged(Context c) {
        long now = System.currentTimeMillis();
        if (now - lastRequest < MIN_GAP_MS) return;
        lastRequest = now;
        request(c, HeartComplicationService.class);
    }

    @Override
    protected int iconRes() {
        return R.drawable.ic_heart;
    }

    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(64, 190, "64", "Heart", "Heart rate 64 beats per minute");
        int max = GlanceStore.maxHr(c) > 0 ? GlanceStore.maxHr(c) : 190;
        int bpm = VitalsStore.lastBpm(c, FRESH_MS);
        if (bpm <= 0) return new Reading(0, max, "--", "Heart", "Heart rate: no recent reading");
        return new Reading(bpm, max, String.valueOf(bpm), "Heart", "Heart rate " + bpm + " beats per minute");
    }
}
