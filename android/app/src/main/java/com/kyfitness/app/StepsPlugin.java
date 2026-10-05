package com.kyfitness.app;

import android.Manifest;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.TimeUnit;

/** Counts steps with the phone's hardware step counter (works with the screen off) and adds the watch's total. */
@CapacitorPlugin(
    name = "Steps",
    permissions = {@Permission(strings = {Manifest.permission.ACTIVITY_RECOGNITION}, alias = "activity")}
)
public class StepsPlugin extends Plugin {

    private boolean hasPermission() {
        return Build.VERSION.SDK_INT < 29 || getPermissionState("activity") == PermissionState.GRANTED;
    }

    private Sensor sensor() {
        SensorManager sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        return sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
    }

    private JSObject totals() {
        JSObject o = new JSObject();
        o.put("sensor", sensor() != null);
        o.put("permission", hasPermission());
        o.put("phone", StepStore.phoneToday(getContext()));
        o.put("watch", StepStore.watchToday(getContext()));
        o.put("day", StepStore.today());
        return o;
    }

    /** Asks for the activity-recognition permission if needed and starts the background sampling. */
    @PluginMethod
    public void start(PluginCall call) {
        if (!hasPermission()) {
            requestPermissionForAlias("activity", call, "permissionResult");
            return;
        }
        schedule();
        read(call);
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        if (hasPermission()) {
            schedule();
            read(call);
        } else {
            call.resolve(totals());
        }
    }

    private void schedule() {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(StepSampleWorker.class, 15, TimeUnit.MINUTES).build();
        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork("ky_steps", ExistingPeriodicWorkPolicy.KEEP, req);
    }

    /** Cancels the 15-minute sampling, so the phone's own step counter is no longer read in the background. */
    @PluginMethod
    public void stop(PluginCall call) {
        WorkManager.getInstance(getContext()).cancelUniqueWork("ky_steps");
        call.resolve();
    }

    @PluginMethod
    public void getToday(PluginCall call) {
        // sensor=false answers from what is already stored (the watch's total) without waking the phone's counter.
        if (!call.getBoolean("sensor", true) || !hasPermission()) {
            call.resolve(totals());
            return;
        }
        read(call);
    }

    /** Takes one fresh counter reading, then answers with today's totals. */
    private void read(final PluginCall call) {
        final Sensor s = sensor();
        if (s == null) {
            call.resolve(totals());
            return;
        }
        final SensorManager sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        final Handler main = new Handler(Looper.getMainLooper());
        final boolean[] done = {false};
        final SensorEventListener[] holder = new SensorEventListener[1];
        final Runnable finish = () -> {
            if (done[0]) return;
            done[0] = true;
            sm.unregisterListener(holder[0]);
            call.resolve(totals());
        };
        holder[0] = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                if (event.values.length > 0) StepStore.sample(getContext(), event.values[0]);
                main.removeCallbacksAndMessages(null);
                finish.run();
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        };
        sm.registerListener(holder[0], s, SensorManager.SENSOR_DELAY_NORMAL);
        main.postDelayed(finish, 3000);
    }
}