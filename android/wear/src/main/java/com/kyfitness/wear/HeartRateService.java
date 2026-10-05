package com.kyfitness.wear;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.health.services.client.HealthServices;
import androidx.health.services.client.MeasureCallback;
import androidx.health.services.client.MeasureClient;
import androidx.health.services.client.data.Availability;
import androidx.health.services.client.data.DataPointContainer;
import androidx.health.services.client.data.DataType;
import androidx.health.services.client.data.DeltaDataType;
import androidx.health.services.client.data.SampleDataPoint;
import java.util.List;

/**
 * Foreground service that reads live heart rate from Health Services and forwards each reading to
 * the paired phone over the Wear OS Data Layer (path /ky/hr, payload = bpm as ASCII text).
 */
public class HeartRateService extends Service {
    private static final String TAG = "KyHeartRate";
    private static final String CHANNEL_ID = "ky_hr";
    private static final int NOTIFICATION_ID = 1;
    static final String PATH_HR = "/ky/hr";

    /** Latest reading for the on-watch screen; 0 when none yet. */
    static volatile int lastBpm = 0;
    static volatile boolean running = false;
    /** "ok" | "acquiring" | "unavailable" | error text, for the on-watch screen. */
    static volatile String statusText = "";

    private MeasureClient measureClient;
    private MeasureCallback callback;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (running) return START_STICKY;
        startForegroundCompat();
        running = true;
        lastBpm = 0;
        statusText = "acquiring";
        registerHeartRate();
        return START_STICKY;
    }

    private void startForegroundCompat() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Heart rate", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(
            this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Minimal Fitness")
            .setContentText("Sending heart rate to your phone")
            .setSmallIcon(R.drawable.ic_launcher)
            .setOngoing(true)
            .setContentIntent(open)
            .build();
        startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH);
    }

    private void registerHeartRate() {
        measureClient = HealthServices.getClient(this).getMeasureClient();
        callback = new MeasureCallback() {
            @Override
            public void onAvailabilityChanged(@NonNull DeltaDataType<?, ?> dataType, @NonNull Availability availability) {
                statusText = availability.toString().toLowerCase().contains("available") ? "ok" : "acquiring";
            }

            @Override
            public void onDataReceived(@NonNull DataPointContainer data) {
                List<SampleDataPoint<Double>> points = data.getData(DataType.HEART_RATE_BPM);
                if (points.isEmpty()) return;
                double bpm = points.get(points.size() - 1).getValue();
                if (bpm <= 0) return;
                lastBpm = (int) Math.round(bpm);
                statusText = "ok";
                sendToPhone(lastBpm);
            }

            @Override
            public void onRegistered() {
                Log.i(TAG, "Heart-rate callback registered");
            }

            @Override
            public void onRegistrationFailed(@NonNull Throwable throwable) {
                Log.e(TAG, "Heart-rate registration failed", throwable);
                statusText = "sensor error: " + throwable.getMessage();
            }
        };
        measureClient.registerMeasureCallback(DataType.HEART_RATE_BPM, callback);
    }

    private void sendToPhone(int bpm) {
        WorkoutState.bpm = bpm;
        PhoneLink.send(this, PhoneLink.PATH_HR, String.valueOf(bpm));
    }

    @Override
    public void onDestroy() {
        if (measureClient != null && callback != null) {
            measureClient.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, callback);
        }
        running = false;
        lastBpm = 0;
        statusText = "";
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
