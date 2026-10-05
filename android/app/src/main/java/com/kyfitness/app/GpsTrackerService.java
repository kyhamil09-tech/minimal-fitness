package com.kyfitness.app;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/** Foreground service that keeps recording GPS fixes while the screen is off. */
public class GpsTrackerService extends Service {
    private static final String CHANNEL_ID = "ky_gps";
    private static final int NOTIFICATION_ID = 11;

    private FusedLocationProviderClient client;
    private LocationCallback callback;
    private final Barometer barometer = new Barometer();

    @SuppressLint("MissingPermission")
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Workout tracking", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(
            this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Minimal Fitness")
            .setContentText("Recording your workout route")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setOngoing(true)
            .setContentIntent(open)
            .build();
        startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);

        if (client == null) {
            client = LocationServices.getFusedLocationProviderClient(this);
            barometer.start(this);
            callback = new LocationCallback() {
                @Override
                public void onLocationResult(LocationResult result) {
                    for (Location l : result.getLocations()) {
                        // Barometric altitude when the phone has a barometer, anchored to GPS; plain GPS altitude otherwise.
                        double alt = barometer.altitude(l.hasAltitude() ? l.getAltitude() : Double.NaN);
                        if (barometer.used()) SampleBuffer.noteBarometer();
                        SampleBuffer.addFix(
                            l.getTime(), l.getLatitude(), l.getLongitude(),
                            alt,
                            l.hasAccuracy() ? l.getAccuracy() : Double.NaN);
                        RunCoach.onFix(l.getTime(), l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? l.getAccuracy() : Double.NaN);
                        LiveShare.onFix(l.getTime(), l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? l.getAccuracy() : Double.NaN);
                    }
                }
            };
            // Battery saver records a fix every 5 seconds instead of every second.
            long interval = intent != null && intent.getBooleanExtra("saver", false) ? 5000 : 1000;
            LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
                .setMinUpdateIntervalMillis(interval)
                .setWaitForAccurateLocation(false)
                .build();
            try {
                client.requestLocationUpdates(request, callback, getMainLooper());
            } catch (SecurityException e) {
                stopSelf(); // permission was revoked; the app reports no route
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (client != null && callback != null) client.removeLocationUpdates(callback);
        barometer.stop();
        client = null;
        callback = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}