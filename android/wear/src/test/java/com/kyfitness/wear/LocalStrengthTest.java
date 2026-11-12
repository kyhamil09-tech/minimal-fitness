package com.kyfitness.wear;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.json.JSONArray;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** The strength session the watch runs on its own: every button on the set screen, and the sets it hands to the phone. */
public class LocalStrengthTest {
    private static LocalStrength.Item item(String id, String name, double step, int sets, int reps, double weight) {
        LocalStrength.Item it = new LocalStrength.Item();
        it.id = id;
        it.name = name;
        it.step = step;
        for (int i = 0; i < sets; i++) {
            LocalStrength.Row r = new LocalStrength.Row();
            r.reps = reps;
            r.weight = weight;
            it.rows.add(r);
        }
        return it;
    }

    private static List<LocalStrength.Item> two() {
        return new ArrayList<>(Arrays.asList(item("bench-press", "Bench Press", 2.5, 2, 8, 60), item("squat", "Back Squat", 5, 2, 5, 100)));
    }

    @Before
    public void start() {
        WorkoutState.strength = null;
        LocalStrength.startWith("kg", two());
    }

    @After
    public void end() {
        LocalStrength.clear();
        WorkoutState.strength = null;
    }

    private static WorkoutState.Strength now() {
        WorkoutState.Strength s = WorkoutState.strength;
        assertNotNull(s);
        return s;
    }

    @Test
    public void startsOnTheFirstSetOfTheFirstExercise() {
        WorkoutState.Strength s = now();
        assertEquals("Bench Press", s.name);
        assertEquals(0, s.ex);
        assertEquals(2, s.exCount);
        assertEquals(0, s.setIdx);
        assertEquals(2, s.setCount);
        assertEquals(8, (int) s.reps);
        assertEquals(60.0, s.weight, 0.001);
        assertEquals("Back Squat", s.next);
    }

    @Test
    public void doneTicksTheSetStartsTheRestAndMovesToTheNextSet() {
        LocalStrength.apply("done", 0, 0);
        WorkoutState.Strength s = now();
        assertEquals(1, s.doneSets);
        assertEquals(1, s.setIdx);
        assertFalse(s.done);
        assertTrue(s.restEndsAt > System.currentTimeMillis());
    }

    @Test
    public void tickingTheLastSetMovesOnToTheNextExercise() {
        LocalStrength.apply("done", 0, 0);
        LocalStrength.apply("done", 0, 0);
        WorkoutState.Strength s = now();
        assertEquals("Back Squat", s.name);
        assertEquals(1, s.ex);
        assertEquals(2, s.doneSets);
        assertEquals(1, s.exDone[0] == 2 ? 1 : 0);
    }

    @Test
    public void goingBackToATickedSetAndPressingDoneUndoesItAndCancelsTheRest() {
        // Tick both sets of the first exercise: the screen moves on to the second exercise.
        LocalStrength.apply("done", 0, 0);
        LocalStrength.apply("done", 0, 0);
        assertEquals(1, now().ex);
        // Back on the first exercise, its last set shows as done ("undo set").
        LocalStrength.apply("prev", 0, 0);
        WorkoutState.Strength back = now();
        assertEquals(0, back.ex);
        assertTrue(back.done);
        assertEquals(2, back.doneSets);
        // Pressing done again takes the tick off and stops any rest.
        LocalStrength.apply("done", 0, 0);
        WorkoutState.Strength undone = now();
        assertFalse(undone.done);
        assertEquals(1, undone.doneSets);
        assertEquals(0, undone.restEndsAt);
    }
    @Test
    public void repsAndWeightChangeByTheirStepAndStayInRange() {
        LocalStrength.apply("reps", 1, 0);
        LocalStrength.apply("weight", 2, 0);
        WorkoutState.Strength s = now();
        assertEquals(9, (int) s.reps);
        assertEquals(65.0, s.weight, 0.001);
        for (int i = 0; i < 40; i++) LocalStrength.apply("reps", -1, 0);
        assertEquals(1, (int) now().reps);
        for (int i = 0; i < 100; i++) LocalStrength.apply("weight", -1, 0);
        assertEquals(0.0, now().weight, 0.001);
    }

    @Test
    public void addingAndRemovingSets() {
        LocalStrength.apply("addset", 0, 0);
        assertEquals(3, now().setCount);
        // the new set copies the last one
        LocalStrength.apply("delset", 0, 0);
        LocalStrength.apply("delset", 0, 0);
        assertEquals(1, now().setCount);
        LocalStrength.apply("delset", 0, 0);
        assertEquals("never fewer than one set", 1, now().setCount);
    }

    @Test
    public void nextAndPreviousStayInsideTheSession() {
        LocalStrength.apply("prev", 0, 0);
        assertEquals(0, now().ex);
        LocalStrength.apply("next", 0, 0);
        assertEquals(1, now().ex);
        assertTrue(LocalStrength.onLastExercise());
        LocalStrength.apply("jump", 0, 0);
        assertEquals(0, now().ex);
        assertFalse(LocalStrength.onLastExercise());
    }

    @Test
    public void nextOnTheLastExerciseAddsABlankOneWhenNothingElseHandlesIt() {
        LocalStrength.apply("next", 0, 0);
        LocalStrength.apply("next", 0, 0);
        assertEquals(3, now().exCount);
        assertEquals(2, now().ex);
    }

    @Test
    public void anExerciseFromTheLibraryComesWithTheSetsLastDone() {
        LocalStrength.addExercise("deadlift", "Deadlift", 5, Arrays.asList(new double[] {5, 120}, new double[] {5, 125}));
        WorkoutState.Strength s = now();
        assertEquals("Deadlift", s.name);
        assertEquals(3, s.exCount);
        assertEquals(2, s.setCount);
        assertEquals(120.0, s.weight, 0.001);
        // adding one that is already there just goes to it
        LocalStrength.addExercise("bench-press", "Bench Press", 2.5, Arrays.asList(new double[] {8, 60}));
        assertEquals(3, now().exCount);
        assertEquals("Bench Press", now().name);
    }

    @Test
    public void aLibraryExerciseNeverDoneStartsAsThreeSetsOfEight() {
        LocalStrength.addExercise("curl", "Curl", 0, new ArrayList<double[]>());
        WorkoutState.Strength s = now();
        assertEquals(3, s.setCount);
        assertEquals(8, (int) s.reps);
        assertEquals(0.0, s.weight, 0.001);
    }

    @Test
    public void onlyTickedSetsAreHandedToThePhoneInKilograms() throws Exception {
        LocalStrength.apply("done", 0, 0);
        JSONArray out = LocalStrength.exercisesJson();
        assertEquals(1, out.length());
        assertEquals("bench-press", out.getJSONObject(0).getString("id"));
        assertEquals(1, out.getJSONObject(0).getJSONArray("sets").length());
        assertEquals(60.0, out.getJSONObject(0).getJSONArray("sets").getJSONArray(0).getDouble(1), 0.001);
    }

    @Test
    public void poundsAreConvertedToKilogramsForThePhone() throws Exception {
        LocalStrength.clear();
        LocalStrength.startWith("lb", new ArrayList<>(Arrays.asList(item("bench-press", "Bench Press", 5, 1, 5, 135))));
        LocalStrength.apply("done", 0, 0);
        double kg = LocalStrength.exercisesJson().getJSONObject(0).getJSONArray("sets").getJSONArray(0).getDouble(1);
        assertEquals(61.23, kg, 0.02);
    }

    @Test
    public void restCanBeShortenedLengthenedOrSkipped() {
        LocalStrength.apply("done", 0, 0);
        long first = now().restEndsAt;
        LocalStrength.apply("rest", 15, 0);
        assertEquals(first + 15_000, now().restEndsAt);
        LocalStrength.apply("skiprest", 0, 0);
        assertEquals(0, now().restEndsAt);
    }

    @Test
    public void theWatchCarriesOnFromAPhoneSessionThePhoneStoppedAnswering() {
        // What the phone last sent: bench press (set 1 just ticked on the watch), then squat.
        WorkoutState.Strength p = new WorkoutState.Strength();
        p.ex = 0;
        p.exCount = 2;
        p.name = "Bench Press";
        p.unit = "kg";
        p.step = 2.5;
        p.restLen = 90;
        p.setIdx = 0;
        p.setCount = 2;
        p.setReps = new int[] {8, 8};
        p.setWeight = new double[] {60, 60};
        p.setDone = new boolean[] {true, false};
        p.exNames = new String[] {"Bench Press", "Back Squat"};
        p.exDone = new int[] {1, 0};
        p.exTotal = new int[] {2, 3};
        LocalStrength.clear();
        assertTrue(LocalStrength.adopt(null, p));
        // The ticked set stays ticked and the watch moves on to the next set.
        WorkoutState.Strength s = now();
        assertEquals(1, s.setIdx);
        assertEquals(2, s.setCount);
        assertFalse(s.done);
        // Next goes to the squat, which came over with its set count.
        LocalStrength.apply("next", 0, 0);
        s = now();
        assertEquals(1, s.ex);
        assertEquals("Back Squat", s.name);
        assertEquals(3, s.setCount);
        // And it is not adopted twice.
        assertFalse(LocalStrength.adopt(null, p));
    }
}
