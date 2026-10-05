package com.kyfitness.wear;

import android.content.Context;

/** Progress toward the month's goal set in the phone app (distance, workouts or active minutes). */
public class MonthGoalComplicationService extends GlanceComplicationService {
    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(62, 100, "62%", "Month", "Monthly goal");
        int pct = GlanceStore.monthPct(c);
        if (pct < 0) return new Reading(0, 100, "--", "Month", "No monthly goal set in the phone app");
        String kind = GlanceStore.monthKind(c);
        return new Reading(pct, 100, pct + "%", "Month", "Monthly goal " + kind + ": " + GlanceStore.monthText(c));
    }
}
