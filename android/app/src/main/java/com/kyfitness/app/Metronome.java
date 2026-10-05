package com.kyfitness.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * A steady click for pacing your steps. Runs on its own thread with a wake lock, so the beat stays even while
 * the screen is off or the app is in the background. Timing is drift-free: each beat is scheduled from the
 * previous beat's due time, not from when it actually fired.
 */
final class Metronome {
    private static final int SAMPLE_RATE = 44100;
    private static final Object LOCK = new Object();

    private static HandlerThread thread;
    private static Handler handler;
    private static AudioTrack high;
    private static AudioTrack low;
    private static PowerManager.WakeLock wakeLock;
    private static volatile boolean running = false;
    private static volatile double periodMs = 60000.0 / 170;
    private static boolean alternate = false;
    private static int beat = 0;
    private static double nextAt = 0;

    private Metronome() {}

    /** A short decaying sine, like a wood-block click. */
    private static AudioTrack makeClick(int freqHz, double decay, int ms, float volume) {
        int n = SAMPLE_RATE * ms / 1000;
        short[] pcm = new short[n];
        for (int i = 0; i < n; i++) {
            double t = i / (double) SAMPLE_RATE;
            double env = Math.exp(-t * decay);
            pcm[i] = (short) (Math.sin(2 * Math.PI * freqHz * t) * env * 30000);
        }
        AudioTrack track = new AudioTrack.Builder()
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build())
            .setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build())
            .setBufferSizeInBytes(n * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build();
        track.write(pcm, 0, n);
        track.setVolume(volume);
        return track;
    }

    private static void play(AudioTrack t) {
        try {
            t.stop();
            t.reloadStaticData();
            t.play();
        } catch (IllegalStateException ignored) {
            // the track was released while stopping
        }
    }

    private static final Runnable TICK = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            play(alternate && (beat % 2 == 1) ? low : high);
            beat++;
            nextAt += periodMs;
            // If the phone was asleep and we fell far behind, skip ahead instead of firing a burst of clicks.
            double now = SystemClock.uptimeMillis();
            if (nextAt < now - periodMs) nextAt = now + periodMs;
            handler.postAtTime(this, (long) nextAt);
        }
    };

    /** tone 0 = click, 1 = wood block, 2 = beep. volume 0..1. */
    static void start(Context ctx, int bpm, boolean alternateSides, float volume, int tone) {
        synchronized (LOCK) {
            stop();
            periodMs = 60000.0 / Math.max(60, Math.min(240, bpm));
            alternate = alternateSides;
            beat = 0;
            float v = Math.max(0.1f, Math.min(1f, volume));
            if (tone == 1) {
                high = makeClick(820, 70.0, 45, v);
                low = makeClick(610, 70.0, 45, v);
            } else if (tone == 2) {
                high = makeClick(1500, 28.0, 70, v);
                low = makeClick(1050, 28.0, 70, v);
            } else {
                high = makeClick(1100, 110.0, 35, v);
                low = makeClick(780, 110.0, 35, v);
            }
            thread = new HandlerThread("ky-metronome", android.os.Process.THREAD_PRIORITY_URGENT_AUDIO);
            thread.start();
            handler = new Handler(thread.getLooper());
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kyfitness:metronome");
                wakeLock.acquire(6 * 60 * 60 * 1000L);
            }
            running = true;
            nextAt = SystemClock.uptimeMillis() + 200;
            handler.postAtTime(TICK, (long) nextAt);
        }
    }

    static void setBpm(int bpm) {
        periodMs = 60000.0 / Math.max(60, Math.min(240, bpm));
    }

    static void stop() {
        synchronized (LOCK) {
            running = false;
            if (handler != null) handler.removeCallbacksAndMessages(null);
            if (thread != null) thread.quitSafely();
            thread = null;
            handler = null;
            if (high != null) high.release();
            if (low != null) low.release();
            high = null;
            low = null;
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            wakeLock = null;
        }
    }
}
