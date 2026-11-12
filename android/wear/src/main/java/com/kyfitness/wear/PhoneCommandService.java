package com.kyfitness.wear;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.util.Log;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

/** Receives messages from the phone app: workout state, and heart-rate-only start/stop. */
public class PhoneCommandService extends WearableListenerService {
    @Override
    public void onMessageReceived(MessageEvent event) {
        switch (event.getPath()) {
            case "/ky/workout/state":
                onWorkoutState(new String(event.getData(), StandardCharsets.UTF_8));
                break;
            case "/ky/hr/start":
                startHeartRateOnly();
                break;
            case "/ky/hr/stop":
                stopService(new Intent(this, HeartRateService.class));
                break;
            case "/ky/food/result": {
                // The phone logged the meal that was said into the watch (or could not): say so for a moment.
                final String note = new String(event.getData(), StandardCharsets.UTF_8);
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    Haptics.lap(this);
                    android.widget.Toast.makeText(this, note, android.widget.Toast.LENGTH_LONG).show();
                });
                break;
            }
            case "/ky/detect/notified":
                // The phone already offered to record: stay quiet for a while.
                WatchDetect.onPeerNotified(this);
                break;
            default:
                break;
        }
    }

    private void onWorkoutState(String json) {
        boolean nowActive;
        int oldStep = WorkoutState.phoneStepIndex;
        String oldAlert = WorkoutState.phoneAlert;
        try {
            nowActive = WorkoutState.applyPhone(new JSONObject(json));
        } catch (JSONException e) {
            Log.w("KyWorkout", "Bad workout state: " + e.getMessage());
            return;
        }
        // A buzz when the phone moves to the next interval step, or says you are off pace or heart-rate target.
        if (nowActive && WorkoutState.phoneStepCount > 0 && WorkoutState.phoneStepIndex != oldStep) {
            if ("work".equals(WorkoutState.phoneStepKind) || WorkoutState.phoneStepsDone) Haptics.alert(this);
            else Haptics.lap(this);
        } else if (nowActive && !WorkoutState.phoneAlert.isEmpty() && !WorkoutState.phoneAlert.equals(oldAlert)) {
            Haptics.lap(this);
            WorkoutState.banner = WorkoutState.phoneAlert;
            WorkoutState.bannerUntil = System.currentTimeMillis() + 5000;
        }
        if (!nowActive && WorkoutService.running) {
            // The phone finished the workout: end the exercise here too.
            stopService(new Intent(this, WorkoutService.class));
        }
        // When a workout becomes active the phone also opens the watch app, which starts the
        // sensor service from the foreground (background starts are blocked by Android).
    }

    private void startHeartRateOnly() {
        if (checkSelfPermission(Manifest.permission.BODY_SENSORS) != PackageManager.PERMISSION_GRANTED) {
            Log.w("KyHeartRate", "Remote start ignored: sensor permission not granted yet");
            return;
        }
        try {
            startForegroundService(new Intent(this, HeartRateService.class));
        } catch (RuntimeException e) {
            Log.w("KyHeartRate", "Remote start blocked: " + e.getMessage());
        }
    }
}
