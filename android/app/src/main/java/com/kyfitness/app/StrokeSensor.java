package com.kyfitness.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.PowerManager;

/**
 * Raw movement for working out a rowing stroke rate: the phone's linear acceleration (gravity removed) on three axes, resampled
 * to 25 readings a second over the last 24 seconds. The app finds the stroke rhythm in it (src/lib/strokeRate.ts). The movement
 * is analysed on the phone and never stored or sent anywhere.
 */
final class StrokeSensor implements SensorEventListener {
    static final int RATE_HZ = 25;
    private static final int WINDOW = RATE_HZ * 24;
    private static final long BUCKET_NS = 1_000_000_000L / RATE_HZ;
    private static StrokeSensor instance;

    private final SensorManager manager;
    private final Sensor sensor;
    private PowerManager.WakeLock wakeLock;
    private final float[][] ring = new float[3][WINDOW];
    private int count = 0;
    private long bucket = -1;
    private final float[] sum = new float[3];
    private int n = 0;
    private final float[] last = new float[3];
    // Used only when the phone has no linear-acceleration sensor: gravity estimated with a slow filter.
    private final float[] gravity = new float[3];
    private final boolean rawAccel;

    private StrokeSensor(Context ctx) {
        manager = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        Sensor linear = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        Sensor raw = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        sensor = linear != null ? linear : raw;
        rawAccel = linear == null;
    }

    static synchronized boolean start(Context ctx) {
        stop();
        StrokeSensor s = new StrokeSensor(ctx.getApplicationContext());
        if (s.sensor == null) return false;
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            s.wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kyfitness:stroke");
            s.wakeLock.acquire(6 * 60 * 60 * 1000L);
        }
        if (!s.manager.registerListener(s, s.sensor, SensorManager.SENSOR_DELAY_GAME)) {
            s.release();
            return false;
        }
        instance = s;
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

    /** The newest readings, oldest first: three arrays (x, y, z). Empty until about eight seconds have been collected. */
    static synchronized float[][] window() {
        StrokeSensor s = instance;
        if (s == null) return new float[3][0];
        int have = Math.min(s.count, WINDOW);
        float[][] out = new float[3][have];
        for (int axis = 0; axis < 3; axis++) {
            for (int i = 0; i < have; i++) out[axis][i] = s.ring[axis][(s.count - have + i) % WINDOW];
        }
        return out;
    }

    private void push() {
        for (int a = 0; a < 3; a++) ring[a][count % WINDOW] = n > 0 ? sum[a] / n : last[a];
        if (n > 0) for (int a = 0; a < 3; a++) last[a] = sum[a] / n;
        count++;
        n = 0;
        sum[0] = sum[1] = sum[2] = 0;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        synchronized (StrokeSensor.class) {
            float x = event.values[0], y = event.values[1], z = event.values[2];
            if (rawAccel) {
                gravity[0] += 0.02f * (x - gravity[0]);
                gravity[1] += 0.02f * (y - gravity[1]);
                gravity[2] += 0.02f * (z - gravity[2]);
                x -= gravity[0];
                y -= gravity[1];
                z -= gravity[2];
            }
            long b = event.timestamp / BUCKET_NS;
            if (bucket < 0) bucket = b;
            // Close every finished 40 ms slot (a quiet sensor leaves gaps, which repeat the last reading).
            while (bucket < b) {
                push();
                bucket++;
            }
            sum[0] += x;
            sum[1] += y;
            sum[2] += z;
            n++;
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
