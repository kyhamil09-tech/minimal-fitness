package com.kyfitness.wear;

import java.util.ArrayList;
import java.util.List;

/** Interval workouts for the watch (the same presets as the phone app). Steps end after a time or a distance. */
final class WatchIntervals {
    static final int WARMUP = 0, WORK = 1, RECOVER = 2, COOLDOWN = 3;

    static final class Step {
        final int kind;
        final String label;
        /** Milliseconds, or 0 when the step is measured by distance. */
        final long durMs;
        /** Meters, or 0 when the step is measured by time. */
        final double distM;

        Step(int kind, String label, long durMs, double distM) {
            this.kind = kind;
            this.label = label;
            this.durMs = durMs;
            this.distM = distM;
        }
    }

    static final class Preset {
        final String id;
        final String name;
        final Step[] steps;
        final boolean needsDistance;

        Preset(String id, String name, List<Step> steps) {
            this.id = id;
            this.name = name;
            this.steps = steps.toArray(new Step[0]);
            boolean d = false;
            for (Step s : steps) if (s.distM > 0) d = true;
            this.needsDistance = d;
        }
    }

    private static long min(double m) {
        return Math.round(m * 60_000);
    }

    private static void sets(List<Step> out, int reps, long workMs, double workM, long recMs) {
        for (int i = 1; i <= reps; i++) {
            out.add(new Step(WORK, "Interval " + i + " of " + reps, workMs, workM));
            if (i < reps && recMs > 0) out.add(new Step(RECOVER, "Recover", recMs, 0));
        }
    }

    static final Preset[] ALL = build();

    private static Preset[] build() {
        List<Preset> all = new ArrayList<>();

        List<Step> runWalk = new ArrayList<>();
        runWalk.add(new Step(WARMUP, "Brisk walk", min(5), 0));
        for (int i = 1; i <= 8; i++) {
            runWalk.add(new Step(WORK, "Run", min(1), 0));
            if (i < 8) runWalk.add(new Step(RECOVER, "Walk", min(2), 0));
        }
        runWalk.add(new Step(COOLDOWN, "Cool down", min(5), 0));
        all.add(new Preset("run-walk", "Run / walk", runWalk));

        List<Step> fiveByThree = new ArrayList<>();
        fiveByThree.add(new Step(WARMUP, "Warm up", min(8), 0));
        sets(fiveByThree, 5, min(3), 0, min(2));
        fiveByThree.add(new Step(COOLDOWN, "Cool down", min(6), 0));
        all.add(new Preset("5x3", "5 x 3 min", fiveByThree));

        List<Step> x400 = new ArrayList<>();
        x400.add(new Step(WARMUP, "Warm up", min(10), 0));
        sets(x400, 8, 0, 400, 90_000);
        x400.add(new Step(COOLDOWN, "Cool down", min(8), 0));
        all.add(new Preset("8x400", "8 x 400 m", x400));

        List<Step> x800 = new ArrayList<>();
        x800.add(new Step(WARMUP, "Warm up", min(10), 0));
        sets(x800, 6, 0, 800, min(2));
        x800.add(new Step(COOLDOWN, "Cool down", min(8), 0));
        all.add(new Preset("6x800", "6 x 800 m", x800));

        List<Step> tempo = new ArrayList<>();
        tempo.add(new Step(WARMUP, "Warm up", min(10), 0));
        tempo.add(new Step(WORK, "Tempo", min(20), 0));
        tempo.add(new Step(COOLDOWN, "Cool down", min(10), 0));
        all.add(new Preset("tempo20", "Tempo 20", tempo));

        List<Step> fartlek = new ArrayList<>();
        fartlek.add(new Step(WARMUP, "Warm up", min(8), 0));
        for (int i = 1; i <= 6; i++) {
            fartlek.add(new Step(WORK, "Fast", 90_000, 0));
            if (i < 6) fartlek.add(new Step(RECOVER, "Easy", 90_000, 0));
        }
        fartlek.add(new Step(COOLDOWN, "Cool down", min(6), 0));
        all.add(new Preset("fartlek", "Fartlek", fartlek));

        return all.toArray(new Preset[0]);
    }

    static Preset find(String id) {
        for (Preset p : ALL) if (p.id.equals(id)) return p;
        return ALL[1];
    }
}