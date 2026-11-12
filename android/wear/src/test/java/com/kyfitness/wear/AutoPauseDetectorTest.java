package com.kyfitness.wear;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** When a workout pauses itself and when it carries on. Times are in seconds from the start of the workout. */
public class AutoPauseDetectorTest {
    private static final long T0 = 1_700_000_000_000L;

    private static long at(int seconds) {
        return T0 + seconds * 1000L;
    }

    /** Feeds one speed reading per second from {@code from} to {@code to} (inclusive); returns the second of the first action, or -1. */
    private static int feed(AutoPauseDetector d, int from, int to, double speed, AutoPauseDetector.Action want) {
        for (int s = from; s <= to; s++) {
            if (d.onSpeed(at(s), speed) == want) return s;
        }
        return -1;
    }

    @Test
    public void pausesAfterSixSecondsStill() {
        AutoPauseDetector d = new AutoPauseDetector(true, false, T0);
        assertEquals(-1, feed(d, 0, 30, 2.5, AutoPauseDetector.Action.PAUSE)); // running
        // Stops at second 31: the first slow reading starts the count, the pause comes six seconds later.
        assertEquals(37, feed(d, 31, 60, 0.0, AutoPauseDetector.Action.PAUSE));
        assertTrue(d.isAutoPaused());
    }

    @Test
    public void aShortStopDoesNotPause() {
        AutoPauseDetector d = new AutoPauseDetector(true, false, T0);
        feed(d, 0, 30, 2.5, AutoPauseDetector.Action.PAUSE);
        assertEquals(-1, feed(d, 31, 35, 0.0, AutoPauseDetector.Action.PAUSE)); // five seconds
        assertEquals(-1, feed(d, 36, 60, 2.5, AutoPauseDetector.Action.PAUSE)); // and off again: the count starts over
        assertFalse(d.isAutoPaused());
    }

    @Test
    public void resumesAfterTwoSecondsOfRealMovement() {
        AutoPauseDetector d = new AutoPauseDetector(true, false, T0);
        feed(d, 0, 20, 2.5, AutoPauseDetector.Action.PAUSE);
        assertEquals(27, feed(d, 21, 40, 0.0, AutoPauseDetector.Action.PAUSE));
        assertEquals(-1, feed(d, 28, 40, 0.5, AutoPauseDetector.Action.RESUME)); // shuffling about is not moving
        assertEquals(43, feed(d, 41, 50, 2.0, AutoPauseDetector.Action.RESUME));
        assertFalse(d.isAutoPaused());
    }

    @Test
    public void aWalkerResumesAtASlowerSpeedThanARunner() {
        AutoPauseDetector walker = new AutoPauseDetector(true, true, T0);
        AutoPauseDetector runner = new AutoPauseDetector(true, false, T0);
        for (AutoPauseDetector d : new AutoPauseDetector[] {walker, runner}) {
            feed(d, 0, 20, 1.5, AutoPauseDetector.Action.PAUSE);
            feed(d, 21, 40, 0.0, AutoPauseDetector.Action.PAUSE);
            assertTrue(d.isAutoPaused());
        }
        // 1.1 m/s is a slow walk: enough to carry on for a walker, not for a runner.
        assertTrue(feed(walker, 41, 50, 1.1, AutoPauseDetector.Action.RESUME) > 0);
        assertEquals(-1, feed(runner, 41, 50, 1.1, AutoPauseDetector.Action.RESUME));
    }

    @Test
    public void noPausingWhileThePositionSettles() {
        AutoPauseDetector d = new AutoPauseDetector(true, false, T0);
        assertEquals(-1, feed(d, 0, 9, 0.0, AutoPauseDetector.Action.PAUSE)); // standing at the start line
        assertEquals(-1, feed(d, 10, 14, 0.0, AutoPauseDetector.Action.PAUSE));
    }

    @Test
    public void doesNothingWhenSwitchedOff() {
        AutoPauseDetector d = new AutoPauseDetector(false, false, T0);
        assertEquals(-1, feed(d, 0, 120, 0.0, AutoPauseDetector.Action.PAUSE));
    }

    @Test
    public void aManualPauseIsLeftAloneAndAManualResumeStartsOver() {
        AutoPauseDetector d = new AutoPauseDetector(true, false, T0);
        feed(d, 0, 20, 2.5, AutoPauseDetector.Action.PAUSE);
        d.setManualPaused(true);
        assertEquals(-1, feed(d, 21, 60, 0.0, AutoPauseDetector.Action.PAUSE));
        assertEquals(-1, feed(d, 61, 80, 2.5, AutoPauseDetector.Action.RESUME)); // moving does not resume a manual pause either
        d.setManualPaused(false);
        // Standing still after resuming by hand pauses again, six seconds after the first slow reading.
        assertEquals(87, feed(d, 81, 100, 0.0, AutoPauseDetector.Action.PAUSE));
    }

    @Test
    public void unknownSpeedChangesNothing() {
        AutoPauseDetector d = new AutoPauseDetector(true, false, T0);
        feed(d, 0, 20, 2.5, AutoPauseDetector.Action.PAUSE);
        for (int s = 21; s <= 60; s++) assertEquals(AutoPauseDetector.Action.NONE, d.onSpeed(at(s), Double.NaN));
        assertFalse(d.isAutoPaused());
    }

    /** Roughly 1 m of latitude in degrees. */
    private static final double METER = 1.0 / 111_195.0;

    @Test
    public void positionWobbleInsideTheAccuracyCircleIsStandingStill() {
        AutoPauseDetector d = new AutoPauseDetector(true, false, T0);
        int pausedAt = -1;
        for (int s = 0; s <= 40 && pausedAt < 0; s++) {
            // No speed from the receiver; the position jumps about by up to 4 m, with an accuracy of 8 m.
            double wobble = ((s % 4) - 1.5) * 2.5 * METER;
            if (d.onFix(at(s), 52 + wobble, 4 + wobble, 8.0, Double.NaN) == AutoPauseDetector.Action.PAUSE) pausedAt = s;
        }
        assertTrue("paused at " + pausedAt, pausedAt > 0 && pausedAt <= 25);
    }

    @Test
    public void aSteadyWalkWithNoReceiverSpeedDoesNotPause() {
        AutoPauseDetector d = new AutoPauseDetector(true, true, T0);
        for (int s = 0; s <= 120; s++) {
            // 1.3 m/s due north, accuracy 6 m
            assertEquals(AutoPauseDetector.Action.NONE, d.onFix(at(s), 52 + 1.3 * s * METER, 4, 6.0, Double.NaN));
        }
        assertFalse(d.isAutoPaused());
    }
}
