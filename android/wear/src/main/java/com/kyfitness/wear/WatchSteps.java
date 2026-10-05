package com.kyfitness.wear;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import androidx.core.content.ContextCompat;
import androidx.health.services.client.HealthServices;
import androidx.health.services.client.PassiveMonitoringClient;
import androidx.health.services.client.data.DataType;
import androidx.health.services.client.data.PassiveListenerConfig;
import androidx.health.services.client.data.PassiveMonitoringCapabilities;
import androidx.health.services.client.data.UserActivityState;
import com.google.common.util.concurrent.ListenableFuture;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

/** Today's step count on the watch: stored locally for the tile and sent to the phone. Also owns the all-day registration. */
final class WatchSteps {
    private static final String PREFS = "ky_watch_steps";
    private static final String TAG = "KyWatchVitals";

    private WatchSteps() {}

    static void store(Context c, int steps) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("day", LocalDate.now().toString())
            .putInt("steps", steps)
            .apply();
    }

    static int today(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return LocalDate.now().toString().equals(p.getString("day", "")) ? p.getInt("steps", 0) : 0;
    }

    /**
     * Asks Health Services to deliver, to {@link StepsPassiveService} and even when the app is closed, the daily step
     * total and, unless all-day tracking is switched off, heart rate, calories, distance, floors and the
     * asleep/awake state. Only what this watch supports is requested: asking for more makes the whole request fail.
     */
    static void register(Context c) {
        final Context app = c.getApplicationContext();
        try {
            final PassiveMonitoringClient client = HealthServices.getClient(app).getPassiveMonitoringClient();
            final ListenableFuture<PassiveMonitoringCapabilities> caps = client.getCapabilitiesAsync();
            caps.addListener(() -> {
                try {
                    PassiveMonitoringCapabilities have = caps.get();
                    Set<DataType<?, ?>> supported = have.getSupportedDataTypesPassiveMonitoring();
                    boolean allDay = WatchPrefs.allDay(app);
                    Set<DataType<?, ?>> types = new HashSet<>();
                    if (supported.contains(DataType.STEPS_DAILY)) types.add(DataType.STEPS_DAILY);
                    if (allDay) {
                        DataType<?, ?>[] extra = {DataType.HEART_RATE_BPM, DataType.CALORIES_DAILY, DataType.DISTANCE_DAILY, DataType.FLOORS_DAILY};
                        for (DataType<?, ?> t : extra) if (supported.contains(t)) types.add(t);
                    }
                    boolean sleepState = allDay && have.getSupportedUserActivityStates().contains(UserActivityState.USER_ACTIVITY_ASLEEP);
                    PassiveListenerConfig config = new PassiveListenerConfig.Builder()
                        .setDataTypes(types)
                        .setShouldUserActivityInfoBeRequested(sleepState)
                        .build();
                    Log.i(TAG, "registering " + types.size() + " data types, sleep state " + sleepState);
                    client.setPassiveListenerServiceAsync(StepsPassiveService.class, config);
                    // The half-hourly flush keeps the phone from falling behind; it only runs with all-day tracking on.
                    if (allDay) VitalsAlarmReceiver.schedule(app);
                    else VitalsAlarmReceiver.cancel(app);
                } catch (Exception e) {
                    Log.w(TAG, "could not register all-day tracking: " + e);
                }
            }, ContextCompat.getMainExecutor(app));
        } catch (RuntimeException e) {
            // permission not granted yet: registration is retried the next time the app opens
            Log.w(TAG, "registration skipped: " + e);
        }
    }

    /** Asks Health Services to deliver the readings it is holding right now to {@link StepsPassiveService}. */
    static void flush(Context c) {
        try {
            HealthServices.getClient(c.getApplicationContext()).getPassiveMonitoringClient().flushAsync();
        } catch (RuntimeException e) {
            Log.w(TAG, "flush skipped: " + e);
        }
    }

    static void sendToPhone(Context c, int steps) {
        PhoneLink.send(c, "/ky/steps", LocalDate.now() + ":" + steps);
    }
}
