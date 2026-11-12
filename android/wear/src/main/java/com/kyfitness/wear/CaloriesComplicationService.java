package com.kyfitness.wear;

import android.content.Context;
import java.text.NumberFormat;

/** Today's calories burned as the watch reports them. The ring has no goal to measure against, so it fills toward the next 500 above 2,500. */
public class CaloriesComplicationService extends GlanceComplicationService {
    private static final long MIN_GAP_MS = 5 * 60_000L;
    private static long lastRequest;

    static void notifyChanged(Context c) {
        long now = System.currentTimeMillis();
        if (now - lastRequest < MIN_GAP_MS) return;
        lastRequest = now;
        request(c, CaloriesComplicationService.class);
    }

    @Override
    protected int iconRes() {
        return R.drawable.ic_flame;
    }

    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(1840, 2500, "1,840", "Kcal", "1,840 calories burned today");
        double kcal = VitalsStore.daily(c, "kcal");
        if (kcal < 0) return new Reading(0, 2500, "--", "Kcal", "Calories burned: not available yet");
        int rounded = (int) Math.round(kcal);
        int max = Math.max(2500, (int) Math.ceil(rounded / 500.0) * 500);
        return new Reading(rounded, max, NumberFormat.getIntegerInstance().format(rounded), "Kcal", rounded + " calories burned today");
    }
}
