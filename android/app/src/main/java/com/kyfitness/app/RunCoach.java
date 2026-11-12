package com.kyfitness.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Speaks a short update each kilometer or mile while a GPS workout runs: lap time, pace and (optionally)
 * heart rate. It runs inside the location service, so the cues keep coming with the screen off.
 */
final class RunCoach {
    private static final double MAX_ACCURACY_M = 40;
    private static final double MIN_STEP_KM = 0.004;
    private static final double MAX_SPEED_KMH = 45;

    private static Context app;
    private static TextToSpeech tts;
    private static boolean ttsReady = false;
    private static AudioFocusRequest focus;

    /** Spoken interval cues (Run, Walk, the warning and the countdown): on whether or not the running updates are. */
    private static boolean intervalCues = false;
    /** The voice chosen in Settings, or empty for the best one installed. */
    private static String preferredVoice = "";
    /** Cues asked for before the voice engine was ready: spoken as soon as it is. */
    private static final List<String> pendingCues = new ArrayList<>();
    private static TextToSpeech previewTts;

    private static boolean enabled = false;
    private static boolean speakHeartRate = true;
    private static double unitKm = 1.0;
    private static String unitName = "kilometer";
    /** Distance between updates in km (0 when announcing by time) and minutes between updates (0 when by distance). */
    private static double stepKm = 1.0;
    private static long everyMs = 0;
    private static boolean sayDistance = false;
    private static boolean sayTime = true;
    private static boolean sayPace = true;
    private static long nextTimeMs = 0;
    private static double lastAnnounceKm = 0;

    private static long startMs = 0;
    private static long pausedAccumMs = 0;
    private static long pausedSince = 0;

    private static double lastLat = Double.NaN;
    private static double lastLng = Double.NaN;
    private static long lastTs = 0;
    private static double distanceKm = 0;
    private static int nextUnit = 1;
    private static long lastBoundaryElapsedMs = 0;

    private RunCoach() {}

    static synchronized void begin(Context context, boolean cuesOn, boolean miles, boolean hr) {
        begin(context, cuesOn, miles, hr, miles ? 1.609344 : 1.0, 0, false, true, true);
    }

    static synchronized void begin(Context context, boolean cuesOn, boolean miles, boolean hr,
                                   double everyKm, int everyMin, boolean distance, boolean time, boolean pace) {
        begin(context, cuesOn, miles, hr, everyKm, everyMin, distance, time, pace, false, "");
    }

    static synchronized void begin(Context context, boolean cuesOn, boolean miles, boolean hr,
                                   double everyKm, int everyMin, boolean distance, boolean time, boolean pace,
                                   boolean intervals, String voice) {
        app = context.getApplicationContext();
        intervalCues = intervals;
        preferredVoice = voice == null ? "" : voice;
        stepKm = everyMin > 0 ? 0 : Math.max(0.1, everyKm);
        everyMs = everyMin > 0 ? everyMin * 60_000L : 0;
        nextTimeMs = everyMs;
        sayDistance = distance;
        sayTime = time;
        sayPace = pace;
        lastAnnounceKm = 0;
        enabled = cuesOn;
        speakHeartRate = hr;
        unitKm = miles ? 1.609344 : 1.0;
        unitName = miles ? "mile" : "kilometer";
        startMs = System.currentTimeMillis();
        pausedAccumMs = 0;
        pausedSince = 0;
        lastLat = Double.NaN;
        lastLng = Double.NaN;
        distanceKm = 0;
        nextUnit = 1;
        lastBoundaryElapsedMs = 0;
        if (enabled || intervalCues) ensureTts();
    }

    static synchronized void end() {
        enabled = false;
        intervalCues = false;
        pendingCues.clear();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
            ttsReady = false;
        }
    }

    static synchronized void setPaused(boolean paused) {
        long now = System.currentTimeMillis();
        if (paused && pausedSince == 0) {
            pausedSince = now;
            lastLat = Double.NaN; // don't count the walk across a pause
            say("Paused");
        } else if (!paused && pausedSince != 0) {
            pausedAccumMs += now - pausedSince;
            pausedSince = 0;
            say("Resumed");
        }
    }

    private static long elapsedMs(long now) {
        long end = pausedSince != 0 ? pausedSince : now;
        return Math.max(0, end - startMs - pausedAccumMs);
    }

    static synchronized void onFix(long ts, double lat, double lng, double accuracy) {
        if (!enabled || pausedSince != 0) return;
        if (!Double.isNaN(accuracy) && accuracy > MAX_ACCURACY_M) return;
        if (Double.isNaN(lastLat)) {
            lastLat = lat;
            lastLng = lng;
            lastTs = ts;
            return;
        }
        double step = haversineKm(lastLat, lastLng, lat, lng);
        double hours = (ts - lastTs) / 3_600_000.0;
        if (step < MIN_STEP_KM) return;
        if (hours > 0 && step / hours > MAX_SPEED_KMH) return;
        distanceKm += step;
        lastLat = lat;
        lastLng = lng;
        lastTs = ts;

        if (everyMs > 0) {
            // By time: speak when the next interval has passed, with the pace over that stretch.
            long elapsed = elapsedMs(System.currentTimeMillis());
            if (elapsed >= nextTimeMs) {
                long lap = Math.max(1, elapsed - lastBoundaryElapsedMs);
                announce(0, elapsed, lap, distanceKm - lastAnnounceKm);
                lastBoundaryElapsedMs = elapsed;
                lastAnnounceKm = distanceKm;
                while (nextTimeMs <= elapsed) nextTimeMs += everyMs;
            }
            return;
        }
        while (distanceKm >= nextUnit * stepKm) {
            long elapsed = elapsedMs(System.currentTimeMillis());
            long lap = Math.max(1, elapsed - lastBoundaryElapsedMs);
            lastBoundaryElapsedMs = elapsed;
            announce(Math.abs(stepKm - unitKm) < 1e-6 ? nextUnit : 0, elapsed, lap, stepKm);
            lastAnnounceKm = nextUnit * stepKm;
            nextUnit++;
        }
    }

    /**
     * Speaks one update. `unit` is the whole kilometer or mile just completed (0 when updates are not on the unit);
     * `deltaKm` is how far you went since the last update, used for the pace over that stretch.
     */
    private static void announce(int unit, long elapsedMs, long lapMs, double deltaKm) {
        StringBuilder s = new StringBuilder();
        if (unit > 0) {
            s.append(unitName.substring(0, 1).toUpperCase(Locale.US)).append(unitName.substring(1)).append(' ').append(unit).append(". ");
        }
        if (sayDistance || unit == 0) {
            double shown = distanceKm / unitKm;
            s.append("Distance ").append(String.format(Locale.US, "%.2f", shown)).append(' ').append(unitName).append(Math.abs(shown - 1) < 0.005 ? "" : "s").append(". ");
        }
        if (sayTime) s.append("Time ").append(spokenDuration(elapsedMs / 1000)).append(". ");
        if (sayPace && deltaKm > 0.02) {
            long paceSec = Math.round((lapMs / 1000.0) / (deltaKm / unitKm));
            s.append("Pace ").append(spokenDuration(paceSec)).append(" per ").append(unitName).append('.');
        }
        if (speakHeartRate) {
            long[] last = lastHeartRate();
            if (last != null) s.append(" Heart rate ").append(last[1]).append('.');
        }
        say(s.toString());
    }

    /** Most recent heart rate from the last 15 seconds, or null. */
    private static long[] lastHeartRate() {
        int n = SampleBuffer.heartRateCount();
        if (n == 0) return null;
        java.util.List<long[]> tail = SampleBuffer.heartRateFrom(n - 1);
        if (tail.isEmpty()) return null;
        long[] r = tail.get(0);
        return System.currentTimeMillis() - r[0] <= 15_000 ? r : null;
    }

    private static String spokenDuration(long totalSeconds) {
        long h = totalSeconds / 3600;
        long m = (totalSeconds % 3600) / 60;
        long s = totalSeconds % 60;
        StringBuilder b = new StringBuilder();
        if (h > 0) b.append(h).append(h == 1 ? " hour " : " hours ");
        if (m > 0 || h > 0) b.append(m).append(m == 1 ? " minute " : " minutes ");
        b.append(s).append(s == 1 ? " second" : " seconds");
        return b.toString().trim();
    }

    private static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double r = 6371;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    // ---- speech ----

    private static void ensureTts() {
        if (tts != null || app == null) return;
        tts = new TextToSpeech(app, status -> {
            synchronized (RunCoach.class) {
                ttsReady = status == TextToSpeech.SUCCESS;
                if (ttsReady && tts != null) {
                    tts.setLanguage(Locale.getDefault());
                    applyVoice(tts, preferredVoice);
                    // A little slower than the default, which sounds hurried and flat, reads more naturally.
                    tts.setSpeechRate(0.95f);
                    tts.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) {}
                        @Override public void onDone(String id) { abandonFocus(); }
                        @Override public void onError(String id) { abandonFocus(); }
                    });
                    for (String text : new ArrayList<>(pendingCues)) speak(text, false);
                    pendingCues.clear();
                }
            }
        });
    }

    /** Speaks text if cues are enabled (used for lap announcements from the app). */
    static synchronized void say(String text) {
        if (!enabled || !ttsReady || tts == null || app == null) return;
        speak(text, false);
    }

    /**
     * Speaks an interval cue (Run, Walk, the ten-second warning, 3-2-1). These do not depend on the running updates being on, and a
     * countdown number cuts off whatever is still being said so it lands on its second.
     */
    static synchronized void sayCue(String text, boolean flush) {
        if (app == null || text == null || text.isEmpty()) return;
        if (!ttsReady || tts == null) {
            ensureTts();
            if (pendingCues.size() < 4) pendingCues.add(text);
            return;
        }
        speak(text, flush);
    }

    private static void speak(String text, boolean flush) {
        if (tts == null || app == null) return;
        AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        if (am != null) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build())
                .build();
            am.requestAudioFocus(focus);
        }
        tts.speak(text, flush ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, "ky-" + System.nanoTime());
    }

    // ---- choosing a natural voice ----

    /** How good a voice is likely to sound: its quality first, then that it works without signal, then a match for your region. */
    private static int score(Voice v, Locale locale) {
        int s = v.getQuality() * 10;
        if (!v.isNetworkConnectionRequired()) s += 1200;
        if (v.getLocale().getCountry().equals(locale.getCountry())) s += 50;
        if (v.getLatency() <= Voice.LATENCY_LOW) s += 5;
        return s;
    }

    private static boolean usable(Voice v, Locale locale) {
        if (v.getLocale() == null || !v.getLocale().getLanguage().equals(locale.getLanguage())) return false;
        Set<String> features = v.getFeatures();
        return features == null || !features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
    }

    /** The best installed voice for the language, or null. */
    static Voice bestVoice(Set<Voice> voices, Locale locale) {
        Voice best = null;
        int bestScore = Integer.MIN_VALUE;
        if (voices == null) return null;
        for (Voice v : voices) {
            if (!usable(v, locale)) continue;
            int s = score(v, locale);
            if (s > bestScore) {
                best = v;
                bestScore = s;
            }
        }
        return best;
    }

    /** Uses the voice you picked (by name) or, with none picked, the best one. */
    static void applyVoice(TextToSpeech t, String name) {
        try {
            Set<Voice> voices = t.getVoices();
            if (voices == null) return;
            Voice chosen = null;
            if (name != null && !name.isEmpty()) for (Voice v : voices) if (v.getName().equals(name)) chosen = v;
            if (chosen == null) chosen = bestVoice(voices, Locale.getDefault());
            if (chosen != null) t.setVoice(chosen);
        } catch (RuntimeException ignored) {
            // the engine keeps its own default voice
        }
    }

    interface VoiceList {
        void done(JSONArray voices, String autoName);
    }

    /** The installed voices for your language, best first, for the picker in Settings. */
    static void listVoices(Context c, final VoiceList cb) {
        final Context ctx = c.getApplicationContext();
        final TextToSpeech[] box = new TextToSpeech[1];
        box[0] = new TextToSpeech(ctx, status -> {
            JSONArray out = new JSONArray();
            String auto = "";
            TextToSpeech t = box[0];
            if (status == TextToSpeech.SUCCESS && t != null) {
                try {
                    Locale locale = Locale.getDefault();
                    Set<Voice> voices = t.getVoices();
                    Voice best = bestVoice(voices, locale);
                    if (best != null) auto = best.getName();
                    List<Voice> list = new ArrayList<>();
                    if (voices != null) for (Voice v : voices) if (usable(v, locale)) list.add(v);
                    list.sort((a, b) -> score(b, locale) - score(a, locale));
                    for (Voice v : list) {
                        JSONObject o = new JSONObject();
                        o.put("name", v.getName());
                        o.put("quality", v.getQuality());
                        o.put("online", v.isNetworkConnectionRequired());
                        o.put("locale", v.getLocale().getDisplayName());
                        out.put(o);
                    }
                } catch (RuntimeException | JSONException ignored) {
                    // an empty list: the picker then offers only Automatic
                }
            }
            try {
                if (t != null) t.shutdown();
            } catch (RuntimeException ignored) {
                // already gone
            }
            cb.done(out, auto);
        });
    }

    /** Says a sample in the named voice (or the best one, for an empty name) so you can hear it before choosing. */
    static synchronized void preview(Context c, final String name, final String text) {
        if (previewTts != null) {
            try {
                previewTts.stop();
                previewTts.shutdown();
            } catch (RuntimeException ignored) {
                // already gone
            }
            previewTts = null;
        }
        final TextToSpeech[] box = new TextToSpeech[1];
        box[0] = new TextToSpeech(c.getApplicationContext(), status -> {
            TextToSpeech t = box[0];
            if (status != TextToSpeech.SUCCESS || t == null) return;
            t.setLanguage(Locale.getDefault());
            applyVoice(t, name);
            t.setSpeechRate(0.95f);
            t.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
            t.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {}
                @Override public void onDone(String id) { t.shutdown(); }
                @Override public void onError(String id) { t.shutdown(); }
            });
            t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ky-preview");
        });
        previewTts = box[0];
    }

    private static void abandonFocus() {
        if (app == null || focus == null) return;
        AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        if (am != null) am.abandonAudioFocusRequest(focus);
    }
}