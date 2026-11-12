package com.kyfitness.wear;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Breathing on the wrist: pick a rhythm and a length, then follow the circle by sight or by feel (each part of the breath has its own
 * buzz). Tap to pause, press Back to finish. A session of at least 20 seconds is sent to the phone and added to its Breathe history.
 */
public class BreatheActivity extends Activity {
    private static final int IN = 0;
    private static final int TOPUP = 1;
    private static final int HOLD = 2;
    private static final int OUT = 3;

    private static final class Pat {
        final String id;
        final String name;
        final String rhythm;
        final int[] kinds;
        final float[] secs;

        Pat(String id, String name, String rhythm, int[] kinds, float[] secs) {
            this.id = id;
            this.name = name;
            this.rhythm = rhythm;
            this.kinds = kinds;
            this.secs = secs;
        }

        float cycle() {
            float s = 0;
            for (float v : secs) s += v;
            return s;
        }
    }

    // The same ids and timings as the phone's Breathe app, so a session is named properly in its history.
    private static final Pat[] PATS = {
        new Pat("calm", "Calm rhythm", "In 5 - out 5", new int[] {IN, OUT}, new float[] {5, 5}),
        new Pat("longout", "Long exhale", "In 4 - out 6", new int[] {IN, OUT}, new float[] {4, 6}),
        new Pat("resonance", "Resonance", "In 5.5 - out 5.5", new int[] {IN, OUT}, new float[] {5.5f, 5.5f}),
        new Pat("box", "Box breathing", "4 - 4 - 4 - 4", new int[] {IN, HOLD, OUT, HOLD}, new float[] {4, 4, 4, 4}),
        new Pat("relax", "4-7-8", "In 4 - hold 7 - out 8", new int[] {IN, HOLD, OUT}, new float[] {4, 7, 8}),
        new Pat("sigh", "Double sigh", "In 2 - top up 1 - out 6", new int[] {IN, TOPUP, OUT}, new float[] {2, 1, 6}),
    };

    private final Handler ui = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private ScrollView pick;
    private RunView run;
    private int minutes = 3;
    private TextView[] minuteChips;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.apply(this);
        root = new FrameLayout(this);
        root.setBackgroundColor(Ui.BG);
        buildPick();
        setContentView(root);
    }

    private int dp(float v) {
        return Ui.dp(this, v);
    }

    private void buildPick() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(22), dp(34), dp(22), dp(60));
        col.addView(Ui.num(this, "BREATHE", 22, Ui.INK));
        TextView hint = Ui.text(this, "Pick a length, then a rhythm", 10, Ui.MUTED, false);
        hint.setPadding(0, dp(2), 0, dp(8));
        col.addView(hint);

        LinearLayout chips = new LinearLayout(this);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        int[] lengths = {1, 3, 5};
        minuteChips = new TextView[lengths.length];
        for (int i = 0; i < lengths.length; i++) {
            final int m = lengths[i];
            TextView t = Ui.text(this, m + " min", 12, Ui.INK, true);
            t.setGravity(Gravity.CENTER);
            t.setPadding(dp(4), dp(8), dp(4), dp(8));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.setMargins(dp(2), 0, dp(2), 0);
            t.setLayoutParams(lp);
            t.setContentDescription(m + " minutes");
            t.setOnClickListener(v -> {
                minutes = m;
                styleChips();
            });
            minuteChips[i] = t;
            chips.addView(t);
        }
        col.addView(chips);
        styleChips();

        for (final Pat p : PATS) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.VERTICAL);
            row.setBackground(Ui.glass(this, 14));
            row.setPadding(dp(12), dp(8), dp(12), dp(8));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(8);
            row.setLayoutParams(lp);
            row.addView(Ui.text(this, p.name, 14, Ui.INK, true));
            row.addView(Ui.text(this, p.rhythm, 10, Ui.BLUE, false));
            row.setContentDescription(p.name + ", " + p.rhythm + ", " + minutes + " minutes. Start.");
            row.setOnClickListener(v -> start(p));
            col.addView(row);
        }
        TextView back = Ui.text(this, "Back", 12, Ui.MUTED, false);
        back.setGravity(Gravity.CENTER);
        back.setPadding(0, dp(14), 0, dp(6));
        back.setOnClickListener(v -> finish());
        col.addView(back);

        pick = new ScrollView(this);
        pick.setVerticalScrollBarEnabled(false);
        pick.addView(col);
        root.addView(pick, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void styleChips() {
        for (int i = 0; i < minuteChips.length; i++) {
            int[] lengths = {1, 3, 5};
            boolean on = lengths[i] == minutes;
            minuteChips[i].setBackground(on ? Ui.solid(this, Ui.BLUE, 12) : Ui.glass(this, 12));
            minuteChips[i].setTextColor(on ? Ui.ON_ACCENT : Ui.INK);
        }
    }

    private void start(Pat p) {
        if (run != null) return;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        pick.setVisibility(View.GONE);
        run = new RunView(this, p, minutes * 60f);
        root.addView(run, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        run.begin();
    }

    @Override
    public void onBackPressed() {
        if (run != null) run.end();
        else finish();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (run != null) run.stopLoop();
        super.onDestroy();
    }

    private void buzz(int kind) {
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        long[] w = kind == IN ? new long[] {0, 35} : kind == TOPUP ? new long[] {0, 20} : kind == HOLD ? new long[] {0, 10} : new long[] {0, 20, 60, 20};
        v.vibrate(VibrationEffect.createWaveform(w, -1));
    }

    /** The circle and the words, redrawn about thirty times a second. */
    private final class RunView extends View {
        private final Pat pat;
        private final float totalSec;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private long lastTick = 0;
        private float elapsed = 0;
        private boolean paused = false;
        private boolean finished = false;
        private int lastPhase = -1;
        private final Runnable loop = new Runnable() {
            @Override
            public void run() {
                tick();
                if (!finished) ui.postDelayed(this, 33);
            }
        };

        RunView(Context c, Pat p, float total) {
            super(c);
            pat = p;
            totalSec = total;
            setContentDescription("Breathing. Tap to pause.");
        }

        void begin() {
            lastTick = SystemClock.elapsedRealtime();
            ui.post(loop);
        }

        void stopLoop() {
            ui.removeCallbacks(loop);
        }

        private void tick() {
            long now = SystemClock.elapsedRealtime();
            if (!paused && !finished) elapsed += (now - lastTick) / 1000f;
            lastTick = now;
            if (!finished && elapsed >= totalSec) {
                elapsed = totalSec;
                finish(true);
                return;
            }
            int idx = phaseIndex();
            int key = ((int) (elapsed / pat.cycle())) * 10 + idx;
            if (!paused && !finished && key != lastPhase) {
                lastPhase = key;
                buzz(pat.kinds[idx]);
            }
            invalidate();
        }

        private int phaseIndex() {
            float t = elapsed % pat.cycle();
            float start = 0;
            for (int i = 0; i < pat.secs.length; i++) {
                if (t < start + pat.secs[i] || i == pat.secs.length - 1) return i;
                start += pat.secs[i];
            }
            return 0;
        }

        private float into() {
            float t = elapsed % pat.cycle();
            float start = 0;
            for (int i = 0; i < pat.secs.length; i++) {
                if (t < start + pat.secs[i] || i == pat.secs.length - 1) return Math.min(pat.secs[i], t - start);
                start += pat.secs[i];
            }
            return 0;
        }

        private float scale() {
            final float empty = 0.45f;
            boolean topup = false;
            for (int k : pat.kinds) if (k == TOPUP) topup = true;
            float mid = topup ? 0.8f : 1f;
            int i = phaseIndex();
            float x = Math.min(1f, Math.max(0f, into() / pat.secs[i]));
            float e = (float) ((1 - Math.cos(Math.PI * x)) / 2);
            switch (pat.kinds[i]) {
                case IN: return empty + (mid - empty) * e;
                case TOPUP: return mid + (1f - mid) * e;
                case OUT: return 1f + (empty - 1f) * e;
                default: {
                    int before = pat.kinds[(i - 1 + pat.kinds.length) % pat.kinds.length];
                    return before == IN || before == TOPUP ? 1f : empty;
                }
            }
        }

        @Override
        protected void onDraw(Canvas c) {
            int w = getWidth();
            int h = getHeight();
            float cx = w / 2f;
            float cy = h / 2f - dp(4);
            float base = Math.min(w, h) * 0.34f;
            float s = scale();
            int hue = Ui.BLUE;
            paint.setShader(null);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(1.5f));
            paint.setColor((hue & 0x00FFFFFF) | 0x33000000);
            c.drawCircle(cx, cy, base * Math.max(0.3f, s * 1.12f), paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setShader(new RadialGradient(cx, cy - base * 0.2f * s, Math.max(1f, base * s), new int[] {(hue & 0x00FFFFFF) | 0xCC000000, (hue & 0x00FFFFFF) | 0x33000000}, new float[] {0f, 1f}, Shader.TileMode.CLAMP));
            c.drawCircle(cx, cy, base * s, paint);
            paint.setShader(null);
            paint.setColor(Ui.INK);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setFakeBoldText(true);
            paint.setTextSize(dp(15));
            int kind = pat.kinds[phaseIndex()];
            String word = paused ? "Paused" : kind == IN ? "In" : kind == TOPUP ? "Top up" : kind == HOLD ? "Hold" : "Out";
            c.drawText(word, cx, cy - dp(2), paint);
            if (!paused) {
                paint.setTextSize(dp(24));
                int left = (int) Math.max(1, Math.ceil(pat.secs[phaseIndex()] - into()));
                c.drawText(String.valueOf(left), cx, cy + dp(24), paint);
            }
            paint.setFakeBoldText(false);
            paint.setColor(Ui.MUTED);
            paint.setTextSize(dp(11));
            int rem = (int) Math.max(0, Math.round(totalSec - elapsed));
            c.drawText(String.format(java.util.Locale.US, "%d:%02d", rem / 60, rem % 60), cx, h - dp(30), paint);
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            if (e.getAction() == MotionEvent.ACTION_UP && !finished) {
                paused = !paused;
                lastTick = SystemClock.elapsedRealtime();
                performClick();
            }
            return true;
        }

        @Override
        public boolean performClick() {
            return super.performClick();
        }

        void end() {
            if (!finished) finish(false);
        }

        private void finish(boolean completed) {
            if (finished) return;
            finished = true;
            ui.removeCallbacks(loop);
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createWaveform(new long[] {0, 40, 80, 40}, -1));
            int seconds = Math.round(Math.min(elapsed, totalSec));
            if (seconds >= 20) PhoneLink.send(BreatheActivity.this, "/ky/breath/saved", System.currentTimeMillis() + "|" + pat.id + "|" + seconds + "||");
            removeView(this);
            TextView done = Ui.text(BreatheActivity.this, "Well done\n" + (seconds / 60) + ":" + String.format(java.util.Locale.US, "%02d", seconds % 60), 18, Ui.INK, true);
            done.setGravity(Gravity.CENTER);
            root.addView(done, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
            ui.postDelayed(BreatheActivity.this::finish, completed ? 2200 : 1400);
        }

        private void removeView(View v) {
            root.removeView(v);
        }
    }
}
