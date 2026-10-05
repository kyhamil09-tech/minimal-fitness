package com.kyfitness.wear;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.health.services.client.ExerciseClient;
import androidx.health.services.client.ExerciseUpdateCallback;
import androidx.health.services.client.HealthServices;
import androidx.health.services.client.data.Availability;
import androidx.health.services.client.data.CumulativeDataPoint;
import androidx.health.services.client.data.DataPointContainer;
import androidx.health.services.client.data.DataType;
import androidx.health.services.client.data.ExerciseConfig;
import androidx.health.services.client.data.ExerciseLapSummary;
import androidx.health.services.client.data.ExerciseUpdate;
import androidx.health.services.client.data.LocationData;
import androidx.health.services.client.data.SampleDataPoint;
import androidx.wear.ongoing.OngoingActivity;
import androidx.wear.ongoing.Status;
import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executor;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Runs a real Wear OS exercise session through Health Services: keeps the sensors on with the screen off,
 * measures heart rate, calories and (outdoors) GPS distance, speed and route, streams to the phone when
 * linked, and keeps the workout clock in step with the phone's (see {@link WorkoutState}).
 * Also does auto-pause, auto-laps, heart-rate zone tracking and haptics, and saves the finished workout
 * (syncing it to the phone when it was recorded without it).
 */
public class WorkoutService extends Service {
    private static final String TAG = "KyWorkout";
    private static final String CHANNEL_ID = "ky_workout";
    private static final int NOTIFICATION_ID = 2;
    static final String EXTRA_TYPE = "type";

    static volatile boolean running = false;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Executor mainExecutor = main::post;

    private ExerciseClient exerciseClient;
    private ExerciseUpdateCallback callback;
    private boolean exerciseStarted = false;
    private boolean exercisePaused = false;
    private boolean fellBackToHrOnly = false;

    // recorded for the saved workout
    private final List<double[]> track = new ArrayList<>(); // epoch ms, lat, lng, alt (NaN if none), km
    private final List<long[]> hrSeries = new ArrayList<>(); // epoch ms, bpm
    private long lastTrackAt = 0;
    private long lastHrAt = 0;
    private long lastHrSeriesAt = 0;
    private int lastZone = 0;
    private double nextAutoLapM = 0;
    private int slowTicks = 0;
    private int fastTicks = 0;

    private static long lapHrSum = 0;
    private static int lapHrCount = 0;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            syncPause();
            autoPauseTick();
            checkAutoLap();
            checkGoal();
            checkIntervals();
            checkTargets();
            syncBeat();
            checkRest();
            refreshComplication();
            main.postDelayed(this, 1000);
        }
    };

    /** Buzz when a strength rest ends. This runs here (not on the phone) so it lands on time even with the watch screen off. */
    private void checkRest() {
        WorkoutState.Strength s = WorkoutState.strength;
        if (s == null || s.restEndsAt <= 0 || WorkoutState.restBuzzed) return;
        long now = System.currentTimeMillis();
        if (now < s.restEndsAt) return;
        WorkoutState.restBuzzed = true;
        // An end time that is long past (a stale message after reconnecting) is not worth a buzz.
        if (now - s.restEndsAt < 6000) Haptics.alert(this);
    }

    static void start(Context ctx, String type) {
        Intent i = new Intent(ctx, WorkoutService.class).putExtra(EXTRA_TYPE, type);
        ctx.startForegroundService(i);
    }

    /** Ends the workout on the watch (saving it) and tells the phone to finish too. */
    static void stopFromWatch(Context ctx) {
        if (WorkoutState.linkedToPhone) PhoneLink.sendCommand(ctx, "stop", null);
        ctx.stopService(new Intent(ctx, WorkoutService.class));
    }

    /** Ends the workout without saving it, on both devices. */
    static void discard(Context ctx) {
        WorkoutState.discarded = true;
        if (WorkoutState.linkedToPhone) PhoneLink.sendCommand(ctx, "discard", null);
        ctx.stopService(new Intent(ctx, WorkoutService.class));
    }

    /** Marks a lap (manual button or automatic distance lap). */
    static synchronized void addLap(Context ctx, boolean auto) {
        long now = System.currentTimeMillis();
        long elapsed = WorkoutState.elapsedMs(now);
        long split = elapsed - WorkoutState.lapStartElapsedMs;
        if (split < 2000) return;
        double dist = WorkoutState.distanceM();
        double lapDist = Math.max(0, dist - WorkoutState.lapStartDistanceM);
        int avgHr = lapHrCount > 0 ? (int) (lapHrSum / lapHrCount) : 0;
        int n;
        synchronized (WorkoutState.laps) {
            n = WorkoutState.laps.size() + 1;
            WorkoutState.laps.add(new WorkoutState.Lap(n, split, lapDist, avgHr, now));
        }
        WorkoutState.lapStartElapsedMs = elapsed;
        WorkoutState.lapStartDistanceM = dist;
        lapHrSum = 0;
        lapHrCount = 0;
        String pace = lapDist > 20 ? "  " + WorkoutState.formatPace((split / 1000.0) / (lapDist / WorkoutState.unitM())) + "/" + WorkoutState.unitName() : "";
        WorkoutState.banner = "Lap " + n + "  " + WorkoutState.clock(split / 1000) + pace;
        WorkoutState.bannerUntil = now + 5000;
        if (auto ? WatchPrefs.lapHaptics(ctx) : true) Haptics.lap(ctx);
    }

    /** Pause / resume from the watch, kept in step with the phone. */
    static void setPausedByUser(Context ctx, boolean pause) {
        long now = System.currentTimeMillis();
        WorkoutState.autoPaused = false;
        applyPause(pause, now);
        if (WorkoutState.linkedToPhone) PhoneLink.sendCommand(ctx, pause ? "pause" : "resume", null);
    }

    private static void applyPause(boolean pause, long now) {
        if (pause && !WorkoutState.paused) {
            WorkoutState.pausedAt = now;
            WorkoutState.paused = true;
        } else if (!pause && WorkoutState.paused) {
            WorkoutState.pausedTotalMs += now - WorkoutState.pausedAt;
            WorkoutState.pausedAt = 0;
            WorkoutState.paused = false;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (running) return START_NOT_STICKY;
        // Heart-rate-only mode and a workout both want the sensor; the workout wins.
        stopService(new Intent(this, HeartRateService.class));

        String type = intent != null && intent.getStringExtra(EXTRA_TYPE) != null
            ? intent.getStringExtra(EXTRA_TYPE)
            : WorkoutState.type;
        boolean startedHere = !WorkoutState.active;
        if (startedHere) WorkoutState.beginLocal(type);
        else WorkoutState.discarded = false;
        WorkoutState.miles = WatchPrefs.miles(this);
        track.clear();
        hrSeries.clear();
        lastTrackAt = 0;
        lastHrAt = 0;
        lastHrSeriesAt = 0;
        lastZone = 0;
        nextAutoLapM = WorkoutState.unitM();
        slowTicks = 0;
        fastTicks = 0;
        lapHrSum = 0;
        lapHrCount = 0;
        running = true;
        startForegroundWithOngoing();
        if (startedHere) PhoneLink.sendStart(this, WorkoutState.type, WorkoutState.goalType, WorkoutState.goalValue);
        beginExercise();
        main.postDelayed(tick, 1000);
        KyComplicationService.requestUpdate(this);
        return START_NOT_STICKY;
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void startForegroundWithOngoing() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Workout", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(
            this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Minimal Fitness")
            .setContentText(Sports.find(WorkoutState.type).label + " in progress")
            .setSmallIcon(R.drawable.ic_launcher)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setOngoing(true)
            .setContentIntent(open);
        try {
            new OngoingActivity.Builder(this, NOTIFICATION_ID, b)
                .setStaticIcon(R.drawable.ic_launcher)
                .setTouchIntent(open)
                .setStatus(new Status.Builder().addTemplate(Sports.find(WorkoutState.type).label).build())
                .build()
                .apply(this);
        } catch (RuntimeException e) {
            Log.w(TAG, "Ongoing activity unavailable: " + e.getMessage());
        }
        Notification n = b.build();
        int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH;
        if (Sports.find(WorkoutState.type).gps && hasLocationPermission()) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
        startForeground(NOTIFICATION_ID, n, type);
    }

    private void beginExercise() {
        exerciseClient = HealthServices.getClient(this).getExerciseClient();
        final Instant boot = Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime());
        callback = new ExerciseUpdateCallback() {
            @Override
            public void onRegistered() {}

            @Override
            public void onRegistrationFailed(@NonNull Throwable throwable) {
                Log.e(TAG, "Exercise callback registration failed", throwable);
            }

            @Override
            public void onAvailabilityChanged(@NonNull DataType<?, ?> dataType, @NonNull Availability availability) {}

            @Override
            public void onLapSummaryReceived(@NonNull ExerciseLapSummary lapSummary) {}

            @Override
            public void onExerciseUpdateReceived(@NonNull ExerciseUpdate update) {
                DataPointContainer m = update.getLatestMetrics();
                List<SampleDataPoint<Double>> hr = m.getData(DataType.HEART_RATE_BPM);
                if (!hr.isEmpty()) {
                    int bpm = (int) Math.round(hr.get(hr.size() - 1).getValue());
                    if (bpm > 0) onHeartRate(bpm);
                }
                CumulativeDataPoint<Double> cal = m.getData(DataType.CALORIES_TOTAL);
                if (cal != null) {
                    WorkoutState.kcal = cal.getTotal();
                    PhoneLink.send(WorkoutService.this, PhoneLink.PATH_KCAL, String.valueOf(cal.getTotal()));
                }
                CumulativeDataPoint<Double> dist = m.getData(DataType.DISTANCE_TOTAL);
                if (dist != null) WorkoutState.watchDistanceM = dist.getTotal();
                CumulativeDataPoint<Double> climb = m.getData(DataType.ELEVATION_GAIN_TOTAL);
                if (climb != null) WorkoutState.elevGainM = climb.getTotal();
                List<SampleDataPoint<Double>> speed = m.getData(DataType.SPEED);
                if (!speed.isEmpty()) {
                    double v = speed.get(speed.size() - 1).getValue();
                    WorkoutState.speedMs = WorkoutState.speedMs == 0 ? v : 0.35 * v + 0.65 * WorkoutState.speedMs;
                    WorkoutState.speedAt = System.currentTimeMillis();
                }
                List<SampleDataPoint<LocationData>> loc = m.getData(DataType.LOCATION);
                for (SampleDataPoint<LocationData> p : loc) recordLocation(p.getValue(), p.getTimeInstant(boot).toEpochMilli());
            }
        };
        exerciseClient.setUpdateCallback(mainExecutor, callback);
        tryStart(0);
    }

    /**
     * Starts the exercise with as much as the watch supports. Level 0 asks for everything, and each failure
     * steps down: no elevation, then no GPS/distance, then heart rate only.
     */
    private void tryStart(final int level) {
        Sports.Sport sport = Sports.find(WorkoutState.type);
        Set<DataType<?, ?>> types = new HashSet<>();
        types.add(DataType.HEART_RATE_BPM);
        if (level <= 2) types.add(DataType.CALORIES_TOTAL);
        boolean gps = false;
        if (level <= 1) {
            if (sport.gps && hasLocationPermission()) {
                types.add(DataType.DISTANCE_TOTAL);
                types.add(DataType.SPEED);
                types.add(DataType.LOCATION);
                if (level == 0) types.add(DataType.ELEVATION_GAIN_TOTAL);
                gps = true;
            } else if (sport.indoorDistance) {
                types.add(DataType.DISTANCE_TOTAL);
                types.add(DataType.SPEED);
            }
        }
        ExerciseConfig config = ExerciseConfig.builder(sport.exercise)
            .setDataTypes(types)
            .setIsAutoPauseAndResumeEnabled(false)
            .setIsGpsEnabled(gps)
            .build();
        ListenableFuture<Void> f = exerciseClient.startExerciseAsync(config);
        Futures.addCallback(f, new FutureCallback<Void>() {
            @Override
            public void onSuccess(@Nullable Void result) {
                exerciseStarted = true;
            }

            @Override
            public void onFailure(@NonNull Throwable t) {
                Log.e(TAG, "startExercise failed at level " + level, t);
                if (level < 3) {
                    tryStart(level + 1);
                } else {
                    // Another app may own the exercise slot: fall back to heart rate only.
                    fellBackToHrOnly = true;
                    startService(new Intent(WorkoutService.this, HeartRateService.class));
                }
            }
        }, mainExecutor);
    }

    // ---- sensor handling ----

    private void onHeartRate(int bpm) {
        long now = System.currentTimeMillis();
        WorkoutState.bpm = bpm;
        if (!WorkoutState.paused) {
            WorkoutState.hrSum += bpm;
            WorkoutState.hrCount++;
            if (bpm > WorkoutState.hrMax) WorkoutState.hrMax = bpm;
            lapHrSum += bpm;
            lapHrCount++;
            int zone = WorkoutState.zoneOf(bpm);
            if (zone > 0) {
                long delta = lastHrAt > 0 ? Math.min(6000, now - lastHrAt) : 1000;
                WorkoutState.zoneSec[zone - 1] += delta;
                if (WatchPrefs.zoneAlerts(this) && lastZone != 0 && zone != lastZone) {
                    if (zone == 5) Haptics.alert(this);
                    else if (lastZone == 5) Haptics.tick(this);
                }
                lastZone = zone;
            }
            if (now - lastHrSeriesAt >= 2000 && hrSeries.size() < 6000) {
                hrSeries.add(new long[] {now, bpm});
                lastHrSeriesAt = now;
            }
        }
        lastHrAt = now;
        PhoneLink.send(this, PhoneLink.PATH_HR, String.valueOf(bpm));
    }

    private void recordLocation(LocationData loc, long at) {
        if (WorkoutState.paused || loc == null) return;
        if (at - lastTrackAt < 3000 || track.size() >= 8000) return;
        lastTrackAt = at;
        double alt = loc.getAltitude();
        track.add(new double[] {at, loc.getLatitude(), loc.getLongitude(), Double.isNaN(alt) ? Double.NaN : alt, WorkoutState.watchDistanceM / 1000.0});
    }

    // ---- once-a-second logic ----

    /** Keeps the Health Services exercise paused exactly when the workout clock is. */
    private void syncPause() {
        if (!exerciseStarted) return;
        boolean wantPaused = WorkoutState.paused;
        if (wantPaused && !exercisePaused) {
            exercisePaused = true;
            exerciseClient.pauseExerciseAsync();
        } else if (!wantPaused && exercisePaused) {
            exercisePaused = false;
            exerciseClient.resumeExerciseAsync();
        }
    }

    /** Pauses after ~6 s standing still and resumes after ~2 s of real movement (GPS sports only). */
    private void autoPauseTick() {
        if (!Sports.find(WorkoutState.type).gps || !WatchPrefs.autoPause(this)) return;
        long now = System.currentTimeMillis();
        if (now - WorkoutState.speedAt > 5000) return; // no fresh speed reading
        double v = WorkoutState.speedMs;
        if (!WorkoutState.paused) {
            slowTicks = v < 0.7 ? slowTicks + 1 : 0;
            if (slowTicks >= 6) {
                slowTicks = 0;
                WorkoutState.autoPaused = true;
                applyPause(true, now);
                Haptics.tick(this);
                if (WorkoutState.linkedToPhone) PhoneLink.sendCommand(this, "pause", null);
            }
        } else if (WorkoutState.autoPaused) {
            fastTicks = v > 1.4 ? fastTicks + 1 : 0;
            if (fastTicks >= 2) {
                fastTicks = 0;
                WorkoutState.autoPaused = false;
                applyPause(false, now);
                Haptics.tick(this);
                if (WorkoutState.linkedToPhone) PhoneLink.sendCommand(this, "resume", null);
            }
        }
    }

    private void checkAutoLap() {
        if (!WatchPrefs.autoLap(this) || WorkoutState.paused) return;
        if (!Sports.find(WorkoutState.type).hasDistance() && WorkoutState.phoneDistanceKm <= 0) return;
        double dist = WorkoutState.distanceM();
        int guard = 0;
        while (dist >= nextAutoLapM && guard++ < 5) {
            addLap(this, true);
            nextAutoLapM += WorkoutState.unitM();
        }
    }

    /** Buzzes once and shows a banner the moment the goal is reached; the workout carries on. */
    private void checkGoal() {
        if (WorkoutState.goalHit || WorkoutState.paused) return;
        long now = System.currentTimeMillis();
        double p = WorkoutState.goalProgress(now);
        if (p >= 1.0) {
            WorkoutState.goalHit = true;
            WorkoutState.banner = "Goal reached!";
            WorkoutState.bannerUntil = now + 8000;
            Haptics.alert(this);
        }
    }

    // ---- interval steps, pace / heart-rate alerts and the cadence beat ----

    private int offTicks = 0;
    private long lastAlertAt = 0;
    private boolean beatPlaying = false;

    private static String stepText(WatchIntervals.Step s, boolean miles) {
        if (s.durMs > 0) return s.label + "  " + WorkoutState.clock(s.durMs / 1000);
        double m = miles ? s.distM / 1609.344 : s.distM / 1000.0;
        return s.label + "  " + (s.distM < 1000 && !miles ? Math.round(s.distM) + " m" : String.format(Locale.US, "%.2f %s", m, miles ? "mi" : "km"));
    }

    /** Moves to the next interval step when this one is done, with a buzz and a banner. */
    private void checkIntervals() {
        WatchIntervals.Step[] steps = WorkoutState.steps;
        if (steps == null || WorkoutState.stepsDone || WorkoutState.paused) return;
        long now = System.currentTimeMillis();
        long elapsed = WorkoutState.elapsedMs(now);
        int idx = WorkoutState.stepIdx;
        if (idx >= steps.length) return;
        WatchIntervals.Step s = steps[idx];
        boolean done = s.durMs > 0
            ? elapsed - WorkoutState.stepStartElapsedMs >= s.durMs
            : WorkoutState.distanceM() - WorkoutState.stepStartDistM >= s.distM;
        if (!done) return;
        int next = idx + 1;
        if (next >= steps.length) {
            WorkoutState.stepsDone = true;
            WorkoutState.banner = "Workout complete";
            WorkoutState.bannerUntil = now + 8000;
            Haptics.alert(this);
            return;
        }
        WorkoutState.stepStartElapsedMs = elapsed;
        WorkoutState.stepStartDistM = WorkoutState.distanceM();
        WorkoutState.stepIdx = next;
        WorkoutState.banner = stepText(steps[next], WorkoutState.miles);
        WorkoutState.bannerUntil = now + 7000;
        if (steps[next].kind == WatchIntervals.WORK) Haptics.alert(this);
        else Haptics.lap(this);
    }

    /** After about 15 seconds off the pace or heart-rate target, buzz and say what to do (at most every 45 seconds). */
    private void checkTargets() {
        if (WorkoutState.paused || (WorkoutState.targetPaceSecPerKm <= 0 && WorkoutState.targetZone <= 0)) return;
        long now = System.currentTimeMillis();
        String verdict = null;
        boolean paceApplies = true;
        WatchIntervals.Step[] steps = WorkoutState.steps;
        if (steps != null && !WorkoutState.stepsDone && WorkoutState.stepIdx < steps.length) {
            paceApplies = steps[WorkoutState.stepIdx].kind == WatchIntervals.WORK;
        }
        if (WorkoutState.targetPaceSecPerKm > 0 && paceApplies && WorkoutState.speedMs > 0.5 && now - WorkoutState.speedAt < 6000) {
            double pace = 1000.0 / WorkoutState.speedMs;
            if (pace > WorkoutState.targetPaceSecPerKm + 10) verdict = "Speed up";
            else if (pace < WorkoutState.targetPaceSecPerKm - 10) verdict = "Slow down";
        }
        if (verdict == null && WorkoutState.targetZone > 0 && WorkoutState.bpm > 0) {
            int z = WorkoutState.zoneOf(WorkoutState.bpm);
            if (z > WorkoutState.targetZone) verdict = "Heart rate high";
            else if (z > 0 && z < WorkoutState.targetZone) verdict = "Heart rate low";
        }
        if (verdict == null) {
            offTicks = 0;
            return;
        }
        offTicks++;
        if (offTicks >= 15 && now - lastAlertAt > 45_000) {
            offTicks = 0;
            lastAlertAt = now;
            WorkoutState.banner = verdict;
            WorkoutState.bannerUntil = now + 5000;
            if ("Slow down".equals(verdict) || "Heart rate high".equals(verdict)) Haptics.alert(this);
            else Haptics.lap(this);
        }
    }

    /** The cadence beat plays while the workout runs and goes quiet when it is paused. */
    private void syncBeat() {
        if (!WatchPrefs.beatOn(this)) {
            if (beatPlaying) {
                Metronome.stop();
                beatPlaying = false;
            }
            return;
        }
        boolean want = !WorkoutState.paused;
        if (want && !beatPlaying) {
            Metronome.start(this, WatchPrefs.beatBpm(this), false);
            beatPlaying = true;
        } else if (!want && beatPlaying) {
            Metronome.stop();
            beatPlaying = false;
        }
    }

    private boolean lastComplicationPaused = false;
    private long lastComplicationAt = 0;

    /** Redraws the watch-face complication when pause state changes, and every 15 s for heart rate. */
    private void refreshComplication() {
        long now = System.currentTimeMillis();
        if (WorkoutState.paused != lastComplicationPaused || now - lastComplicationAt > 15_000) {
            lastComplicationPaused = WorkoutState.paused;
            lastComplicationAt = now;
            KyComplicationService.requestUpdate(this);
        }
    }

    // ---- ending ----

    @Override
    public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        long now = System.currentTimeMillis();
        long elapsed = WorkoutState.elapsedMs(now);
        boolean save = WorkoutState.active && !WorkoutState.discarded && elapsed >= 15_000;
        if (save) saveWorkout(elapsed, now);
        WorkoutState.lastEndedStartedAt = WorkoutState.startedAt;
        WorkoutState.clearGoal();
        WorkoutState.clearPlan();
        Metronome.stop();
        beatPlaying = false;
        WorkoutState.active = false;
        WorkoutState.linkedToPhone = false;
        WorkoutState.paused = false;
        WorkoutState.bpm = 0;
        running = false;
        if (exerciseClient != null) {
            if (callback != null) exerciseClient.clearUpdateCallbackAsync(callback);
            if (exerciseStarted) exerciseClient.endExerciseAsync();
        }
        if (fellBackToHrOnly) stopService(new Intent(this, HeartRateService.class));
        super.onDestroy();
        KyComplicationService.requestUpdate(this);
    }

    private void saveWorkout(long elapsed, long now) {
        WorkoutState.Summary s = new WorkoutState.Summary();
        s.type = WorkoutState.type;
        s.durationMs = elapsed;
        s.distanceM = WorkoutState.distanceM();
        s.avgHr = WorkoutState.hrCount > 0 ? (int) (WorkoutState.hrSum / WorkoutState.hrCount) : 0;
        s.maxHr = WorkoutState.hrMax;
        s.kcal = WorkoutState.kcal > 0 ? WorkoutState.kcal : WorkoutState.phoneKcal;
        s.elevGainM = (int) Math.round(WorkoutState.elevGainM);
        System.arraycopy(WorkoutState.zoneSec, 0, s.zones, 0, 5);
        s.avgPace = s.distanceM >= 20 ? WorkoutState.averagePace(elapsed) : "";
        s.standalone = !WorkoutState.linkedToPhone;
        s.goal = WorkoutState.goalLabel();
        s.goalReached = WorkoutState.goalHit;

        WorkoutStore.add(this, s.type, WorkoutState.startedAt, elapsed, s.avgHr, s.maxHr, s.kcal, WorkoutState.distanceLabel());

        if (s.standalone) {
            // Recorded without the phone: send it over so it appears in the app (delivered whenever the phone is reachable).
            try {
                WorkoutSync.send(this, String.valueOf(WorkoutState.startedAt), payload(s));
                s.sentToPhone = true;
            } catch (RuntimeException | JSONException e) {
                Log.w(TAG, "Could not queue workout for the phone: " + e.getMessage());
            }
        }
        WorkoutState.summary = s;
    }

    private String payload(WorkoutState.Summary s) throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", String.valueOf(WorkoutState.startedAt));
        o.put("type", s.type);
        o.put("startedAt", WorkoutState.startedAt);
        o.put("durationSec", s.durationMs / 1000);
        o.put("distanceM", s.distanceM);
        o.put("elevGainM", s.elevGainM);
        o.put("avgHr", s.avgHr);
        o.put("maxHr", s.maxHr);
        o.put("kcal", s.kcal);
        JSONArray t = new JSONArray();
        for (double[] p : track) {
            JSONArray r = new JSONArray();
            r.put((long) p[0]);
            r.put(p[1]);
            r.put(p[2]);
            if (Double.isNaN(p[3])) r.put(JSONObject.NULL);
            else r.put(p[3]);
            r.put(p[4]);
            t.put(r);
        }
        o.put("track", t);
        JSONArray h = new JSONArray();
        for (long[] p : hrSeries) {
            JSONArray r = new JSONArray();
            r.put(p[0]);
            r.put(p[1]);
            h.put(r);
        }
        o.put("hr", h);
        // The shoes or bike picked on the watch, so the phone counts this workout's mileage toward the right one.
        String gear = WorkoutState.workoutGear;
        if (gear != null && !gear.isEmpty() && !"none".equals(gear)) o.put("shoeId", gear);
        JSONArray l = new JSONArray();
        synchronized (WorkoutState.laps) {
            for (WorkoutState.Lap lap : WorkoutState.laps) {
                JSONArray r = new JSONArray();
                r.put(lap.n);
                r.put(lap.at);
                r.put(lap.distanceM / 1000.0);
                r.put(lap.splitMs / 1000);
                l.put(r);
            }
        }
        o.put("laps", l);
        return o.toString();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** Short description for logs and tests. */
    static String describe() {
        return String.format(Locale.US, "%s %.0fm %ds", WorkoutState.type, WorkoutState.distanceM(), WorkoutState.elapsedMs(System.currentTimeMillis()) / 1000);
    }
}
