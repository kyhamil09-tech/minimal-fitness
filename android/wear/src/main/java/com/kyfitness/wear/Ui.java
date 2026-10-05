package com.kyfitness.wear;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Shared look for the watch app: the phone app's liquid-glass style on a round display. */
final class Ui {
    // The colours of the watch app. They start as the standard look and are replaced by apply() with the look chosen on the phone
    // (palette and background), so every screen, the tile and the workout view match the phone app.
    static int INK = Color.parseColor("#F2EDE3");
    static int MUTED = Color.parseColor("#A29E95");
    static int ACCENT = Color.parseColor("#CBFF00");
    static int BLUE = Color.parseColor("#7DD3FC");
    static int GREEN = Color.parseColor("#4ADE80");
    static int YELLOW = Color.parseColor("#FFD23F");
    static int ORANGE = Color.parseColor("#FF5A1F");
    static int RED = Color.parseColor("#FF4D4D");
    static int PURPLE = Color.parseColor("#B794FF");
    /** The window background, the card colour and its edge, and the text colour used on an accent-coloured button. */
    static int BG = Color.parseColor("#17181B");
    static int CARD = Color.parseColor("#212226");
    static int EDGE = Color.parseColor("#34353B");
    static int ON_ACCENT = Color.parseColor("#14130F");

    private Ui() {}

    /** Reads the look the phone sent (if any) into the colours above. Call before building any view. */
    static void apply(Context c) {
        INK = LookStore.color(c, "ink", INK);
        MUTED = LookStore.color(c, "muted", MUTED);
        ACCENT = LookStore.color(c, "accent", ACCENT);
        BLUE = LookStore.color(c, "blue", BLUE);
        GREEN = LookStore.color(c, "green", GREEN);
        YELLOW = LookStore.color(c, "yellow", YELLOW);
        ORANGE = LookStore.color(c, "orange", ORANGE);
        RED = LookStore.color(c, "red", RED);
        PURPLE = LookStore.color(c, "purple", PURPLE);
        BG = LookStore.color(c, "bg", BG);
        CARD = LookStore.color(c, "card", CARD);
        EDGE = LookStore.color(c, "edge", EDGE);
        ON_ACCENT = LookStore.color(c, "onAccent", ON_ACCENT);
    }

    /** Colour for a sport's icon: 0 accent, 1 blue, 2 orange, 3 yellow, 4 purple, 5 red. Resolved when drawn so a new look shows. */
    static int byKey(int key) {
        switch (key) {
            case 1: return BLUE;
            case 2: return ORANGE;
            case 3: return YELLOW;
            case 4: return PURPLE;
            case 5: return RED;
            default: return ACCENT;
        }
    }

    static int dp(Context c, float v) {
        return Math.round(c.getResources().getDisplayMetrics().density * v);
    }

    static Typeface medium() {
        return Typeface.create("sans-serif-medium", Typeface.NORMAL);
    }

    static Typeface bold() {
        return Typeface.create("sans-serif", Typeface.BOLD);
    }

    /** Flat dark card with a hairline edge. */
    static Drawable glass(Context c, float radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(CARD);
        d.setCornerRadius(dp(c, radiusDp));
        d.setStroke(Math.max(1, dp(c, 1)), EDGE);
        return d;
    }

    /** Card tinted toward a colour (secondary and destructive actions). */
    static Drawable tinted(Context c, int color, float radiusDp, int topAlpha, int bottomAlpha) {
        GradientDrawable d = new GradientDrawable();
        d.setColor((color & 0x00FFFFFF) | (bottomAlpha << 24));
        d.setCornerRadius(dp(c, radiusDp));
        d.setStroke(Math.max(1, dp(c, 1)), (color & 0x00FFFFFF) | 0x66000000);
        return d;
    }

    /** Solid pill or card in one colour: the primary action. */
    static Drawable solid(Context c, int color, float radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(c, radiusDp));
        return d;
    }

    /** Big numbers: condensed, heavy and slanted like the phone app. */
    static Typeface display() {
        return Typeface.create("sans-serif-condensed", Typeface.BOLD_ITALIC);
    }

    static TextView num(Context c, String s, float sp, int color) {
        TextView t = text(c, s, sp, color, true);
        t.setTypeface(display());
        return t;
    }
    static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        t.setTypeface(bold ? bold() : medium());
        t.setIncludeFontPadding(false);
        return t;
    }

    static ImageView icon(Context c, int res, int tint, int sizeDp) {
        ImageView v = new ImageView(c);
        v.setImageResource(res);
        v.setColorFilter(tint);
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(c, sizeDp), dp(c, sizeDp)));
        return v;
    }

    /** The window background in the chosen look (soft off-black by default, pure black when AMOLED is picked on the phone). */
    static final class GlowBackground extends Drawable {
        @Override
        public void draw(Canvas canvas) {
            canvas.drawColor(BG);
        }

        @Override public void setAlpha(int alpha) {}
        @Override public void setColorFilter(ColorFilter cf) {}
        @Override public int getOpacity() { return PixelFormat.OPAQUE; }
    }
    /** Heart-rate ring: soft track plus a rounded progress arc in the zone colour. */
    static final class RingView extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float progress = 0f;
        private int color = Color.WHITE;

        RingView(Context c) {
            super(c);
            track.setStyle(Paint.Style.STROKE);
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeCap(Paint.Cap.ROUND);
            track.setStrokeCap(Paint.Cap.ROUND);
        }

        void set(float progress01, int color) {
            this.progress = Math.max(0f, Math.min(1f, progress01));
            this.color = color;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float stroke = dp(getContext(), 11);
            track.setStrokeWidth(stroke);
            arc.setStrokeWidth(stroke);
            track.setColor((color & 0x00FFFFFF) | 0x33000000);
            arc.setColor(color);
            float pad = stroke / 2f + dp(getContext(), 2);
            RectF oval = new RectF(pad, pad, getWidth() - pad, getHeight() - pad);
            canvas.drawArc(oval, 0, 360, false, track);
            if (progress > 0f) {
                arc.setShader(new LinearGradient(0, 0, getWidth(), getHeight(), color, lighten(color), Shader.TileMode.CLAMP));
                canvas.drawArc(oval, -90, 360f * progress, false, arc);
                arc.setShader(null);
            }
        }

        private static int lighten(int c) {
            int r = Math.min(255, Color.red(c) + 50);
            int g = Math.min(255, Color.green(c) + 50);
            int b = Math.min(255, Color.blue(c) + 50);
            return Color.rgb(r, g, b);
        }
    }

    /** Colour of zone `index` (0 = Z1 ... 4 = Z5). */
    static int zoneColor(int index) {
        int[] colors = {BLUE, GREEN, YELLOW, ORANGE, RED};
        return colors[Math.max(0, Math.min(4, index))];
    }

    static int zoneColor(int heartRate, int maxHr) {
        if (heartRate <= 0 || maxHr <= 0) return BLUE;
        double pct = (double) heartRate / maxHr;
        return pct < 0.6 ? BLUE : pct < 0.7 ? GREEN : pct < 0.8 ? YELLOW : pct < 0.9 ? ORANGE : RED;
    }
}
