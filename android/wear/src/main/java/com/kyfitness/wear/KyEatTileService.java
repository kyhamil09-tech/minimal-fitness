package com.kyfitness.wear;

import static androidx.wear.protolayout.ColorBuilders.argb;
import static androidx.wear.protolayout.DimensionBuilders.dp;
import static androidx.wear.protolayout.DimensionBuilders.expand;
import static androidx.wear.protolayout.DimensionBuilders.sp;

import android.graphics.Color;
import androidx.annotation.NonNull;
import androidx.wear.protolayout.ActionBuilders;
import androidx.wear.protolayout.LayoutElementBuilders;
import androidx.wear.protolayout.ModifiersBuilders;
import androidx.wear.protolayout.ResourceBuilders;
import androidx.wear.protolayout.TimelineBuilders;
import androidx.wear.tiles.RequestBuilders;
import androidx.wear.tiles.TileBuilders;
import androidx.wear.tiles.TileService;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.Locale;

/** Watch tile for Eat: today's calories left, a bar of what is eaten, protein, and a button that adds a glass of water. */
public class KyEatTileService extends TileService {
    private static final String RES_VERSION = "1";
    private static final float BAR_WIDTH = 132f;
    private static final int PINK = Color.parseColor("#F2475F");
    private static final int GOLD = Color.parseColor("#E9CB8E");

    @NonNull
    @Override
    protected ListenableFuture<TileBuilders.Tile> onTileRequest(@NonNull RequestBuilders.TileRequest request) {
        handleTap(request.getCurrentState() == null ? "" : request.getCurrentState().getLastClickableId());
        TileBuilders.Tile tile = new TileBuilders.Tile.Builder()
            .setResourcesVersion(RES_VERSION)
            .setFreshnessIntervalMillis(60_000)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout()))
            .build();
        return Futures.immediateFuture(tile);
    }

    @NonNull
    @Override
    protected ListenableFuture<ResourceBuilders.Resources> onTileResourcesRequest(@NonNull RequestBuilders.ResourcesRequest request) {
        return Futures.immediateFuture(new ResourceBuilders.Resources.Builder().setVersion(RES_VERSION).build());
    }

    /** A tap arrives as "1:<n>"; it counts only when n is newer than the last tap handled (the tile repeats the last tap on refresh). */
    private void handleTap(String id) {
        if (id == null || id.isEmpty()) return;
        int colon = id.indexOf(':');
        if (colon <= 0) return;
        try {
            int which = Integer.parseInt(id.substring(0, colon));
            int nonce = Integer.parseInt(id.substring(colon + 1));
            if (which != 1 || nonce <= WaterStore.handledNonce(this)) return;
            WaterStore.markHandled(this, nonce);
            int ml = WaterStore.stepMl(this, 1);
            WaterStore.addLocal(this, ml);
            PhoneLink.send(this, "/ky/water/add", String.valueOf(ml));
        } catch (NumberFormatException ignored) {
            // not one of ours
        }
    }

    private LayoutElementBuilders.Text text(String s, float size, int color, boolean bold) {
        return new LayoutElementBuilders.Text.Builder()
            .setText(s)
            .setFontStyle(new LayoutElementBuilders.FontStyle.Builder()
                .setSize(sp(size))
                .setColor(argb(color))
                .setWeight(bold ? LayoutElementBuilders.FONT_WEIGHT_BOLD : LayoutElementBuilders.FONT_WEIGHT_NORMAL)
                .build())
            .build();
    }

    private LayoutElementBuilders.LayoutElement spacer(float w, float h) {
        return new LayoutElementBuilders.Spacer.Builder().setWidth(dp(w)).setHeight(dp(h)).build();
    }

    private LayoutElementBuilders.LayoutElement box(float w, int color) {
        return new LayoutElementBuilders.Box.Builder()
            .setWidth(dp(w))
            .setHeight(dp(6))
            .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                .setBackground(new ModifiersBuilders.Background.Builder()
                    .setColor(argb(color))
                    .setCorner(new ModifiersBuilders.Corner.Builder().setRadius(dp(3)).build())
                    .build())
                .build())
            .build();
    }

    private LayoutElementBuilders.LayoutElement bar(float fraction) {
        float filled = Math.max(0f, Math.min(1f, fraction)) * BAR_WIDTH;
        LayoutElementBuilders.Row.Builder row = new LayoutElementBuilders.Row.Builder();
        if (filled > 0f) row.addContent(box(filled, PINK));
        if (BAR_WIDTH - filled > 0f) row.addContent(box(BAR_WIDTH - filled, Ui.EDGE));
        return row.build();
    }

    private LayoutElementBuilders.LayoutElement waterButton(String label, String id) {
        ModifiersBuilders.Clickable click = new ModifiersBuilders.Clickable.Builder()
            .setId(id)
            .setOnClick(new ActionBuilders.LoadAction.Builder().build())
            .build();
        return new LayoutElementBuilders.Box.Builder()
            .setWidth(dp(96))
            .setHeight(dp(38))
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                .setClickable(click)
                .setBackground(new ModifiersBuilders.Background.Builder()
                    .setColor(argb(Ui.BLUE))
                    .setCorner(new ModifiersBuilders.Corner.Builder().setRadius(dp(19)).build())
                    .build())
                .build())
            .addContent(text(label, 14, Ui.ON_ACCENT, true))
            .build();
    }

    private static String number(int n) {
        return String.format(Locale.US, "%,d", n);
    }

    private LayoutElementBuilders.LayoutElement layout() {
        Ui.apply(this);
        boolean imperial = WaterStore.imperial(this);
        int nonce = WaterStore.nextNonce(this);
        String glass = "+" + WaterStore.format(WaterStore.stepMl(this, 1), imperial).replace(" fl oz", " oz");
        LayoutElementBuilders.Column.Builder col = new LayoutElementBuilders.Column.Builder().setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER);
        col.addContent(text("EAT", 12, GOLD, true));
        if (GlanceStore.eatKnown(this)) {
            int left = GlanceStore.eatLeft(this);
            int goal = Math.max(1, GlanceStore.eatGoal(this));
            col.addContent(text(left >= 0 ? number(left) : "+" + number(-left), 34, Ui.INK, true));
            col.addContent(text(left >= 0 ? "calories left" : "past your plan", 12, Ui.MUTED, false));
            col.addContent(spacer(1, 6));
            col.addContent(bar(GlanceStore.eatEaten(this) / (float) goal));
            int pg = GlanceStore.eatPGoal(this);
            if (pg > 0) {
                col.addContent(spacer(1, 4));
                col.addContent(text("Protein " + GlanceStore.eatP(this) + " of " + pg + " g", 12, Ui.MUTED, false));
            }
        } else {
            col.addContent(text("Open the app", 16, Ui.INK, true));
            col.addContent(text("on your phone once", 12, Ui.MUTED, false));
        }
        col.addContent(spacer(1, 10));
        col.addContent(waterButton(glass + " water", "1:" + nonce));
        col.addContent(spacer(1, 4));
        col.addContent(text("Water " + WaterStore.format(WaterStore.totalMl(this), imperial) + " of " + WaterStore.format(WaterStore.goalMl(this), imperial), 11, Ui.MUTED, false));
        return new LayoutElementBuilders.Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(col.build())
            .build();
    }
}
