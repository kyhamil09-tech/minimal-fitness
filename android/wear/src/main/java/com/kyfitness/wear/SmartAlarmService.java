package com.kyfitness.wear;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

/**
 * The smart alarm while its window is open: it listens to the wrist's movement and heart rate for at most the window (30 minutes by
 * default) and buzzes your wrist at the first good moment, or at the wake time if it saw none. Sensors are only on during the window,
 * so the battery cost is small. Nothing is recorded or sent.
 */
public class SmartAlarmService extends Service implements SensorEventListener {
    private static final String CHANNEL = "ky_smart_alarm";
    private static final int ID = 7701;
    private static final String ACTION_STOP = "com.kyfitness.wear.SMART_ALARM_STOP";

    private SensorManager sensors;
    private WakeDetector detector;
    private PowerManager.WakeLock lock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long deadline;
    private boolean buzzing = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopAll();
            return START_NOT_STICKY;
        }
        if (detector != null) return START_NOT_STICKY;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Smart alarm", NotificationManager.IMPORTANCE_LOW));
        Notification n = notification("Smart alarm listening", "Will wake you at a gentle moment before " + clock(SmartAlarm.wakeMin(this)), false);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH);
        else startForeground(ID, n);

        int windowMin = SmartAlarm.windowMin(this);
        long now = System.currentTimeMillis();
        detector = new WakeDetector(now);
        deadline = now + windowMin * 60_000L;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kyfit:smartalarm");
        lock.acquire(windowMin * 60_000L + 60_000L);
        sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        Sensor hr = sensors.getDefaultSensor(Sensor.TYPE_HEART_RATE);
        Sensor acc = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        try {
            if (hr != null) sensors.registerListener(this, hr, SensorManager.SENSOR_DELAY_NORMAL);
        } catch (SecurityException e) {
            Log.w("KySmartAlarm", "No heart-rate permission: movement only");
        }
        if (acc != null) sensors.registerListener(this, acc, SensorManager.SENSOR_DELAY_NORMAL);
        handler.postDelayed(this::wake, windowMin * 60_000L); // the wake time itself, if nothing showed a better moment
        return START_NOT_STICKY;
    }

    private static String clock(int min) {
        return String.format("%d:%02d", (min / 60 + 11) % 12 + 1, min % 60) + (min / 60 >= 12 ? " PM" : " AM");
    }

    private Notification notification(String title, String text, boolean stopAction) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_heart).setContentTitle(title).setContentText(text).setOngoing(true);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, SmartAlarmService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        b.addAction(new Notification.Action.Builder(null, stopAction ? "Dismiss" : "Cancel", stop).build());
        return b.build();
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        if (detector == null || buzzing) return;
        long now = System.currentTimeMillis();
        if (e.sensor.getType() == Sensor.TYPE_HEART_RATE) detector.onHeartRate(e.values[0]);
        else if (e.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            double m = Math.sqrt(e.values[0] * e.values[0] + e.values[1] * e.values[1] + e.values[2] * e.values[2]);
            detector.onAccel(now, m);
        }
        if (detector.shouldWake(now)) wake();
    }

    private void wake() {
        if (buzzing) return;
        buzzing = true;
        if (sensors != null) sensors.unregisterListener(this);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(ID, notification("Good morning", "Time to wake up. Tap Dismiss to stop the buzz.", true));
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null) {
            long[] pattern = {0, 600, 400, 600, 400, 900, 1500};
            v.vibrate(VibrationEffect.createWaveform(pattern, 0));
        }
        handler.postDelayed(this::stopAll, 120_000L); // never buzz for more than two minutes
    }

    private void stopAll() {
        handler.removeCallbacksAndMessages(null);
        if (sensors != null) sensors.unregisterListener(this);
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null) v.cancel();
        if (lock != null && lock.isHeld()) lock.release();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (sensors != null) sensors.unregisterListener(this);
        if (lock != null && lock.isHeld()) lock.release();
        super.onDestroy();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
