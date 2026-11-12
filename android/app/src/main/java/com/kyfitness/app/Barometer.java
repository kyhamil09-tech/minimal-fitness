package com.kyfitness.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

/**
 * Altitude from the phone's barometer, for climbing and descending that GPS alone measures badly (GPS altitude wanders by
 * ten meters or more). Air pressure gives accurate changes in height but not the absolute height, and the weather slowly shifts
 * it, so the barometer is anchored to the GPS altitude at the start and nudged back toward GPS very gently (over a few
 * minutes). The result keeps the barometer's fine detail and GPS's overall level. Without a barometer the GPS altitude is used.
 */
final class Barometer implements SensorEventListener {
    private static final double PRESSURE_SMOOTHING = 0.15;
    private static final double GPS_PULL = 0.003;

    private SensorManager manager;
    private double hpa = Double.NaN;
    private double offset = Double.NaN;
    private volatile boolean used = false;

    boolean start(Context ctx) {
        manager = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        Sensor pressure = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_PRESSURE);
        if (pressure == null) return false;
        return manager.registerListener(this, pressure, SensorManager.SENSOR_DELAY_NORMAL);
    }

    void stop() {
        if (manager != null) manager.unregisterListener(this);
        manager = null;
    }

    boolean used() {
        return used;
    }

    /** The altitude to record for a fix: barometric when available, otherwise the GPS value (NaN when there is none). */
    synchronized double altitude(double gpsAlt) {
        if (Double.isNaN(hpa)) return gpsAlt;
        double baro = SensorManager.getAltitude(SensorManager.PRESSURE_STANDARD_ATMOSPHERE, (float) hpa);
        if (Double.isNaN(offset)) {
            if (Double.isNaN(gpsAlt)) return gpsAlt; // cannot anchor yet
            offset = gpsAlt - baro;
        } else if (!Double.isNaN(gpsAlt)) {
            offset += GPS_PULL * (gpsAlt - (baro + offset));
        }
        used = true;
        return baro + offset;
    }

    @Override
    public synchronized void onSensorChanged(SensorEvent event) {
        double p = event.values[0];
        hpa = Double.isNaN(hpa) ? p : hpa + PRESSURE_SMOOTHING * (p - hpa);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
