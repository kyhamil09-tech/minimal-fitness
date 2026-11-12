package com.kyfitness.wear;

/**
 * When the wrist should nudge you about water and meals. Pure rules with no Android in them, so they can be tested: the receiver feeds
 * in the time and the numbers the phone last sent and posts whatever this decides.
 */
final class Nudges {
    private Nudges() {}

    /** Water is only nudged between these minutes of the day, and the day's pace is a straight line across them. */
    static final int WATER_START_MIN = 8 * 60;
    static final int WATER_END_MIN = 21 * 60;
    /** How far behind the day's pace (as a share of the goal) before it speaks, and the least time between two water nudges. */
    static final float WATER_BEHIND = 0.2f;
    static final long WATER_GAP_MS = 2 * 60 * 60_000L;

    /** Where the water total should be by this minute of the day if it were spread evenly. */
    static int expectedWaterMl(int dayMin, int goalMl) {
        float t = (dayMin - WATER_START_MIN) / (float) (WATER_END_MIN - WATER_START_MIN);
        return Math.round(goalMl * Math.max(0f, Math.min(1f, t)));
    }

    static boolean shouldNudgeWater(long nowMs, int dayMin, int totalMl, int goalMl, long lastNudgeMs) {
        if (goalMl <= 0 || dayMin < WATER_START_MIN + 60 || dayMin > WATER_END_MIN - 30) return false;
        if (nowMs - lastNudgeMs < WATER_GAP_MS) return false;
        return totalMl < expectedWaterMl(dayMin, goalMl) - Math.round(goalMl * WATER_BEHIND);
    }

    /** The meal times: a nudge is possible from the start of a slot until its end, once a day per slot. */
    static final int[] SLOT_START = {9 * 60 + 30, 13 * 60 + 30, 19 * 60 + 30};
    static final int[] SLOT_END = {11 * 60 + 30, 15 * 60 + 30, 21 * 60};
    /** Hours with nothing logged before a slot may nudge: breakfast asks for nothing at all today, the others for a gap. */
    static final long[] SLOT_QUIET_MS = {Long.MAX_VALUE, 4 * 60 * 60_000L, 4 * 60 * 60_000L + 30 * 60_000L};
    static final String[] SLOT_NAME = {"breakfast", "lunch", "dinner"};

    /**
     * The slot (0 breakfast, 1 lunch, 2 dinner) that should nudge now, or -1. {@code eatenKcal} is what is logged today and
     * {@code lastFoodMs} when the latest food was logged (0 if unknown); {@code slotDone} says which slots already nudged today.
     * With no way to tell when food was logged (lastFoodMs 0), a day with food already logged is trusted to be on track.
     */
    static int mealSlotToNudge(long nowMs, int dayMin, int eatenKcal, long lastFoodMs, boolean[] slotDone) {
        for (int s = 0; s < SLOT_START.length; s++) {
            if (slotDone[s] || dayMin < SLOT_START[s] || dayMin > SLOT_END[s]) continue;
            if (s == 0) {
                if (eatenKcal <= 0) return s;
                continue;
            }
            if (eatenKcal <= 0) return s;
            if (lastFoodMs > 0 && nowMs - lastFoodMs >= SLOT_QUIET_MS[s]) return s;
        }
        return -1;
    }

    static String mealTitle(int slot) {
        return slot == 0 ? "Breakfast?" : slot == 1 ? "Lunch o’clock" : "Dinner time";
    }

    static String mealBody(int slot) {
        return slot == 0 ? "Log it on your phone while it is fresh." : slot == 1 ? "A moment at the table, then a moment in the log." : "Log it now, enjoy it fully.";
    }
}
