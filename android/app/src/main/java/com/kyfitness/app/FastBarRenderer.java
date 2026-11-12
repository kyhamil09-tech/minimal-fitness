package com.kyfitness.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import androidx.core.graphics.ColorUtils;

/**
 * Draws the pictures in the fasting notification: the stage bar that fills as the hours pass (with a glowing dot on its front and a
 * tick at your goal), the thin "this hour" bar that creeps forward so you can see it move, and the soft glow behind the clock. A
 * notification cannot use the app's own styling, so these are painted here in the app's current accent color and shown as images.
 */
final class FastBarRenderer {
    private FastBarRenderer() {}

    /** The stage colors (the same five the phone and the watch use), pulled toward the app's accent so they sit in its color scheme. */
    static final int[] STAGE = {0xFF8AB4F8, 0xFF78D9EC, 0xFFCBFF00, 0xFFFCAD70, 0xFFC58AF9};
    private static final float BLEND_TO_ACCENT = 0.5f;

    static int stageColor(int stage, int accent) {
        return ColorUtils.blendARGB(STAGE[Math.max(0, Math.min(STAGE.length - 1, stage))], accent, BLEND_TO_ACCENT);
    }

    static double totalHours(double goal) {
        return Math.max(24, Math.ceil(goal) + 4);
    }

    /** The stage bar: five stage segments with a gap between, filled up to {@code hours}. */
    static Bitmap bar(int accent, double hours, double goal, int w, int h) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        double total = totalHours(goal);
        double[] edges = {0, FastingNotifier.BOUNDS[0], FastingNotifier.BOUNDS[1], FastingNotifier.BOUNDS[2], FastingNotifier.BOUNDS[3], total};
        float pad = h * 0.32f;
        float x0 = pad;
        float usable = w - pad * 2;
        float thick = h * 0.34f;
        float top = (h - thick) / 2f;
        float gap = thick * 0.42f;
        float r = thick / 2f;
        for (int i = 0; i < 5; i++) {
            float a = x0 + (float) (edges[i] / total) * usable + (i == 0 ? 0 : gap / 2f);
            float b = x0 + (float) (edges[i + 1] / total) * usable - (i == 4 ? 0 : gap / 2f);
            int col = stageColor(i, accent);
            p.setShader(null);
            p.setColor(ColorUtils.setAlphaComponent(col, 0x40));
            c.drawRoundRect(new RectF(a, top, b, top + thick), r, r, p);
            if (hours > edges[i]) {
                float fillEnd = Math.min(b, x0 + (float) (Math.min(hours, edges[i + 1]) / total) * usable);
                if (fillEnd > a + 1) {
                    // A soft glow under the filled part, then the color itself.
                    p.setColor(col);
                    p.setShadowLayer(thick * 0.9f, 0, 0, ColorUtils.setAlphaComponent(col, 0xB0));
                    c.drawRoundRect(new RectF(a, top, fillEnd, top + thick), r, r, p);
                    p.clearShadowLayer();
                }
            }
        }
        // The goal: a white tick through the bar.
        float gx = x0 + (float) (Math.min(goal, total) / total) * usable;
        p.setColor(0xFFFFFFFF);
        c.drawRoundRect(new RectF(gx - 2.2f, top - thick * 0.55f, gx + 2.2f, top + thick * 1.55f), 2.2f, 2.2f, p);
        // The front of the fill: a bright dot with a halo.
        if (hours > 0.02) {
            float hx = x0 + (float) (Math.min(hours, total) / total) * usable;
            int stage = 0;
            for (double bnd : FastingNotifier.BOUNDS) if (hours >= bnd) stage++;
            int col = stageColor(stage, accent);
            p.setColor(ColorUtils.setAlphaComponent(col, 0x70));
            c.drawCircle(hx, h / 2f, thick * 1.35f, p);
            p.setColor(0xFFFFFFFF);
            c.drawCircle(hx, h / 2f, thick * 0.78f, p);
            p.setColor(col);
            c.drawCircle(hx, h / 2f, thick * 0.42f, p);
        }
        return bmp;
    }

    /** The thin bar for the current hour: it empties and refills every hour, so it moves where the big bar barely does. */
    static Bitmap hourBar(int accent, double hours, int w, int h) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        double frac = hours - Math.floor(hours);
        float pad = h * 0.4f;
        float thick = h * 0.36f;
        float top = (h - thick) / 2f;
        float r = thick / 2f;
        float usable = w - pad * 2;
        p.setColor(ColorUtils.setAlphaComponent(accent, 0x30));
        c.drawRoundRect(new RectF(pad, top, pad + usable, top + thick), r, r, p);
        float end = pad + (float) frac * usable;
        if (end > pad + 1) {
            p.setShader(new LinearGradient(pad, 0, Math.max(end, pad + 2), 0, ColorUtils.blendARGB(accent, 0xFF000000, 0.25f), ColorUtils.blendARGB(accent, 0xFFFFFFFF, 0.35f), Shader.TileMode.CLAMP));
            p.setShadowLayer(thick * 1.1f, 0, 0, ColorUtils.setAlphaComponent(accent, 0xC0));
            c.drawRoundRect(new RectF(pad, top, end, top + thick), r, r, p);
        }
        return bmp;
    }

    /** A soft pool of the accent color that sits behind the clock, so the numbers seem to glow. */
    static Bitmap glow(int accent, int w, int h) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        // A unit circle of glow, stretched to an ellipse that just fits the picture: it reaches zero at the top, bottom and left edges.
        RadialGradient g = new RadialGradient(0f, 0f, 1f, new int[] {ColorUtils.setAlphaComponent(accent, 0x70), ColorUtils.setAlphaComponent(accent, 0x30), ColorUtils.setAlphaComponent(accent, 0x00)}, new float[] {0f, 0.55f, 1f}, Shader.TileMode.CLAMP);
        Matrix m = new Matrix();
        m.setScale(w * 0.62f, h * 0.5f);
        m.postTranslate(w * 0.38f, h * 0.5f);
        g.setLocalMatrix(m);
        p.setShader(g);
        c.drawRect(0, 0, w, h, p);
        return bmp;
    }
}
