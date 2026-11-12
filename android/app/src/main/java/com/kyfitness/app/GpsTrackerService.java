package com.kyfitness.app;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * Foreground service that keeps recording GPS fixes while the screen is off.
 *
 * Android's own GPS comes first, through the platform {@link LocationManager}: it works on every phone, with or without Google, and
 * the positions go nowhere but this app. Google's fused provider is only a backup, used if the phone's GPS cannot be started at all.
 * Both feed the same recorder, so nothing else changes.
 */
public class GpsTrackerService extends Service {
    private static final String TAG = "KyGps";
    private static final String CHANNEL_ID = "ky_gps";
    private static final int NOTIFICATION_ID = 11;

    private boolean started = false;
    private long interval = 1000;
    private FusedLocationProviderClient client;
    private LocationCallback callback;
    private LocationManager platform;
    private LocationListener platformListener;
    private final Barometer barometer = new Barometer();

    /** True when Google Play services can supply locations on this phone. */
    private static boolean googleLocationAvailable(Context c) {
        try {
            return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(c) == ConnectionResult.SUCCESS;
        } catch (Throwable t) {
            return false;
        }
    }

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
            .addAction(0, "Pause / resume", PendingIntent.getActivity(
                this, 21,
                new Intent(this, MainActivity.class).setAction("ky.run.toggle").putExtra(LaunchBridge.EXTRA, "run:toggle")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .build();
        // The Quick Settings tile shows whether a run is in progress.
        android.service.quicksettings.TileService.requestListeningState(this, new android.content.ComponentName(this, RunTileService.class));
        // The foreground-service type argument exists from Android 10; on Android 8 and 9 the plain call is the only one there is.
        if (android.os.Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(NOTIFICATION_ID, n);

        if (!started) {
            started = true;
            barometer.start(this);
            // Battery saver records a fix every 5 seconds instead of every second.
            interval = intent != null && intent.getBooleanExtra("saver", false) ? 5000 : 1000;
            acquireWakeLock();
            // Privacy first: the phone's own GPS, and Google only if that cannot run.
            if (!startPlatform() && googleLocationAvailable(this)) startGoogle();
        }
        return START_NOT_STICKY;
    }

    /** One fix, from whichever provider: filtered, matched with the barometer, and handed to the recorder. */
    private void handleLocation(Location l) {
        // A provider sometimes returns an old cached position when the signal drops. It is not where you are.
        long ageMs = (android.os.SystemClock.elapsedRealtimeNanos() - l.getElapsedRealtimeNanos()) / 1_000_000L;
        if (ageMs > 10_000L) return;
        // Barometric altitude when the phone has a barometer, anchored to GPS; plain GPS altitude otherwise.
        double alt = barometer.altitude(l.hasAltitude() ? l.getAltitude() : Double.NaN);
        if (barometer.used()) SampleBuffer.noteBarometer();
        // The chip's own Doppler speed and heading: far steadier than speed worked out from positions.
        double speed = l.hasSpeed() && (android.os.Build.VERSION.SDK_INT < 26 || !l.hasSpeedAccuracy() || l.getSpeedAccuracyMetersPerSecond() < 3f) ? l.getSpeed() : Double.NaN;
        double acc = l.hasAccuracy() ? l.getAccuracy() : Double.NaN;
        SampleBuffer.addFix(l.getTime(), l.getLatitude(), l.getLongitude(), alt, acc, speed, l.hasBearing() ? l.getBearing() : Double.NaN);
        // Pauses itself when you stop and carries on when you move again, which has to happen here: the screen (and the web view) may be off.
        AutoPauseDetector.Action a = SampleBuffer.autoPauseFix(l.getTime(), l.getLatitude(), l.getLongitude(), acc, speed);
        if (a == AutoPauseDetector.Action.PAUSE) RunCoach.setPaused(true);
        else if (a == AutoPauseDetector.Action.RESUME) RunCoach.setPaused(false);
        RunCoach.onFix(l.getTime(), l.getLatitude(), l.getLongitude(), acc);
    }

    @SuppressLint("MissingPermission")
    private void startGoogle() {
        client = LocationServices.getFusedLocationProviderClient(this);
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                for (Location l : result.getLocations()) handleLocation(l);
            }
        };
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
            .setMinUpdateIntervalMillis(interval)
            .setMinUpdateDistanceMeters(0f)
            .setMaxUpdateDelayMillis(interval)
            .setWaitForAccurateLocation(false)
            .build();
        try {
            client.requestLocationUpdates(request, callback, getMainLooper())
                .addOnFailureListener(e -> Log.w(TAG, "Google location could not start either: " + e));
        } catch (SecurityException e) {
            stopSelf(); // permission was revoked; the app reports no route
        }
    }

    /**
     * Android's own GPS: no Google needed, and nothing leaves the phone.
     *
     * @return true when it is running (or the permission is gone, which no provider can work around), false when this phone has no GPS
     *     provider to listen to and the backup should be tried.
     */
    @SuppressLint("MissingPermission")
    private boolean startPlatform() {
        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null || !lm.getAllProviders().contains(LocationManager.GPS_PROVIDER)) return false;
        platform = lm;
        platformListener = new LocationListener() {
            @Override
            public void onLocationChanged(@NonNull Location location) {
                handleLocation(location);
            }

            // On Android 11 and newer these have default bodies; older versions need them spelled out.
            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {}

            @Override
            public void onProviderEnabled(@NonNull String provider) {}

            @Override
            public void onProviderDisabled(@NonNull String provider) {}
        };
        try {
            platform.requestLocationUpdates(LocationManager.GPS_PROVIDER, interval, 0f, platformListener, getMainLooper());
            return true;
        } catch (SecurityException e) {
            stopSelf(); // permission was revoked; the app reports no route
            return true;
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "The phone's GPS could not be started: " + e);
            platform = null;
            platformListener = null;
            return false;
        }
    }

    private android.os.PowerManager.WakeLock wakeLock;

    /**
     * Keeps the processor awake while recording, so a phone's battery manager cannot freeze the app between fixes with the screen off.
     * It is released when the workout ends, and times out after eight hours in case that never happens.
     */
    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "kyfitness:gps");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(8L * 60 * 60 * 1000);
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        if (client != null && callback != null) client.removeLocationUpdates(callback);
        if (platform != null && platformListener != null) platform.removeUpdates(platformListener);
        barometer.stop();
        client = null;
        callback = null;
        platform = null;
        platformListener = null;
        started = false;
        android.service.quicksettings.TileService.requestListeningState(this, new android.content.ComponentName(this, RunTileService.class));
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
