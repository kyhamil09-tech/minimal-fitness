package com.kyfitness.wear;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONObject;

/**
 * Process-wide state of the current workout, shown on the watch screen.
 * Filled from the phone's state messages, from the watch's own sensors, and from local actions.
 */
final class WorkoutState {
    static final double KM_PER_MI = 1.609344;

    // ---- the workout clock ----
    static volatile boolean active = false;
    static volatile String type = "Running";
    /** Epoch ms the workout started; the timer is derived from this so it never drifts. */
    static volatile long startedAt = 0;
    static volatile boolean paused = false;
    static volatile long pausedAt = 0;
    static volatile long pausedTotalMs = 0;
    static volatile boolean autoPaused = false;
    static volatile boolean canPause = true;
    /** True once the phone has told us about this workout (so its stop/pause messages apply). */
    static volatile boolean linkedToPhone = false;
    /** startedAt of the workout we just ended, so a late phone message can't revive it. */
    static volatile long lastEndedStartedAt = -1;
    static volatile boolean discarded = false;

    // ---- the goal set before the workout (0 = open, 1 = distance, 2 = time, 3 = calories) ----
    static final int GOAL_NONE = 0, GOAL_DISTANCE = 1, GOAL_TIME = 2, GOAL_KCAL = 3, GOAL_INTERVALS = 4;
    static volatile int goalType = GOAL_NONE;
    /** Meters, milliseconds or kilocalories depending on goalType. */
    static volatile double goalValue = 0;
    static volatile boolean goalHit = false;

    static void setGoal(int type, double value) {
        goalType = value > 0 ? type : GOAL_NONE;
        goalValue = value;
        goalHit = false;
    }

    static void clearGoal() {
        goalType = GOAL_NONE;
        goalValue = 0;
        goalHit = false;
    }

    /** 0..1+ progress towards the goal, or -1 without one. */
    static double goalProgress(long now) {
        if (goalType == GOAL_NONE || goalValue <= 0) return -1;
        double have = goalType == GOAL_DISTANCE ? distanceM()
            : goalType == GOAL_TIME ? elapsedMs(now)
            : (kcal > 0 ? kcal : phoneKcal);
        return have / goalValue;
    }

    static String goalLabel() {
        if (goalType == GOAL_DISTANCE) return String.format(Locale.getDefault(), "%.2f %s", goalValue / unitM(), unitName());
        if (goalType == GOAL_TIME) return clock((long) (goalValue / 1000));
        if (goalType == GOAL_KCAL) return Math.round(goalValue) + " kcal";
        return "";
    }

    // ---- interval workout and alerts ----
    static volatile WatchIntervals.Step[] steps = null;
    static volatile int stepIdx = 0;
    static volatile long stepStartElapsedMs = 0;
    static volatile double stepStartDistM = 0;
    static volatile boolean stepsDone = false;
    /** Seconds per kilometer, 0 = off. */
    static volatile double targetPaceSecPerKm = 0;
    /** Heart-rate zone 1-5, 0 = off. */
    static volatile int targetZone = 0;

    // ---- the phone's interval step and alert, when the phone started the workout ----
    static volatile int phoneStepCount = 0;
    static volatile int phoneStepIndex = 0;
    static volatile String phoneStepLabel = "";
    /** warmup, work, recover or cooldown. */
    static volatile String phoneStepKind = "";
    static volatile long phoneStepDurMs = 0;
    /** Epoch ms when a timed step ends (0 for distance steps or while paused). */
    static volatile long phoneStepEndsAt = 0;
    static volatile double phoneStepFraction = 0;
    static volatile String phoneStepLeft = "";
    static volatile boolean phoneStepsDone = false;
    static volatile String phoneAlert = "";

    static void clearPhoneSteps() {
        phoneStepCount = 0;
        phoneStepIndex = 0;
        phoneStepLabel = "";
        phoneStepKind = "";
        phoneStepDurMs = 0;
        phoneStepEndsAt = 0;
        phoneStepFraction = 0;
        phoneStepLeft = "";
        phoneStepsDone = false;
        phoneAlert = "";
    }

    static void setIntervals(WatchIntervals.Preset p) {
        steps = p == null ? null : p.steps;
        stepIdx = 0;
        stepStartElapsedMs = 0;
        stepStartDistM = 0;
        stepsDone = false;
    }

    static void clearPlan() {
        setIntervals(null);
        targetPaceSecPerKm = 0;
        targetZone = 0;
    }

    // ---- a strength session run from the phone's logger: one exercise and set at a time ----
    static final class Strength {
        int ex, exCount, setIdx, setCount, doneSets, restLen;
        String name = "", unit = "kg", next = "", volume = "";
        double reps, weight, step = 2.5;
        boolean done;
        int[] setReps = new int[0];
        double[] setWeight = new double[0];
        boolean[] setDone = new boolean[0];
        String[] exNames = new String[0];
        int[] exDone = new int[0];
        int[] exTotal = new int[0];
        /** Epoch ms when the rest ends; 0 when not resting. */
        long restEndsAt;

        Strength copy() {
            Strength s = new Strength();
            s.ex = ex; s.exCount = exCount; s.setIdx = setIdx; s.setCount = setCount; s.doneSets = doneSets; s.restLen = restLen;
            s.name = name; s.unit = unit; s.next = next; s.volume = volume;
            s.reps = reps; s.weight = weight; s.step = step; s.done = done;
            s.setReps = setReps.clone(); s.setWeight = setWeight.clone(); s.setDone = setDone.clone();
            s.exNames = exNames.clone(); s.exDone = exDone.clone(); s.exTotal = exTotal.clone();
            s.restEndsAt = restEndsAt;
            return s;
        }
    }

    /** The strength session on show, or null when the phone is not running one (then the normal pages are used). */
    static volatile Strength strength = null;
    /** Counts the strength states that arrived from the phone, so the watch can tell when the phone has answered a button. */
    static volatile int strengthVersion = 0;
    /** The rest-over buzz has been given for the current rest. */
    static volatile boolean restBuzzed = false;
    /** The routine picked on the setup page, sent to the phone with the start command ("" = an empty session). */
    static volatile String pendingRoutine = "";
    /** The shoes or bike picked on the setup page ("" = none offered, "none" = chosen not to count it). Sent with the start command and saved with a workout recorded on the watch alone. */
    static volatile String workoutGear = "";

    private static Strength parseStrength(JSONObject o) {
        Strength s = new Strength();
        s.ex = o.optInt("ex", 0);
        s.exCount = o.optInt("exCount", 0);
        s.name = o.optString("name", "");
        s.setIdx = o.optInt("setIdx", 0);
        s.setCount = o.optInt("setCount", 0);
        s.reps = o.optDouble("reps", 0);
        s.weight = o.optDouble("weight", 0);
        s.unit = o.optString("unit", "kg");
        s.step = o.optDouble("step", 2.5);
        s.done = o.optBoolean("done", false);
        s.next = o.optString("next", "");
        s.restEndsAt = o.optLong("restEndsAt", 0);
        s.restLen = o.optInt("restLen", 90);
        s.doneSets = o.optInt("doneSets", 0);
        s.volume = o.optString("volume", "");
        org.json.JSONArray sets = o.optJSONArray("sets");
        int n = sets == null ? 0 : sets.length();
        s.setReps = new int[n];
        s.setWeight = new double[n];
        s.setDone = new boolean[n];
        for (int i = 0; i < n; i++) {
            JSONObject r = sets.optJSONObject(i);
            if (r == null) continue;
            s.setReps[i] = r.optInt("r", 0);
            s.setWeight[i] = r.optDouble("w", 0);
            s.setDone[i] = r.optBoolean("d", false);
        }
        org.json.JSONArray exs = o.optJSONArray("exercises");
        int m = exs == null ? 0 : exs.length();
        s.exNames = new String[m];
        s.exDone = new int[m];
        s.exTotal = new int[m];
        for (int i = 0; i < m; i++) {
            JSONObject r = exs.optJSONObject(i);
            s.exNames[i] = r == null ? "" : r.optString("n", "");
            s.exDone[i] = r == null ? 0 : r.optInt("done", 0);
            s.exTotal[i] = r == null ? 0 : r.optInt("total", 0);
        }
        return s;
    }

    /**
     * Applies a button press straight away so the screen answers at once; the phone's next message (a moment later) replaces it
     * with the real state. Only the changes that need nothing from the rest of the session are done here.
     */
    static synchronized void localAdjust(String action, int delta) {
        Strength cur = strength;
        if (cur == null) return;
        Strength s = cur.copy();
        long now = System.currentTimeMillis();
        int i = Math.max(0, Math.min(s.setReps.length - 1, s.setIdx));
        switch (action) {
            case "reps":
                s.reps = Math.max(1, Math.min(99, s.reps + delta));
                if (i >= 0 && s.setReps.length > 0) s.setReps[i] = (int) s.reps;
                break;
            case "weight":
                s.weight = Math.max(0, Math.min(999, Math.round((s.weight + delta * s.step) * 100.0) / 100.0));
                if (i >= 0 && s.setWeight.length > 0) s.setWeight[i] = s.weight;
                break;
            case "done":
                s.done = !s.done;
                if (i >= 0 && s.setDone.length > 0) s.setDone[i] = s.done;
                s.doneSets += s.done ? 1 : -1;
                if (s.ex >= 0 && s.ex < s.exDone.length) s.exDone[s.ex] += s.done ? 1 : -1;
                s.restEndsAt = s.done ? now + s.restLen * 1000L : 0;
                restBuzzed = false;
                break;
            case "skiprest":
                s.restEndsAt = 0;
                break;
            case "rest":
                if (s.restEndsAt > now) s.restEndsAt = Math.max(now, s.restEndsAt + delta * 1000L);
                break;
            default:
                return;
        }
        strength = s;
    }

    // ---- from the phone ----
    /** Preformatted by the phone in the user's units. */
    static volatile String phoneDistanceText = "";
    static volatile String phonePaceText = "";
    static volatile double phoneDistanceKm = 0;
    static volatile double phoneKcal = 0;
    static volatile int maxHr = 190;
    static volatile boolean miles = false;

    // ---- measured on the watch ----
    static volatile int bpm = 0;
    static volatile double kcal = 0;
    static volatile double watchDistanceM = 0;
    /** Smoothed speed in m/s, 0 when unknown. */
    static volatile double speedMs = 0;
    static volatile long speedAt = 0;
    static volatile double elevGainM = 0;
    /** Steps taken since the workout began (counted by the exercise itself, or worked out from the all-day step count). */
    static volatile long stepCount = 0;
    /** The all-day step count when the workout began, to work steps out from when the exercise does not count them (-1 = unknown). */
    static volatile int stepsAtStart = -1;
    /** True when the exercise itself reported steps (so the all-day count is not needed). */
    static volatile boolean exerciseSteps = false;
    static volatile long hrSum = 0;
    static volatile int hrCount = 0;
    static volatile int hrMax = 0;
    static final long[] zoneSec = new long[5];

    // ---- laps ----
    static final class Lap {
        final int n;
        final long splitMs;
        final double distanceM;
        final int avgHr;
        final long at;

        Lap(int n, long splitMs, double distanceM, int avgHr, long at) {
            this.n = n;
            this.splitMs = splitMs;
            this.distanceM = distanceM;
            this.avgHr = avgHr;
            this.at = at;
        }
    }

    static final List<Lap> laps = new ArrayList<>();
    static volatile long lapStartElapsedMs = 0;
    static volatile double lapStartDistanceM = 0;
    static volatile String banner = "";
    static volatile long bannerUntil = 0;

    // ---- the finished workout, shown on the summary screen until dismissed ----
    static final class Summary {
        String type;
        long durationMs;
        double distanceM;
        int avgHr;
        int maxHr;
        double kcal;
        int elevGainM;
        long steps;
        long[] zones = new long[5];
        String avgPace = "";
        boolean sentToPhone;
        boolean standalone;
        String goal = "";
        boolean goalReached;
    }

    static volatile Summary summary = null;

    private WorkoutState() {}

    static long elapsedMs(long now) {
        long end = paused && pausedAt > 0 ? pausedAt : now;
        return Math.max(0, end - startedAt - pausedTotalMs);
    }

    /** Reps the watch counted by itself since the last set was ticked off (automatic rep counting). */
    static volatile int autoReps = 0;

    private static void resetMeasurements() {
        autoReps = 0;
        LocalStrength.clear();
        strength = null;
        restBuzzed = false;
        bpm = 0;
        kcal = 0;
        watchDistanceM = 0;
        speedMs = 0;
        speedAt = 0;
        elevGainM = 0;
        stepCount = 0;
        stepsAtStart = -1;
        exerciseSteps = false;
        hrSum = 0;
        hrCount = 0;
        hrMax = 0;
        for (int i = 0; i < zoneSec.length; i++) zoneSec[i] = 0;
        synchronized (laps) {
            laps.clear();
        }
        lapStartElapsedMs = 0;
        lapStartDistanceM = 0;
        banner = "";
        bannerUntil = 0;
        autoPaused = false;
        discarded = false;
        summary = null;
    }

    static void beginLocal(String workoutType) {
        type = workoutType;
        startedAt = System.currentTimeMillis();
        paused = false;
        pausedAt = 0;
        pausedTotalMs = 0;
        phoneDistanceText = "";
        phonePaceText = "";
        phoneDistanceKm = 0;
        phoneKcal = 0;
        canPause = !"Strength".equals(workoutType);
        linkedToPhone = false;
        resetMeasurements();
        active = true;
    }

    /** Applies a /ky/workout/state message. Returns the new active flag. */
    static boolean applyPhone(JSONObject o) {
        boolean nowActive = o.optBoolean("active", false);
        long started = o.optLong("startedAt", 0);
        if (nowActive) {
            if (started == lastEndedStartedAt) return active; // stale message for a workout already ended here
            if (!active) {
                resetMeasurements();
                // A workout started on the phone carries its goal along.
                String gt = o.optString("goalType", "open");
                double gv = o.optDouble("goalValue", 0);
                if ("distance".equals(gt)) setGoal(GOAL_DISTANCE, gv * 1000);
                else if ("time".equals(gt)) setGoal(GOAL_TIME, gv * 60_000);
                else if ("calories".equals(gt)) setGoal(GOAL_KCAL, gv);
                else clearGoal();
            }
            type = o.optString("type", type);
            startedAt = started > 0 ? started : startedAt;
            paused = o.optBoolean("paused", false);
            pausedAt = o.optLong("pausedAt", 0);
            pausedTotalMs = o.optLong("pausedTotalMs", 0);
            phoneDistanceText = o.optString("distanceText", "");
            phonePaceText = o.optString("paceText", "");
            phoneDistanceKm = o.optDouble("distanceKm", 0);
            phoneKcal = o.optDouble("kcal", 0);
            maxHr = o.optInt("maxHr", maxHr);
            if (o.has("stepLabel")) {
                phoneStepCount = o.optInt("stepCount", 0);
                phoneStepIndex = o.optInt("stepIndex", 0);
                phoneStepLabel = o.optString("stepLabel", "");
                phoneStepKind = o.optString("stepKind", "");
                phoneStepDurMs = o.optLong("stepDurMs", 0);
                phoneStepEndsAt = o.optLong("stepEndsAt", 0);
                phoneStepFraction = o.optDouble("stepFraction", 0);
                phoneStepLeft = o.optString("stepLeft", "");
                phoneStepsDone = o.optBoolean("stepsDone", false);
            } else {
                clearPhoneSteps();
            }
            phoneAlert = o.optString("alertText", "");
            JSONObject st = LocalStrength.active != null ? null : o.optJSONObject("strength");
            if (LocalStrength.active != null) {
                // This session runs on the watch alone: the phone does not own it.
            } else if (st != null) {
                Strength fresh = parseStrength(st);
                Strength old = strength;
                if (old == null || old.restEndsAt != fresh.restEndsAt) restBuzzed = false;
                strength = fresh;
                strengthVersion++;
            } else {
                strength = null;
            }
            canPause = o.optBoolean("canPause", true);
            if (o.has("miles")) miles = o.optBoolean("miles", false);
            linkedToPhone = true;
            active = true;
        } else if (linkedToPhone) {
            if (o.optBoolean("discarded", false)) discarded = true;
            clearPhoneSteps();
            strength = null;
            active = false;
        }
        return active;
    }

    // ---- display helpers ----

    static double unitM() {
        return miles ? KM_PER_MI * 1000 : 1000;
    }

    static String unitName() {
        return miles ? "mi" : "km";
    }

    /** Distance in meters from the best source: the phone when it reports one, otherwise the watch's GPS. */
    static double distanceM() {
        if (linkedToPhone && phoneDistanceKm > 0) return phoneDistanceKm * 1000;
        return watchDistanceM;
    }

    static String distanceLabel() {
        double m = distanceM();
        if (linkedToPhone && !phoneDistanceText.isEmpty() && phoneDistanceKm > 0) return phoneDistanceText;
        if (m <= 0) return "";
        return String.format(Locale.getDefault(), "%.2f %s", m / unitM(), unitName());
    }

    static String formatPace(double secondsPerUnit) {
        if (secondsPerUnit <= 0 || Double.isInfinite(secondsPerUnit) || Double.isNaN(secondsPerUnit) || secondsPerUnit > 3600) return "--:--";
        int total = (int) Math.round(secondsPerUnit);
        return String.format(Locale.getDefault(), "%d:%02d", total / 60, total % 60);
    }

    /** Pace right now, from the watch's GPS speed. */
    static String currentPace() {
        if (speedMs < 0.3 || System.currentTimeMillis() - speedAt > 8000) return "--:--";
        return formatPace(unitM() / speedMs);
    }

    /** Average pace so far, using moving time. */
    static String averagePace(long elapsedMs) {
        double m = distanceM();
        if (m < 20 || elapsedMs <= 0) return "--:--";
        return formatPace((elapsedMs / 1000.0) / (m / unitM()));
    }

    static String clock(long totalSeconds) {
        long s = Math.max(0, totalSeconds);
        return s >= 3600
            ? String.format(Locale.getDefault(), "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
            : String.format(Locale.getDefault(), "%02d:%02d", s / 60, s % 60);
    }

    /** Zone number 1-5 for a heart rate, or 0 without a reading. */
    static int zoneOf(int heartRate) {
        if (heartRate <= 0 || maxHr <= 0) return 0;
        double pct = (double) heartRate / maxHr;
        return pct < 0.6 ? 1 : pct < 0.7 ? 2 : pct < 0.8 ? 3 : pct < 0.9 ? 4 : 5;
    }

    static final String[] ZONE_NAMES = {"Recovery", "Aerobic", "Tempo", "Threshold", "Max"};

    /** "Z3 Tempo" style label for a heart rate, or "" without a reading. */
    static String zoneLabel(int heartRate) {
        int z = zoneOf(heartRate);
        return z == 0 ? "" : "Z" + z + " " + ZONE_NAMES[z - 1];
    }
}

