package com.kyfitness.wear;

import android.content.Context;

/** How many hours short of your sleep goal you are this week (the phone adds up the nights it tracked). The ring fills as the debt grows. */
public class SleepDebtComplicationService extends GlanceComplicationService {
    /** The ring is full at ten hours of debt. */
    private static final float RING_MAX = 600f;

    @Override
    protected int iconRes() {
        return R.drawable.ic_moon;
    }

    @Override
    protected Reading read(Context c, boolean preview) {
        if (preview) return new Reading(160, RING_MAX, "2h40", "Debt", "Two hours and 40 minutes short of sleep this week");
        int debt = GlanceStore.sleepDebtMin(c);
        if (debt < 0) return new Reading(0, RING_MAX, "--", "Debt", "Sleep debt: no nights tracked this week");
        if (debt == 0) return new Reading(0, RING_MAX, "0h", "Debt", "No sleep debt this week");
        return new Reading(Math.min(debt, RING_MAX), RING_MAX, SleepComplicationService.hm(debt), "Debt", (debt / 60) + " hours " + (debt % 60) + " minutes short of sleep this week");
    }
}
