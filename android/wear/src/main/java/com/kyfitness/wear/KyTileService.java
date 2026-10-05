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
import java.text.NumberFormat;

/** Watch tile: today's steps and one-tap Run / Walk / Cycle workout starts. */
public class KyTileService extends TileService {
    private static final String RES_VERSION = "1";

    @NonNull
    @Override
    protected ListenableFuture<TileBuilders.Tile> onTileRequest(@NonNull RequestBuilders.TileRequest request) {
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

    private LayoutElementBuilders.LayoutElement button(String label, String type, int fill, int textColor) {
        ModifiersBuilders.Clickable click = new ModifiersBuilders.Clickable.Builder()
            .setId("start_" + type)
            .setOnClick(new ActionBuilders.LaunchAction.Builder()
                .setAndroidActivity(new ActionBuilders.AndroidActivity.Builder()
                    .setPackageName(getPackageName())
                    .setClassName(MainActivity.class.getName())
                    .addKeyToExtraMapping(MainActivity.EXTRA_START, new ActionBuilders.AndroidStringExtra.Builder().setValue(type).build())
                    .build())
                .build())
            .build();
        return new LayoutElementBuilders.Box.Builder()
            .setWidth(dp(64))
            .setHeight(dp(44))
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                .setClickable(click)
                .setBackground(new ModifiersBuilders.Background.Builder()
                    .setColor(argb(fill))
                    .setCorner(new ModifiersBuilders.Corner.Builder().setRadius(dp(22)).build())
                    .build())
                .build())
            .addContent(text(label, 15, textColor, true))
            .build();
    }

    private LayoutElementBuilders.LayoutElement spacer(float w) {
        return new LayoutElementBuilders.Spacer.Builder().setWidth(dp(w)).build();
    }

    private LayoutElementBuilders.LayoutElement layout() {
        int steps = WatchSteps.today(this);
        // Colours from the look chosen on the phone.
        Ui.apply(this);
        LayoutElementBuilders.Row buttons = new LayoutElementBuilders.Row.Builder()
            .addContent(button("RUN", "Running", Ui.ACCENT, Ui.ON_ACCENT))
            .addContent(spacer(8))
            .addContent(button("WALK", "Walking", Ui.CARD, Ui.INK))
            .addContent(spacer(8))
            .addContent(button("RIDE", "Cycling", Ui.CARD, Ui.INK))
            .build();
        return new LayoutElementBuilders.Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(new LayoutElementBuilders.Column.Builder()
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .addContent(text("MINIMAL FITNESS", 12, Ui.ACCENT, true))
                .addContent(text(NumberFormat.getIntegerInstance().format(steps), 36, Ui.INK, true))
                .addContent(text("steps today", 12, Ui.MUTED, false))
                .addContent(new LayoutElementBuilders.Spacer.Builder().setHeight(dp(10)).build())
                .addContent(buttons)
                .build())
            .build();
    }
}