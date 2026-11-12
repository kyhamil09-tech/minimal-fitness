package com.kyfitness.wear;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NudgesTest {
    private static final long H = 60 * 60_000L;

    @Test
    public void expectedWaterIsAStraightLineAcrossTheDay() {
        assertEquals(0, Nudges.expectedWaterMl(7 * 60, 2500));
        assertEquals(1250, Nudges.expectedWaterMl((8 * 60 + 21 * 60) / 2, 2500));
        assertEquals(2500, Nudges.expectedWaterMl(23 * 60, 2500));
    }

    @Test
    public void waterNudgesOnlyWhenWellBehindAndNotTooOften() {
        int noon = 12 * 60;
        // Pace at noon is about 31%: 770 ml. Behind by more than 20% of the goal means under 270 ml.
        assertTrue(Nudges.shouldNudgeWater(100 * H, noon, 100, 2500, 0));
        assertFalse(Nudges.shouldNudgeWater(100 * H, noon, 800, 2500, 0));
        // Spoke an hour ago: quiet.
        assertFalse(Nudges.shouldNudgeWater(100 * H, noon, 100, 2500, 99 * H));
        // Spoke three hours ago: fine again.
        assertTrue(Nudges.shouldNudgeWater(100 * H, noon, 100, 2500, 97 * H));
    }

    @Test
    public void waterStaysQuietEarlyLateAndWithNoGoal() {
        assertFalse(Nudges.shouldNudgeWater(100 * H, 8 * 60 + 30, 0, 2500, 0));
        assertFalse(Nudges.shouldNudgeWater(100 * H, 20 * 60 + 45, 0, 2500, 0));
        assertFalse(Nudges.shouldNudgeWater(100 * H, 12 * 60, 0, 0, 0));
    }

    @Test
    public void breakfastNudgesOnlyWhenNothingIsLoggedYet() {
        boolean[] done = {false, false, false};
        assertEquals(0, Nudges.mealSlotToNudge(0, 10 * 60, 0, 0, done));
        assertEquals(-1, Nudges.mealSlotToNudge(0, 10 * 60, 350, 0, done));
        assertEquals(-1, Nudges.mealSlotToNudge(0, 9 * 60, 0, 0, done));
    }

    @Test
    public void lunchAndDinnerWaitForARealGapSinceTheLastFood() {
        boolean[] done = {true, false, false};
        long now = 1000 * H;
        assertEquals(1, Nudges.mealSlotToNudge(now, 14 * 60, 350, now - 5 * H, done));
        assertEquals(-1, Nudges.mealSlotToNudge(now, 14 * 60, 350, now - 2 * H, done));
        // Nothing eaten at all by lunch counts too.
        assertEquals(1, Nudges.mealSlotToNudge(now, 14 * 60, 0, 0, done));
        // Unknown time of the last food with food logged: trusted.
        assertEquals(-1, Nudges.mealSlotToNudge(now, 14 * 60, 350, 0, done));
        assertEquals(2, Nudges.mealSlotToNudge(now, 20 * 60, 900, now - 5 * H, new boolean[] {true, true, false}));
    }

    @Test
    public void aSlotThatAlreadyNudgedStaysQuiet() {
        boolean[] done = {true, true, true};
        assertEquals(-1, Nudges.mealSlotToNudge(0, 14 * 60, 0, 0, done));
    }
}
