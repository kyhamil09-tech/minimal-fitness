package com.kyfitness.app;

import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

/**
 * Records a workout's raw samples natively so nothing is lost while the screen is off.
 * start({gps}) begins a session (and the location service when gps is true), getSamples returns
 * everything recorded since the given indices, and stop() ends the session (samples stay readable
 * until the next start).
 */
@CapacitorPlugin(name = "GpsTracker")
public class GpsTrackerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        boolean gps = Boolean.TRUE.equals(call.getBoolean("gps", true));
        SampleBuffer.begin();
        // Pausing by itself when you stop (optional); a walker resumes at a gentler speed than a runner.
        SampleBuffer.configureAutoPause(Boolean.TRUE.equals(call.getBoolean("autoPause", false)), AutoPauseDetector.walkLike(call.getString("sport")));
        // Spoken updates each kilometer or mile (optional)
        boolean miles = "mi".equals(call.getString("unit", "km"));
        double everyKm = call.getDouble("everyKm", miles ? 1.609344 : 1.0);
        RunCoach.begin(getContext(), Boolean.TRUE.equals(call.getBoolean("cues", false)),
            miles, Boolean.TRUE.equals(call.getBoolean("cueHr", true)),
            everyKm, call.getInt("everyMin", 0),
            Boolean.TRUE.equals(call.getBoolean("sayDistance", false)),
            Boolean.TRUE.equals(call.getBoolean("sayTime", true)),
            Boolean.TRUE.equals(call.getBoolean("sayPace", true)),
            // Interval cues (Run, Walk, the warning, 3-2-1) and the voice chosen in Settings
            Boolean.TRUE.equals(call.getBoolean("intervalCues", false)),
            call.getString("voice", ""));
        if (gps) {
            try {
                getContext().startForegroundService(new Intent(getContext(), GpsTrackerService.class)
                    .putExtra("saver", Boolean.TRUE.equals(call.getBoolean("saver", false))));
            } catch (RuntimeException e) {
                call.reject("Could not start location tracking: " + e.getMessage());
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getSamples(PluginCall call) {
        try {
            readSamples(call);
        } catch (org.json.JSONException e) {
            call.reject("Could not read samples: " + e.getMessage());
        }
    }

    private void readSamples(PluginCall call) throws org.json.JSONException {
        int fixFrom = call.getInt("fixFrom", 0);
        int hrFrom = call.getInt("hrFrom", 0);
        int pauseFrom = call.getInt("pauseFrom", 0);
        JSArray fixes = new JSArray();
        List<double[]> f = SampleBuffer.fixesFrom(fixFrom);
        for (double[] r : f) {
            JSArray row = new JSArray();
            row.put((long) r[0]);
            row.put(r[1]);
            row.put(r[2]);
            row.put(Double.isNaN(r[3]) ? JSONObjectNull.VALUE : r[3]);
            row.put(Double.isNaN(r[4]) ? JSONObjectNull.VALUE : r[4]);
            row.put(r.length > 5 && !Double.isNaN(r[5]) ? r[5] : JSONObjectNull.VALUE);
            row.put(r.length > 6 && !Double.isNaN(r[6]) ? r[6] : JSONObjectNull.VALUE);
            fixes.put(row);
        }
        JSArray hr = new JSArray();
        for (long[] r : SampleBuffer.heartRateFrom(hrFrom)) {
            JSArray row = new JSArray();
            row.put(r[0]);
            row.put(r[1]);
            hr.put(row);
        }
        JSObject out = new JSObject();
        out.put("fixes", fixes);
        out.put("fixTotal", fixFrom + f.size());
        out.put("hr", hr);
        out.put("hrTotal", SampleBuffer.heartRateCount());
        // When the workout paused itself and carried on: [time, 1 paused | 0 resumed]
        JSArray pauses = new JSArray();
        for (long[] r : SampleBuffer.pausesFrom(pauseFrom)) {
            JSArray row = new JSArray();
            row.put(r[0]);
            row.put(r[1]);
            pauses.put(row);
        }
        out.put("pauses", pauses);
        out.put("pauseTotal", SampleBuffer.pauseCount());
        // True once any altitude in this workout came from the phone's barometer.
        out.put("baro", SampleBuffer.usedBarometer());
        call.resolve(out);
    }

    /**
     * You paused or resumed by hand: lets the spoken cues skip the paused time, and tells the automatic pause to stand down (or start
     * over). Pauses the workout makes by itself never come through here; they are worked out natively and read back with the samples.
     */
    @PluginMethod
    public void setPaused(PluginCall call) {
        boolean paused = Boolean.TRUE.equals(call.getBoolean("paused", false));
        RunCoach.setPaused(paused);
        SampleBuffer.setManualPaused(paused);
        call.resolve();
    }

    /**
     * Speaks a one-off message. A running update (a lap time) is said only if spoken updates are on; an interval cue (`cue`) is said
     * whenever it is asked for, and `flush` lets a countdown number cut off what is still being said.
     */
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text != null) {
            if (Boolean.TRUE.equals(call.getBoolean("cue", false))) RunCoach.sayCue(text, Boolean.TRUE.equals(call.getBoolean("flush", false)));
            else RunCoach.say(text);
        }
        call.resolve();
    }

    /**
     * Vibrates the phone, also with the screen off (a web page cannot: browsers do not let a hidden page vibrate). The pattern is
     * on/off times in milliseconds, starting with a buzz, the way `navigator.vibrate` takes it.
     */
    @PluginMethod
    public void vibrate(PluginCall call) {
        try {
            org.json.JSONArray p = call.getArray("pattern");
            if (p != null && p.length() > 0 && p.length() <= 24) {
                long[] timings = new long[p.length() + 1];
                // Android's waveform starts with a wait; the page's pattern starts with a buzz.
                timings[0] = 0;
                for (int i = 0; i < p.length(); i++) timings[i + 1] = Math.max(0, Math.min(2000, p.getLong(i)));
                android.os.Vibrator v = (android.os.Vibrator) getContext().getSystemService(android.content.Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    // Alarm usage so the buzz still comes while the phone is in a pocket, locked, or in Do Not Disturb.
                    v.vibrate(android.os.VibrationEffect.createWaveform(timings, -1),
                        new android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
                }
            }
        } catch (RuntimeException | org.json.JSONException e) {
            // no vibration motor, or a bad pattern: nothing to do
        }
        call.resolve();
    }

    /** The voices installed for your language, best first, for the picker in Settings. */
    @PluginMethod
    public void listVoices(final PluginCall call) {
        RunCoach.listVoices(getContext(), (voices, auto) -> {
            JSObject out = new JSObject();
            out.put("voices", voices);
            out.put("auto", auto);
            call.resolve(out);
        });
    }

    /** Says a sample so you can hear a voice before choosing it. */
    @PluginMethod
    public void previewVoice(PluginCall call) {
        RunCoach.preview(getContext(), call.getString("name", ""), call.getString("text", "Run for one minute. Walk in ten seconds."));
        call.resolve();
    }

    /** Opens Android's text-to-speech settings, where a more natural voice can be downloaded. */
    @PluginMethod
    public void openVoiceSettings(PluginCall call) {
        try {
            Intent i = new Intent("com.android.settings.TTS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (RuntimeException e) {
            try {
                getContext().startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (RuntimeException ignored) {
                // nothing can open settings here
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), GpsTrackerService.class));
        RunCoach.end();
        SampleBuffer.end();
        call.resolve();
    }

    /** org.json's null marker, so missing altitude/accuracy become JSON null. */
    private static final class JSONObjectNull {
        static final Object VALUE = org.json.JSONObject.NULL;
    }
}