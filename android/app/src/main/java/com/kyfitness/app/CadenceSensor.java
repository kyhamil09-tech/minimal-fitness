package com.kyfitness.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.PowerManager;
import android.os.SystemClock;
import java.util.ArrayDeque;

/**
 * Real cadence from the phone's step detector: how many steps you took over the last 15 seconds, as steps per
 * minute. Needs the phone on you (pocket, armband) and the physical-activity permission. A wake lock keeps the
 * readings coming with the screen off.
 */
final class CadenceSensor implements SensorEventListener {
    private static final long WINDOW_MS = 15_000;
    private static CadenceSensor instance;

    private final SensorManager manager;
    private final Sensor sensor;
    private final ArrayDeque<Long> stamps = new ArrayDeque<>();
    private PowerManager.WakeLock wakeLock;
    private volatile int total = 0;

    private CadenceSensor(Context ctx) {
        manager = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        sensor = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
    }

    static synchronized boolean start(Context ctx) {
        stop();
        CadenceSensor c = new CadenceSensor(ctx.getApplicationContext());
        if (c.sensor == null) return false;
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            c.wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kyfitness:cadence");
            c.wakeLock.acquire(6 * 60 * 60 * 1000L);
        }
        boolean ok = c.manager.registerListener(c, c.sensor, SensorManager.SENSOR_DELAY_FASTEST, 0);
        if (!ok) {
            c.release();
            return false;
        }
        instance = c;
        return true;
    }

    static synchronized void stop() {
        if (instance != null) {
            instance.manager.unregisterListener(instance);
            instance.release();
            instance = null;
        }
    }

    private void release() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    /** Steps per minute over the last 15 seconds, or 0 when there are too few steps to tell. */
    static synchronized int spm() {
        CadenceSensor c = instance;
        if (c == null) return 0;
        long now = SystemClock.elapsedRealtime();
        while (!c.stamps.isEmpty() && now - c.stamps.peekFirst() > WINDOW_MS) c.stamps.pollFirst();
        int n = c.stamps.size();
        if (n < 8) return 0;
        long span = Math.max(4000, now - c.stamps.peekFirst());
        return (int) Math.round(n * 60000.0 / Math.min(WINDOW_MS, span));
    }

    static synchronized int totalSteps() {
        return instance == null ? 0 : instance.total;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        synchronized (CadenceSensor.class) {
            stamps.addLast(SystemClock.elapsedRealtime());
            total++;
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}