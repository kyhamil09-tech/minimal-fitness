package com.kyfitness.wear;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import java.util.Locale;

/**
 * The fasting meter: an open ring split into the fasting stages, each in its own color. The ring fills in as the hours pass, a bright
 * dot with a soft pulse rides the front of the fill, and a white tick marks the goal. When the screen opens the fill sweeps round from
 * the start to where you are. It draws only while it is on screen, so it costs nothing in the background.
 */
final class FastMeterView extends View {
    /** Hours at which the next stage starts (the same stages the phone shows). */
    private static final double[] BOUNDS = {4, 12, 16, 20};
    private static final int[] COLORS = {0xFF8AB4F8, 0xFF78D9EC, 0xFFCBFF00, 0xFFFCAD70, 0xFFC58AF9};
    static final String[] STAGES = {"Fed & anabolic", "Early fasting", "Fat burning", "Ketosis & cell repair", "Deep ketosis"};
    private static final float START_DEG = 135f;
    private static final float SWEEP_DEG = 270f;
    private static final float GAP_DEG = 2.2f;

    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tick = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint big = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint small = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF oval = new RectF();

    private double hours;
    private double goal = 16;
    /** The hours the ring is drawn up to; it sweeps from 0 to {@link #hours} when the meter first shows. */
    private double drawn;
    private float pulse;
    private boolean sweeping;
    private ValueAnimator sweep;
    private ValueAnimator beat;
    private String lastText = "";

    FastMeterView(Context c) {
        super(c);
        float d = c.getResources().getDisplayMetrics().density;
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(13 * d);
        fill.setStyle(Paint.Style.STROKE);
        fill.setStrokeWidth(13 * d);
        tick.setStyle(Paint.Style.STROKE);
        tick.setStrokeWidth(3 * d);
        tick.setColor(0xFFFFFFFF);
        tick.setStrokeCap(Paint.Cap.ROUND);
        big.setTypeface(Ui.display());
        big.setTextAlign(Paint.Align.CENTER);
        big.setTextSize(38 * d);
        small.setTextAlign(Paint.Align.CENTER);
        small.setTypeface(Ui.bold());
    }

    private double totalHours() {
        return Math.max(24, Math.ceil(goal) + 4);
    }

    private float angleOf(double h) {
        return START_DEG + SWEEP_DEG * (float) (Math.min(h, totalHours()) / totalHours());
    }

    /** The stage edges in hours: 0, the four stage starts, and the end of the ring. */
    private double[] edges() {
        return new double[] {0, BOUNDS[0], BOUNDS[1], BOUNDS[2], BOUNDS[3], totalHours()};
    }

    /** Sets what to draw. With {@code restart} the fill sweeps round again from the start (when the screen opens). */
    void setFast(double hoursNow, double goalHours, boolean restart) {
        hours = Math.max(0, hoursNow);
        goal = Math.max(0.5, goalHours);
        if (restart) {
            startSweep();
        } else if (!sweeping) {
            drawn = hours;
        }
        String text = headline();
        if (!text.equals(lastText)) {
            lastText = text;
            invalidate();
        }
    }

    private void startSweep() {
        if (sweep != null) sweep.cancel();
        sweeping = true;
        sweep = ValueAnimator.ofFloat(0f, 1f);
        sweep.setDuration(1600);
        sweep.setInterpolator(new DecelerateInterpolator(1.6f));
        sweep.addUpdateListener(a -> {
            drawn = hours * (float) a.getAnimatedValue();
            invalidate();
        });
        sweep.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(android.animation.Animator animation) {
                sweeping = false;
                drawn = hours;
                invalidate();
            }
        });
        drawn = 0;
        sweep.start();
    }

    private int stage() {
        int i = 0;
        for (double b : BOUNDS) if (hours >= b) i++;
        return i;
    }

    private String headline() {
        long mins = Math.round(hours * 60);
        return String.format(Locale.getDefault(), "%d:%02d", mins / 60, mins % 60) + "|" + stage() + "|" + (long) goal + "|" + Math.round((goal - hours) * 60);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        startBeat();
    }

    @Override
    protected void onDetachedFromWindow() {
        stopAnimators();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onVisibilityChanged(View changed, int visibility) {
        super.onVisibilityChanged(changed, visibility);
        if (visibility == VISIBLE && isAttachedToWindow()) startBeat();
        else stopAnimators();
    }

    /** The soft pulse on the front of the fill. */
    private void startBeat() {
        if (beat != null && beat.isRunning()) return;
        beat = ValueAnimator.ofFloat(0f, 1f);
        beat.setDuration(1200);
        beat.setRepeatMode(ValueAnimator.REVERSE);
        beat.setRepeatCount(ValueAnimator.INFINITE);
        beat.addUpdateListener(a -> {
            pulse = (float) a.getAnimatedValue();
            invalidate();
        });
        beat.start();
    }

    private void stopAnimators() {
        if (beat != null) beat.cancel();
        if (sweep != null) sweep.cancel();
        sweeping = false;
        drawn = hours;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float d = getResources().getDisplayMetrics().density;
        float w = getWidth();
        float h = getHeight();
        float stroke = track.getStrokeWidth();
        float r = Math.min(w, h) / 2f - stroke / 2f - 4 * d;
        float cx = w / 2f;
        float cy = h / 2f;
        oval.set(cx - r, cy - r, cx + r, cy + r);
        double[] e = edges();

        for (int i = 0; i < COLORS.length; i++) {
            float a0 = angleOf(e[i]) + (i == 0 ? 0 : GAP_DEG / 2f);
            float a1 = angleOf(e[i + 1]) - (i == COLORS.length - 1 ? 0 : GAP_DEG / 2f);
            track.setColor((COLORS[i] & 0x00FFFFFF) | 0x38000000);
            track.setStrokeCap(Paint.Cap.BUTT);
            canvas.drawArc(oval, a0, a1 - a0, false, track);
            // The filled part of this stage, up to where the ring has been drawn.
            if (drawn > e[i]) {
                float f1 = angleOf(Math.min(drawn, e[i + 1])) - (drawn >= e[i + 1] && i < COLORS.length - 1 ? GAP_DEG / 2f : 0);
                fill.setColor(COLORS[i]);
                fill.setStrokeCap(Paint.Cap.BUTT);
                if (f1 > a0) canvas.drawArc(oval, a0, f1 - a0, false, fill);
            }
        }

        // The goal: a white tick across the ring.
        float ga = (float) Math.toRadians(angleOf(goal));
        float inner = r - stroke * 0.85f;
        float outer = r + stroke * 0.85f;
        canvas.drawLine(cx + (float) Math.cos(ga) * inner, cy + (float) Math.sin(ga) * inner, cx + (float) Math.cos(ga) * outer, cy + (float) Math.sin(ga) * outer, tick);

        // The front of the fill: a soft pulsing glow and a bright dot.
        if (drawn > 0.02) {
            float ha = (float) Math.toRadians(angleOf(drawn));
            float hx = cx + (float) Math.cos(ha) * r;
            float hy = cy + (float) Math.sin(ha) * r;
            int color = COLORS[Math.min(COLORS.length - 1, headStage())];
            dot.setColor((color & 0x00FFFFFF) | ((int) (70 + 80 * (1 - pulse)) << 24));
            canvas.drawCircle(hx, hy, (stroke * 0.8f) + 7 * d * pulse, dot);
            dot.setColor(0xFFFFFFFF);
            canvas.drawCircle(hx, hy, stroke * 0.42f, dot);
            dot.setColor(color);
            canvas.drawCircle(hx, hy, stroke * 0.24f, dot);
        }

        // The words in the middle: how long, the stage, and what is left.
        long mins = Math.round(hours * 60);
        big.setColor(Ui.INK);
        canvas.drawText(String.format(Locale.getDefault(), "%d:%02d", mins / 60, mins % 60), cx, cy + 6 * d, big);
        int st = stage();
        small.setColor(COLORS[st]);
        small.setTextSize(12 * d);
        canvas.drawText(STAGES[st].toUpperCase(Locale.getDefault()), cx, cy + 26 * d, small);
        small.setColor(Ui.MUTED);
        small.setTextSize(11 * d);
        long left = Math.round((goal - hours) * 60);
        String sub = hours >= goal
            ? "Goal reached"
            : "Goal " + (long) goal + "h  ·  " + (left / 60) + "h " + String.format(Locale.getDefault(), "%02d", left % 60) + "m left";
        canvas.drawText(sub, cx, cy + 44 * d, small);
    }

    private int headStage() {
        int i = 0;
        for (double b : BOUNDS) if (drawn >= b) i++;
        return i;
    }
}
