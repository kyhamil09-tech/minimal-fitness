package com.kyfitness.wear;

import static androidx.wear.protolayout.ColorBuilders.argb;
import static androidx.wear.protolayout.DimensionBuilders.dp;
import static androidx.wear.protolayout.DimensionBuilders.expand;
import static androidx.wear.protolayout.DimensionBuilders.sp;

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

/** Watch tile for fuel: today's water against the goal with two add buttons, and the running fast. */
public class KyFuelTileService extends TileService {
    private static final String RES_VERSION = "1";
    private static final float BAR_WIDTH = 132f;

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

    /**
     * A tap arrives as the id of the button ("1:<n>" or "2:<n>", n being the counter of the tile that was on screen). The tile also
     * reports the last tap again when it refreshes by itself, so a tap only counts when its counter is newer than the last one handled.
     */
    private void handleTap(String id) {
        if (id == null || id.isEmpty()) return;
        int colon = id.indexOf(':');
        if (colon <= 0) return;
        try {
            int which = Integer.parseInt(id.substring(0, colon));
            int nonce = Integer.parseInt(id.substring(colon + 1));
            if ((which != 1 && which != 2) || nonce <= WaterStore.handledNonce(this)) return;
            WaterStore.markHandled(this, nonce);
            int ml = WaterStore.stepMl(this, which);
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
                .setItalic(bold)
                .build())
            .build();
    }

    private LayoutElementBuilders.LayoutElement spacer(float w, float h) {
        return new LayoutElementBuilders.Spacer.Builder().setWidth(dp(w)).setHeight(dp(h)).build();
    }

    private LayoutElementBuilders.LayoutElement bar(float fraction) {
        float filled = Math.max(0f, Math.min(1f, fraction)) * BAR_WIDTH;
        LayoutElementBuilders.Row.Builder row = new LayoutElementBuilders.Row.Builder();
        if (filled > 0f) {
            row.addContent(new LayoutElementBuilders.Box.Builder()
                .setWidth(dp(filled))
                .setHeight(dp(6))
                .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                    .setBackground(new ModifiersBuilders.Background.Builder()
                        .setColor(argb(Ui.BLUE))
                        .setCorner(new ModifiersBuilders.Corner.Builder().setRadius(dp(3)).build())
                        .build())
                    .build())
                .build());
        }
        if (BAR_WIDTH - filled > 0f) {
            row.addContent(new LayoutElementBuilders.Box.Builder()
                .setWidth(dp(BAR_WIDTH - filled))
                .setHeight(dp(6))
                .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                    .setBackground(new ModifiersBuilders.Background.Builder()
                        .setColor(argb(Ui.EDGE))
                        .setCorner(new ModifiersBuilders.Corner.Builder().setRadius(dp(3)).build())
                        .build())
                    .build())
                .build());
        }
        return row.build();
    }

    private LayoutElementBuilders.LayoutElement addButton(String label, String id, int fill, int textColor) {
        ModifiersBuilders.Clickable click = new ModifiersBuilders.Clickable.Builder()
            .setId(id)
            .setOnClick(new ActionBuilders.LoadAction.Builder().build())
            .build();
        return new LayoutElementBuilders.Box.Builder()
            .setWidth(dp(64))
            .setHeight(dp(38))
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                .setClickable(click)
                .setBackground(new ModifiersBuilders.Background.Builder()
                    .setColor(argb(fill))
                    .setCorner(new ModifiersBuilders.Corner.Builder().setRadius(dp(19)).build())
                    .build())
                .build())
            .addContent(text(label, 14, textColor, true))
            .build();
    }

    /** "Fasting 14h 20m of 16h", or "Not fasting". */
    private String fastLine() {
        if (!GlanceStore.fastActive(this)) return "Not fasting";
        long minutes = Math.max(0, (System.currentTimeMillis() - GlanceStore.fastStartMs(this)) / 60_000L);
        float goal = GlanceStore.fastGoalHours(this);
        String goalText = goal == Math.floor(goal) ? String.valueOf((int) goal) : String.valueOf(goal);
        return "Fasting " + (minutes / 60) + "h " + String.format(java.util.Locale.US, "%02d", minutes % 60) + "m of " + goalText + "h";
    }

    private LayoutElementBuilders.LayoutElement layout() {
        Ui.apply(this);
        boolean imperial = WaterStore.imperial(this);
        int total = WaterStore.totalMl(this);
        int goal = WaterStore.goalMl(this);
        int nonce = WaterStore.nextNonce(this);
        String l1 = "+" + WaterStore.format(WaterStore.stepMl(this, 1), imperial).replace(" fl oz", " oz");
        String l2 = "+" + WaterStore.format(WaterStore.stepMl(this, 2), imperial).replace(" fl oz", " oz");
        LayoutElementBuilders.Row buttons = new LayoutElementBuilders.Row.Builder()
            .addContent(addButton(l1, "1:" + nonce, Ui.BLUE, Ui.ON_ACCENT))
            .addContent(spacer(8, 1))
            .addContent(addButton(l2, "2:" + nonce, Ui.CARD, Ui.INK))
            .build();
        return new LayoutElementBuilders.Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(new LayoutElementBuilders.Column.Builder()
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .addContent(text("WATER", 12, Ui.BLUE, true))
                .addContent(text(WaterStore.format(total, imperial), 32, Ui.INK, true))
                .addContent(text("of " + WaterStore.format(goal, imperial), 12, Ui.MUTED, false))
                .addContent(spacer(1, 6))
                .addContent(bar(total / (float) goal))
                .addContent(spacer(1, 10))
                .addContent(buttons)
                .addContent(spacer(1, 10))
                .addContent(text(fastLine(), 12, GlanceStore.fastActive(this) ? Ui.ACCENT : Ui.MUTED, false))
                .build())
            .build();
    }
}
