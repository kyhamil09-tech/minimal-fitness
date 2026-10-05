package com.kyfitness.wear;

import androidx.health.services.client.data.ExerciseType;

/** The workouts offered on the watch. `type` is the name the phone app uses for the same workout. */
final class Sports {
    static final class Sport {
        final String type;
        final String label;
        final ExerciseType exercise;
        /** Outdoor sport that records GPS distance, pace and route on the watch. */
        final boolean gps;
        /** Indoor sport where Health Services can still estimate distance (treadmill). */
        final boolean indoorDistance;
        final int icon;
        /** Which accent colour the icon uses (see Ui.byKey); resolved when drawn so a new look shows straight away. */
        final int tintKey;

        Sport(String type, String label, ExerciseType exercise, boolean gps, boolean indoorDistance, int icon, int tintKey) {
            this.type = type;
            this.label = label;
            this.exercise = exercise;
            this.gps = gps;
            this.indoorDistance = indoorDistance;
            this.icon = icon;
            this.tintKey = tintKey;
        }

        int tint() {
            return Ui.byKey(tintKey);
        }

        boolean hasDistance() {
            return gps || indoorDistance;
        }
    }

    static final Sport[] ALL = {
        new Sport("Running", "Run", ExerciseType.RUNNING, true, false, R.drawable.ic_run, 0),
        new Sport("Treadmill", "Treadmill", ExerciseType.RUNNING_TREADMILL, false, true, R.drawable.ic_run, 0),
        new Sport("Walking", "Walk", ExerciseType.WALKING, true, false, R.drawable.ic_walk, 1),
        new Sport("Hiking", "Hike", ExerciseType.HIKING, true, false, R.drawable.ic_hike, 2),
        new Sport("Cycling", "Cycle", ExerciseType.BIKING, true, false, R.drawable.ic_bike, 3),
        new Sport("IndoorCycling", "Indoor bike", ExerciseType.BIKING_STATIONARY, false, false, R.drawable.ic_bike, 3),
        new Sport("Rowing", "Row", ExerciseType.ROWING_MACHINE, false, false, R.drawable.ic_cardio, 1),
        new Sport("Strength", "Strength", ExerciseType.STRENGTH_TRAINING, false, false, R.drawable.ic_strength, 4),
        new Sport("HIIT", "HIIT", ExerciseType.HIGH_INTENSITY_INTERVAL_TRAINING, false, false, R.drawable.ic_bolt, 5),
        new Sport("Calisthenics", "Bodyweight", ExerciseType.CALISTHENICS, false, false, R.drawable.ic_strength, 4),
        new Sport("Elliptical", "Elliptical", ExerciseType.ELLIPTICAL, false, false, R.drawable.ic_cardio, 0),
        new Sport("Yoga", "Yoga", ExerciseType.YOGA, false, false, R.drawable.ic_heart, 4),
    };

    /** Which gear a workout counts toward: "shoe" for foot sports, "bike" for riding, empty for none. */
    static String gearKind(String type) {
        switch (type) {
            case "Running":
            case "Walking":
            case "Hiking":
            case "Treadmill":
                return "shoe";
            case "Cycling":
            case "IndoorCycling":
                return "bike";
            default:
                return "";
        }
    }

    static Sport find(String type) {
        for (Sport s : ALL) if (s.type.equals(type)) return s;
        return ALL[0];
    }

    private Sports() {}
}