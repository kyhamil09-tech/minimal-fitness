package com.kyfitness.wear;

import android.Manifest;
import android.content.Intent;
import android.media.AudioManager;
import android.os.SystemClock;
import android.text.format.DateFormat;
import android.view.KeyEvent;
import androidx.activity.ComponentActivity;
import androidx.wear.ambient.AmbientLifecycleObserver;
import androidx.wear.ambient.AmbientLifecycleObserverKt;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import androidx.viewpager2.widget.ViewPager2;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Watch app in the phone app's Run Club style: track-black, flat cards, one volt accent.
 * Home: a few favorite workouts plus "More workouts". Picking one opens a setup page with a goal
 * (open, distance, time or calories) and a START button with a 3-2-1 countdown.
 * Workout: swipe between live metrics, controls, heart-rate zones and laps.
 * Ending asks Save / Resume / Discard, then shows a summary. The phone can start, pause and stop the
 * same workout (see {@link WorkoutState}); without the phone the watch records everything itself.
 */
public class MainActivity extends ComponentActivity {
    private static final int REQ_PERMS = 1;
    private static final int REQ_BG_SENSORS = 2;
    /** Text and icons on an accent-colored button: the look's dark ink (set from the chosen look in onCreate). */
    private static int BLACK = 0xFF14130F;
    /** Which version of the phone's look this screen was drawn with; a newer one redraws it. */
    private int lookVersion = 0;
    /** Intent extra set by the tile's buttons: the workout type to set up. */
    static final String EXTRA_START = "ky_start";
    private static final String EXTRA_REOPEN_SETTINGS = "ky_reopen_settings";

    private enum Screen { HOME, MORE, SETUP, COUNTDOWN, SETTINGS, SLEEP, FAST, WORKOUT, END, SUMMARY }

    private final Handler ui = new Handler(Looper.getMainLooper());
    private Screen shown = null;
    /** Which pre-workout page the user is on while no workout runs. */
    private Screen nav = Screen.HOME;
    private boolean endDialog = false;
    private String pendingType = null;
    private boolean pendingFromSetup = false;

    // setup state
    private Sports.Sport setupSport = Sports.ALL[0];
    private Screen setupFrom = Screen.HOME;
    private int setupGoalType = WorkoutState.GOAL_NONE;
    private float setupValue = 0;
    private String setupPresetId = "5x3";
    private int countdownLeft = 0;
    private long startingAt = 0;

    private FrameLayout root;

    // sleep (last night, as the phone sent it)
    private TextView p0Steps;
    private TextView p0StepsCap;
    private LinearLayout stepsCol;
    private ScrollView sleepScroll;
    private ScrollView fastScroll;
    private FastMeterView fastMeter;
    private TextView fastEndLabel;
    private LinearLayout sleepList;
    private TextView sleepRowValue;
    private String shownSleepKey = "";

    // adding an exercise to a strength session
    private FrameLayout pickerLayer;
    private ScrollView pickerScroll;
    private LinearLayout pickerList;
    private String pickerGroup = null;
    private boolean pickerOpen = false;
    private TextView stAuto;

    // always-on (ambient) display while a workout runs
    private AmbientLifecycleObserver ambientObserver;
    private boolean ambient = false;
    private boolean ambientBurnIn = false;
    private FrameLayout ambientLayer;
    private LinearLayout ambientBox;
    private TextView amType;
    private TextView amMain;
    private TextView amSub;
    private TextView amHr;
    private int ambientTicks = 0;

    // home
    private ScrollView idleScroll;
    private LinearLayout idleList;
    private TextView stepsView;
    private LinearLayout quickBox;
    private String shownFavorites = "";
    private TextView hrOnlyLabel;
    private TextView hrOnlyValue;
    private LinearLayout historyBox;
    private int shownHistoryCount = -1;

    // more workouts
    private ScrollView moreScroll;
    private LinearLayout moreList;

    // setup + countdown
    private ScrollView setupScroll;
    private LinearLayout setupList;
    private FrameLayout countdownFrame;
    private TextView countdownText;

    // settings
    private ScrollView settingsScroll;
    private LinearLayout settingsList;

    // workout pager
    private FrameLayout pagerFrame;
    private ViewPager2 pager;
    private TextView dots;
    private View[] pages;
    private View[] pagesPlain;
    private View[] pagesStrength;
    private boolean strengthPagesShown = false;
    // strength: the set page (page 0) and the exercise list (page 1) shown while the phone runs a strength session
    private ScrollView stSetScroll;
    private ScrollView stListScroll;
    private TextView stHeader;
    private TextView stName;
    private TextView stSetLine;
    private TextView stWeightVal;
    private TextView stWeightUnit;
    private TextView stRepsVal;
    private TextView stNext;
    private TextView stRestClock;
    private TextView stDoneLabel;
    private LinearLayout stRestBox;
    private LinearLayout stDoneBtn;
    private LinearLayout stListBox;
    private String stListKey = "";
    private int stDoneShown = -1;
    /** The routine chosen on the Strength setup page: null until chosen, then a routine id or empty for an empty session. */
    private String setupRoutineId = null;
    /** The shoes or bike chosen on the setup page: null until chosen, then a gear id or "none". */
    private String setupGearId = null;
    // page 0: metrics
    private TextView p0Type;
    private TextView p0Banner;
    private TextView p0Main;
    private TextView p0MainCap;
    private FrameLayout goalTrack;
    private View goalFill;
    private TextView p0GoalText;
    private TextView p0Sub;
    private TextView p0Hr;
    private TextView p0Zone;
    private TextView p0ValueA;
    private TextView p0CaptionA;
    /** The main workout page scrolls: the big numbers first, every other stat below. */
    private ScrollView p0Scroll;
    private TextView xTime;
    private TextView xDist;
    private TextView xDistCap;
    private TextView xAvgPace;
    private TextView xAvgPaceCap;
    private TextView xKcal;
    private TextView xAvgHr;
    private TextView xMaxHr;
    private TextView xClimb;
    private TextView xClimbCap;
    private TextView xLaps;
    private TextView xLastLap;
    // page 1: controls
    private ImageView pauseIcon;
    private TextView pauseLabel;
    private TextView lapCount;
    // page 2: zones
    private TextView zHeader;
    private final TextView[] zTimes = new TextView[5];
    private final View[] zBars = new View[5];
    private final LinearLayout[] zRows = new LinearLayout[5];
    private TextView zFooter;
    // page 3: laps
    private TextView lapsCurrent;
    private LinearLayout lapsList;
    private int shownLapCount = -1;

    // end + summary
    private ScrollView endScroll;
    private TextView endTitle;
    private ScrollView summaryScroll;
    private LinearLayout summaryBox;
    private WorkoutState.Summary shownSummary = null;

    private final Runnable refresh = new Runnable() {
        @Override
        public void run() {
            render();
            ui.postDelayed(this, 1000);
        }
    };

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The colors the phone chose (palette and background) come first, so every view below is built with them.
        Ui.lift = liftSessionOn();
        Ui.apply(this);
        BLACK = Ui.ON_ACCENT;
        lookVersion = LookStore.version(this);
        // The screen follows the system timeout (the ongoing-activity chip brings you back), which saves battery.
        getWindow().setBackgroundDrawable(new Ui.GlowBackground());

        root = new FrameLayout(this);
        root.addView(buildHome());
        root.addView(buildMore());
        root.addView(buildSetup());
        root.addView(buildCountdown());
        root.addView(buildSettings());
        root.addView(buildPager());
        root.addView(buildSleep());
        root.addView(buildFast());
        root.addView(buildEnd());
        root.addView(buildSummary());
        root.addView(buildPicker());
        root.addView(buildAmbientLayer());
        setContentView(root);
        // Only when the "Always-on screen" setting is on does the app ask to stay showing in a dim, once-a-minute form while a workout runs.
        // Registering as ambient-capable is what stops the system from turning the screen off, so by default it is left out: the screen
        // sleeps after the system timeout and wakes again with the watch's own wrist gestures, and the workout carries on in the background.
        if (WatchPrefs.alwaysOnWorkout(this)) {
            ambientObserver = AmbientLifecycleObserverKt.AmbientLifecycleObserver(this, getMainExecutor(), new AmbientLifecycleObserver.AmbientLifecycleCallback() {
                @Override
                public void onEnterAmbient(AmbientLifecycleObserver.AmbientDetails details) {
                    enterAmbient(details.getBurnInProtectionRequired());
                }

                @Override
                public void onUpdateAmbient() {
                    if (ambient) renderAmbient();
                }

                @Override
                public void onExitAmbient() {
                    exitAmbient();
                }
            });
            getLifecycle().addObserver(ambientObserver);
        }
        // Changing that setting restarts the screen so it takes effect; come back to the settings page afterwards.
        if (getIntent() != null && getIntent().getBooleanExtra(EXTRA_REOPEN_SETTINGS, false)) {
            getIntent().removeExtra(EXTRA_REOPEN_SETTINGS);
            nav = Screen.SETTINGS;
        }
        idleScroll.requestFocus();
        if (hasSensorPermission()) {
            WatchSteps.register(this);
            askBackgroundSensorsOnce();
        }
        WatchDetect.configure(this);
        WatchCaps.refresh(this);
        handleTileStart(getIntent());
    }

    @Override
    protected void onResume() {
        super.onResume();
        // The look was changed on the phone while this screen was away: draw it again in the new colors.
        if (LookStore.version(this) != lookVersion) {
            recreate();
            return;
        }
        if (ambientObserver != null && !ambientObserver.isAmbient()) ambient = false;
        if (!ambient) ui.post(refresh);
        // Whatever the phone left on the watch while this app was away (routines, exercises, last night's sleep, water).
        DataApply.pull(this);
        // Opening the app is a good moment to hand the day's readings to the phone.
        if (hasSensorPermission()) {
            WatchSteps.flush(this);
            VitalsSync.maybeSend(this, true);
        }
    }

    @Override
    protected void onPause() {
        ui.removeCallbacks(refresh);
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        ensureServiceForPhoneWorkout();
        handleTileStart(intent);
    }

    /** The tile's Run / Walk / Ride buttons open the app on that workout's setup page. */
    private void handleTileStart(Intent intent) {
        if (intent == null) return;
        String type = intent.getStringExtra(EXTRA_START);
        intent.removeExtra(EXTRA_START);
        if (type != null && !WorkoutService.running) openSetup(type, Screen.HOME);
    }

    /** Digital crown / rotary bezel scrolls the visible list, or adjusts the goal on the setup page. */
    @Override
    public boolean onGenericMotionEvent(MotionEvent e) {
        // During a strength session the crown scrolls the set page and the exercise list.
        if (!pickerOpen && shown == Screen.WORKOUT && p0Scroll != null && e.getAction() == MotionEvent.ACTION_SCROLL && e.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)
            && pages != null && pager.getCurrentItem() < pages.length && pages[pager.getCurrentItem()] == p0Scroll) {
            p0Scroll.scrollBy(0, Math.round(-e.getAxisValue(MotionEvent.AXIS_SCROLL) * ViewConfiguration.get(this).getScaledVerticalScrollFactor()));
            return true;
        }
        if (pickerOpen && e.getAction() == MotionEvent.ACTION_SCROLL && e.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
            pickerScroll.scrollBy(0, Math.round(-e.getAxisValue(MotionEvent.AXIS_SCROLL) * ViewConfiguration.get(this).getScaledVerticalScrollFactor()));
            return true;
        }
        if (e.getAction() == MotionEvent.ACTION_SCROLL && e.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER) && shown == Screen.WORKOUT && strengthPagesShown) {
            int page = pager.getCurrentItem();
            ScrollView sv = page == 0 ? stSetScroll : page == 1 ? stListScroll : null;
            if (sv != null) {
                sv.scrollBy(0, Math.round(-e.getAxisValue(MotionEvent.AXIS_SCROLL) * ViewConfiguration.get(this).getScaledVerticalScrollFactor()));
                return true;
            }
        }
        if (e.getAction() == MotionEvent.ACTION_SCROLL && e.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER) && shown != Screen.WORKOUT) {
            float axis = e.getAxisValue(MotionEvent.AXIS_SCROLL);
            if (shown == Screen.SETUP && setupGoalType != WorkoutState.GOAL_NONE && setupGoalType != WorkoutState.GOAL_INTERVALS) {
                nudgeGoal(axis < 0 ? 1 : -1);
                return true;
            }
            float delta = -axis * ViewConfiguration.get(this).getScaledVerticalScrollFactor();
            ScrollView target = shown == Screen.SETTINGS ? settingsScroll
                : shown == Screen.SLEEP ? sleepScroll
                : shown == Screen.FAST ? fastScroll
                : shown == Screen.END ? endScroll
                : shown == Screen.SUMMARY ? summaryScroll
                : shown == Screen.MORE ? moreScroll
                : shown == Screen.SETUP ? setupScroll
                : idleScroll;
            target.scrollBy(0, Math.round(delta));
            return true;
        }
        return super.onGenericMotionEvent(e);
    }

    // ---- swipe back ----
    private float swipeX0;
    private float swipeY0;
    private boolean swipeTracking;

    /**
     * Swipe right from the left edge to go back one step inside a menu, like the back button. The system's swipe-to-dismiss is off
     * (see KyTheme) because it closed the whole app from any menu. From the main screen, or the workout pages, the swipe still
     * leaves the app (a running workout keeps going in the background).
     */
    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        int w = getResources().getDisplayMetrics().widthPixels;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                swipeX0 = e.getX();
                swipeY0 = e.getY();
                swipeTracking = swipeX0 < w * 0.22f;
                break;
            case MotionEvent.ACTION_UP:
                if (swipeTracking) {
                    swipeTracking = false;
                    float dx = e.getX() - swipeX0;
                    float dy = Math.abs(e.getY() - swipeY0);
                    if (dx > w * 0.25f && dy < dx * 0.6f) {
                        MotionEvent cancel = MotionEvent.obtain(e);
                        cancel.setAction(MotionEvent.ACTION_CANCEL);
                        super.dispatchTouchEvent(cancel);
                        cancel.recycle();
                        if (pickerOpen) pickerBack();
                        else if (shown == Screen.HOME || shown == Screen.WORKOUT || shown == null) finish();
                        else onBackPressed();
                        return true;
                    }
                }
                break;
            case MotionEvent.ACTION_CANCEL:
                swipeTracking = false;
                break;
            default:
                break;
        }
        return super.dispatchTouchEvent(e);
    }

    @Override
    public void onBackPressed() {
        if (pickerOpen) {
            pickerBack();
        } else if (shown == Screen.SETTINGS || shown == Screen.MORE || shown == Screen.SLEEP || shown == Screen.FAST) {
            nav = Screen.HOME;
            render();
        } else if (shown == Screen.SETUP) {
            nav = setupFrom;
            render();
        } else if (shown == Screen.COUNTDOWN) {
            cancelCountdown();
        } else if (shown == Screen.END) {
            endDialog = false;
            render();
        } else if (shown == Screen.SUMMARY) {
            WorkoutState.summary = null;
            render();
        } else {
            super.onBackPressed();
        }
    }

    // ---------------------------------------------------------------- small view helpers

    private int dp(float v) {
        return Ui.dp(this, v);
    }

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER_HORIZONTAL);
        l.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return l;
    }

    private LinearLayout.LayoutParams match(int topMarginDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topMarginDp);
        return lp;
    }

    private LinearLayout.LayoutParams weight(float w) {
        return new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, w);
    }

    private ScrollView scroller(LinearLayout content, int top, int bottom) {
        ScrollView s = new ScrollView(this);
        s.setVerticalScrollBarEnabled(false);
        s.setFocusable(true);
        s.setFocusableInTouchMode(true);
        content.setPadding(dp(26), dp(top), dp(26), dp(bottom));
        s.addView(content);
        return s;
    }

    /** A full-width glass row: tinted icon chip and label. The label view is the row's tag. */
    private LinearLayout row(int iconRes, int tint, String label) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setBackground(Ui.glass(this, 24));
        r.setPadding(dp(12), dp(7), dp(12), dp(7));
        r.setMinimumHeight(dp(46));
        r.setLayoutParams(match(7));

        FrameLayout chip = new FrameLayout(this);
        chip.setBackground(Ui.tinted(this, tint, 14, 0x55, 0x2A));
        chip.addView(Ui.icon(this, iconRes, tint, 17), new FrameLayout.LayoutParams(dp(17), dp(17), Gravity.CENTER));
        r.addView(chip, new LinearLayout.LayoutParams(dp(30), dp(30)));

        TextView t = Ui.text(this, label, 14, Ui.INK, false);
        t.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        tp.leftMargin = dp(10);
        r.addView(t, tp);
        r.setTag(t);
        return r;
    }

    private TextView caption(String s) {
        TextView t = Ui.text(this, s, 12, Ui.MUTED, false);
        t.setGravity(Gravity.START);
        t.setPadding(dp(6), dp(16), 0, dp(2));
        t.setLayoutParams(match(0));
        return t;
    }

    private LinearLayout glassCell(TextView value, TextView cap) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setGravity(Gravity.CENTER);
        c.setBackground(Ui.glass(this, 22));
        c.setPadding(dp(6), dp(8), dp(6), dp(8));
        c.addView(value);
        c.addView(cap);
        return c;
    }

    private LinearLayout actionButton(int iconRes, String label, int tint, TextView[] labelOut, ImageView[] iconOut) {
        LinearLayout b = new LinearLayout(this);
        b.setOrientation(LinearLayout.VERTICAL);
        b.setGravity(Gravity.CENTER);
        b.setBackground(Ui.tinted(this, tint, 26, 0x55, 0x22));
        b.setPadding(dp(6), dp(10), dp(6), dp(10));
        b.setMinimumHeight(dp(72));
        ImageView icon = Ui.icon(this, iconRes, Ui.INK, 24);
        b.addView(icon);
        TextView t = Ui.text(this, label, 11, Ui.INK, false);
        t.setPadding(0, dp(3), 0, 0);
        b.addView(t);
        if (labelOut != null) labelOut[0] = t;
        if (iconOut != null) iconOut[0] = icon;
        return b;
    }

    // ---------------------------------------------------------------- home

    private View buildHome() {
        idleList = column();
        TextView eyebrow = Ui.text(this, "MINIMAL FITNESS", 11, Ui.ACCENT, true);
        eyebrow.setLetterSpacing(0.16f);
        idleList.addView(eyebrow);
        stepsView = Ui.num(this, "", 30, Ui.INK);
        idleList.addView(stepsView);
        TextView stepsCap = Ui.text(this, "STEPS TODAY", 9, Ui.MUTED, true);
        stepsCap.setLetterSpacing(0.14f);
        stepsCap.setPadding(0, dp(1), 0, dp(10));
        idleList.addView(stepsCap);

        quickBox = column();
        idleList.addView(quickBox);

        LinearLayout more = row(R.drawable.ic_cardio, Ui.ACCENT, "More workouts");
        more.setOnClickListener(v -> {
            nav = Screen.MORE;
            render();
        });
        more.setLayoutParams(match(10));
        idleList.addView(more);

        LinearLayout hr = row(R.drawable.ic_heart, Ui.RED, "Heart rate only");
        hrOnlyLabel = (TextView) hr.getTag();
        hrOnlyValue = Ui.text(this, "", 14, Ui.RED, true);
        hr.addView(hrOnlyValue);
        hr.setOnClickListener(v -> toggleHeartRateOnly());
        idleList.addView(hr);

        idleList.addView(caption("TODAY"));
        LinearLayout fast = row(R.drawable.ic_bolt, Ui.ACCENT, "Start fast");
        fastLabel = (TextView) fast.getTag();
        fastValue = Ui.text(this, "", 14, Ui.ACCENT, true);
        fast.addView(fastValue);
        fast.setOnClickListener(v -> openFast());
        fastRow = fast;
        idleList.addView(fast);

        LinearLayout meal = row(R.drawable.ic_eat, Ui.ACCENT, "Log a meal");
        meal.setOnClickListener(v -> logMealByVoice());
        idleList.addView(meal);

        LinearLayout sleep = row(R.drawable.ic_moon, Ui.PURPLE, "Sleep");
        sleepRowValue = Ui.text(this, "", 14, Ui.PURPLE, true);
        sleep.addView(sleepRowValue);
        sleep.setOnClickListener(v -> {
            nav = Screen.SLEEP;
            render();
        });
        idleList.addView(sleep);

        idleList.addView(caption("RECENT"));
        historyBox = column();
        idleList.addView(historyBox);

        LinearLayout settings = row(R.drawable.ic_settings, Ui.MUTED, "Workout settings");
        settings.setOnClickListener(v -> {
            nav = Screen.SETTINGS;
            render();
        });
        settings.setLayoutParams(match(16));
        idleList.addView(settings);

        idleScroll = scroller(idleList, 34, 60);
        return idleScroll;
    }

    /** Dictate what you ate ("two eggs and toast"); the phone turns it into food entries and sends back what it logged. */
    private final androidx.activity.result.ActivityResultLauncher<Intent> voiceFood = registerForActivityResult(
        new androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult(),
        result -> {
            if (result.getResultCode() != RESULT_OK || result.getData() == null) return;
            java.util.ArrayList<String> heard = result.getData().getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
            if (heard == null || heard.isEmpty() || heard.get(0).trim().isEmpty()) return;
            String said = heard.get(0).trim();
            PhoneLink.send(this, "/ky/food/voice", said);
            Haptics.tick(this);
            android.widget.Toast.makeText(this, "Sent to your phone: " + said, android.widget.Toast.LENGTH_LONG).show();
        });

    private void logMealByVoice() {
        Intent i = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "What did you eat?");
        try {
            voiceFood.launch(i);
        } catch (android.content.ActivityNotFoundException e) {
            android.widget.Toast.makeText(this, "Voice input is not available on this watch", android.widget.Toast.LENGTH_LONG).show();
        }
    }

    /** A quick-start tile: the first one is the solid accent call to action. */
    private LinearLayout sportTile(final Sports.Sport sport, boolean primary) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setGravity(Gravity.CENTER);
        t.setBackground(primary ? Ui.solid(this, Ui.ACCENT, 24) : Ui.glass(this, 24));
        t.setPadding(dp(6), dp(12), dp(6), dp(12));
        t.setMinimumHeight(dp(84));
        t.addView(Ui.icon(this, sport.icon, primary ? BLACK : sport.tint(), 26));
        TextView label = Ui.text(this, sport.label.toUpperCase(Locale.getDefault()), 11, primary ? BLACK : Ui.INK, true);
        label.setLetterSpacing(0.08f);
        label.setPadding(0, dp(6), 0, 0);
        t.addView(label);
        t.setOnClickListener(v -> openSetup(sport.type, Screen.HOME));
        return t;
    }

    private void renderQuickTiles() {
        List<String> favs = new ArrayList<>();
        for (String s : WatchPrefs.favorites(this)) if (WatchCaps.supports(this, Sports.find(s).exercise)) favs.add(s);
        String key = String.valueOf(favs);
        if (key.equals(shownFavorites)) return;
        shownFavorites = key;
        quickBox.removeAllViews();
        for (int i = 0; i < favs.size(); i += 2) {
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            LinearLayout.LayoutParams a = weight(1f);
            a.rightMargin = dp(4);
            r.addView(sportTile(Sports.find(favs.get(i)), i == 0), a);
            LinearLayout.LayoutParams b = weight(1f);
            b.leftMargin = dp(4);
            if (i + 1 < favs.size()) r.addView(sportTile(Sports.find(favs.get(i + 1)), false), b);
            else r.addView(new View(this), b);
            quickBox.addView(r, match(8));
        }
    }

    private TextView fastLabel;
    private TextView fastValue;
    private LinearLayout fastRow;
    /** Ending a fast needs a second tap within a few seconds, so a brush of the screen cannot end it. */
    private long fastEndArmedUntil = 0;

    /** Opens the fasting screen, starting a fast first when none is running. */
    private void openFast() {
        if (!WatchPrefs.fasting(this)) return;
        if (!GlanceStore.fastActive(this)) {
            long now = System.currentTimeMillis();
            GlanceStore.setFast(this, true, now, GlanceStore.fastGoalHours(this));
            PhoneLink.send(this, PhoneLink.PATH_CMD, "{\"cmd\":\"fast\",\"action\":\"start\",\"at\":" + now + "}");
            Haptics.lap(this);
        }
        nav = Screen.FAST;
        render();
    }

    /** Ending a fast needs a second tap, so a brush of the screen cannot end it. */
    private void endFastTap() {
        long now = System.currentTimeMillis();
        if (now < fastEndArmedUntil) {
            fastEndArmedUntil = 0;
            GlanceStore.setFast(this, false, 0, 0);
            PhoneLink.send(this, PhoneLink.PATH_CMD, "{\"cmd\":\"fast\",\"action\":\"end\",\"at\":" + now + "}");
            Haptics.lap(this);
            nav = Screen.HOME;
            render();
        } else {
            fastEndArmedUntil = now + 4000;
            fastEndLabel.setText("Tap again to end");
        }
    }

    private double fastHours() {
        return Math.max(0, (System.currentTimeMillis() - GlanceStore.fastStartMs(this)) / 3_600_000.0);
    }

    private View buildFast() {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        fastMeter = new FastMeterView(this);
        c.addView(fastMeter, new LinearLayout.LayoutParams(dp(196), dp(196)));
        LinearLayout end = row(R.drawable.ic_stop, Ui.RED, "End fast");
        fastEndLabel = (TextView) end.getTag();
        end.setOnClickListener(v -> endFastTap());
        end.setLayoutParams(match(8));
        c.addView(end);
        LinearLayout back = row(R.drawable.ic_close, Ui.MUTED, "Back");
        back.setOnClickListener(v -> {
            nav = Screen.HOME;
            render();
        });
        back.setLayoutParams(match(6));
        c.addView(back);
        fastScroll = scroller(c, 24, 60);
        fastScroll.setVisibility(View.GONE);
        return fastScroll;
    }

    private void renderFast() {
        if (!GlanceStore.fastActive(this) || !WatchPrefs.fasting(this)) {
            nav = Screen.HOME;
            return;
        }
        fastMeter.setFast(fastHours(), GlanceStore.fastGoalHours(this), false);
        if (System.currentTimeMillis() >= fastEndArmedUntil) fastEndLabel.setText("End fast");
    }

    private void renderFastRow() {
        if (fastLabel == null) return;
        boolean on = WatchPrefs.fasting(this);
        if (fastRow != null) fastRow.setVisibility(on ? View.VISIBLE : View.GONE);
        if (!on) return;
        if (!GlanceStore.fastActive(this)) {
            fastLabel.setText("Start fast");
            fastValue.setText("");
        } else {
            long mins = Math.max(0, (System.currentTimeMillis() - GlanceStore.fastStartMs(this)) / 60_000);
            fastLabel.setText("Fasting");
            fastValue.setText(String.format(Locale.getDefault(), "%dh %02dm", mins / 60, mins % 60));
        }
    }

    private void renderIdle() {
        renderFastRow();
        int sleepMin = GlanceStore.sleepMin(this);
        sleepRowValue.setText(sleepMin < 0 ? "" : (sleepMin / 60) + "h " + String.format(Locale.getDefault(), "%02d", sleepMin % 60) + "m");
        renderQuickTiles();
        int steps = WatchSteps.today(this);
        stepsView.setText(steps > 0 ? String.format(Locale.getDefault(), "%,d", steps) : "0");
        boolean hrOnly = HeartRateService.running;
        hrOnlyLabel.setText(hrOnly ? "Stop heart rate" : "Heart rate only");
        hrOnlyValue.setText(hrOnly && WorkoutState.bpm > 0 ? WorkoutState.bpm + " bpm" : "");

        List<String> lines = WorkoutStore.lines(this, 3);
        if (lines.size() != shownHistoryCount) {
            shownHistoryCount = lines.size();
            historyBox.removeAllViews();
            if (lines.isEmpty()) {
                TextView none = Ui.text(this, "No workouts yet", 12, Ui.MUTED, false);
                none.setPadding(0, dp(8), 0, 0);
                historyBox.addView(none);
            }
            for (String line : lines) {
                TextView t = Ui.text(this, line, 12, Ui.INK, false);
                t.setGravity(Gravity.START);
                t.setBackground(Ui.glass(this, 20));
                t.setPadding(dp(14), dp(10), dp(14), dp(10));
                t.setLayoutParams(match(7));
                historyBox.addView(t);
            }
        }
    }

    // ---------------------------------------------------------------- more workouts

    private View buildMore() {
        moreList = column();
        moreScroll = scroller(moreList, 34, 60);
        moreScroll.setVisibility(View.GONE);
        return moreScroll;
    }

    private void renderMore() {
        moreList.removeAllViews();
        moreList.addView(Ui.num(this, "ALL WORKOUTS", 22, Ui.INK));
        TextView hint = Ui.text(this, "Tap to set up  -  star to pin to home", 10, Ui.MUTED, false);
        hint.setPadding(0, dp(2), 0, dp(6));
        moreList.addView(hint);
        LinearLayout breathe = row(R.drawable.ic_moon, Ui.BLUE, "Breathe");
        breathe.setContentDescription("Breathe. Guided breathing with buzzes.");
        breathe.setOnClickListener(v -> startActivity(new android.content.Intent(this, BreatheActivity.class)));
        moreList.addView(breathe);
        List<String> favs = WatchPrefs.favorites(this);
        for (final Sports.Sport sport : Sports.ALL) {
            if (!WatchCaps.supports(this, sport.exercise)) continue;
            LinearLayout r = row(sport.icon, sport.tint(), sport.label);
            if (sport.gps) {
                TextView gps = Ui.text(this, "GPS", 9, Ui.MUTED, false);
                gps.setPadding(0, 0, dp(6), 0);
                r.addView(gps);
            }
            final boolean fav = favs.contains(sport.type);
            TextView star = Ui.text(this, fav ? "★" : "☆", 20, fav ? Ui.ACCENT : Ui.MUTED, false);
            star.setPadding(dp(8), dp(4), dp(4), dp(4));
            star.setContentDescription((fav ? "Unpin " : "Pin ") + sport.label + " on the home screen");
            star.setOnClickListener(v -> {
                WatchPrefs.toggleFavorite(this, sport.type);
                renderMore();
            });
            r.addView(star);
            r.setOnClickListener(v -> openSetup(sport.type, Screen.MORE));
            moreList.addView(r);
        }
        LinearLayout back = row(R.drawable.ic_close, Ui.MUTED, "Back");
        back.setOnClickListener(v -> {
            nav = Screen.HOME;
            render();
        });
        back.setLayoutParams(match(14));
        moreList.addView(back);
    }

    // ---------------------------------------------------------------- setup (goal) + countdown

    private View buildSetup() {
        setupList = column();
        setupScroll = scroller(setupList, 30, 56);
        setupScroll.setVisibility(View.GONE);
        return setupScroll;
    }

    private View buildCountdown() {
        countdownFrame = new FrameLayout(this);
        countdownText = Ui.num(this, "3", 110, Ui.ACCENT);
        countdownFrame.addView(countdownText, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        countdownFrame.setOnClickListener(v -> cancelCountdown());
        countdownFrame.setVisibility(View.GONE);
        return countdownFrame;
    }

    private float goalDefault(int goalType) {
        switch (goalType) {
            case WorkoutState.GOAL_DISTANCE: return WatchPrefs.miles(this) ? 3f : 5f;
            case WorkoutState.GOAL_TIME: return 30f;
            default: return 300f;
        }
    }

    private float goalStep(int goalType) {
        return goalType == WorkoutState.GOAL_DISTANCE ? 0.5f : goalType == WorkoutState.GOAL_TIME ? 5f : 50f;
    }

    private float goalMax(int goalType) {
        return goalType == WorkoutState.GOAL_DISTANCE ? 100f : goalType == WorkoutState.GOAL_TIME ? 300f : 3000f;
    }

    private void selectGoalType(int goalType) {
        setupGoalType = goalType;
        if (goalType != WorkoutState.GOAL_NONE && goalType != WorkoutState.GOAL_INTERVALS) {
            setupValue = WatchPrefs.goalValue(this, setupSport.type, goalType, goalDefault(goalType));
        }
        renderSetup();
    }

    private void nudgeGoal(int dir) {
        float step = goalStep(setupGoalType);
        float v = setupValue + dir * step;
        setupValue = Math.max(step, Math.min(goalMax(setupGoalType), v));
        renderSetup();
    }

    private void openSetup(String type, Screen from) {
        if (WorkoutService.running) return;
        setupSport = Sports.find(type);
        setupFrom = from;
        int gt = WatchPrefs.goalType(this, type);
        if (gt == WorkoutState.GOAL_DISTANCE && !setupSport.hasDistance()) gt = WorkoutState.GOAL_NONE;
        // Strength is run set by set from a routine, so it has no goal and starts with a fresh routine choice.
        if ("Strength".equals(type)) gt = WorkoutState.GOAL_NONE;
        setupRoutineId = null;
        setupGearId = null;
        setupGoalType = gt;
        setupValue = (gt == WorkoutState.GOAL_NONE || gt == WorkoutState.GOAL_INTERVALS) ? 0 : WatchPrefs.goalValue(this, type, gt, goalDefault(gt));
        setupPresetId = WatchPrefs.intervalId(this);
        nav = Screen.SETUP;
        renderSetup();
        render();
        setupScroll.scrollTo(0, 0);
    }

    private TextView chip(String label, boolean selected, View.OnClickListener click) {
        TextView c = Ui.text(this, label, 12, selected ? BLACK : Ui.INK, true);
        c.setBackground(selected ? Ui.solid(this, Ui.ACCENT, 20) : Ui.glass(this, 20));
        c.setPadding(dp(8), dp(9), dp(8), dp(9));
        c.setOnClickListener(click);
        return c;
    }

    private TextView roundButton(String glyph, View.OnClickListener click) {
        TextView b = Ui.text(this, glyph, 22, Ui.INK, true);
        b.setBackground(Ui.glass(this, 24));
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(46), dp(46)));
        b.setOnClickListener(click);
        return b;
    }

    private void renderSetup() {
        setupList.removeAllViews();

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER);
        head.addView(Ui.icon(this, setupSport.icon, setupSport.tint(), 26));
        TextView name = Ui.num(this, setupSport.label.toUpperCase(Locale.getDefault()), 28, Ui.INK);
        name.setPadding(dp(8), 0, 0, 0);
        head.addView(name);
        setupList.addView(head);

        if ("Strength".equals(setupSport.type)) {
            addRoutineRows();
        } else {
        addGearRows();
        TextView cap = Ui.text(this, "GOAL", 9, Ui.MUTED, true);
        cap.setLetterSpacing(0.16f);
        cap.setPadding(0, dp(12), 0, dp(4));
        setupList.addView(cap);

        // Goal chips, two per row
        List<Integer> types = new ArrayList<>();
        types.add(WorkoutState.GOAL_NONE);
        if (setupSport.hasDistance()) types.add(WorkoutState.GOAL_DISTANCE);
        types.add(WorkoutState.GOAL_TIME);
        types.add(WorkoutState.GOAL_KCAL);
        types.add(WorkoutState.GOAL_INTERVALS);
        String[] names = {"Open", "Distance", "Time", "Calories", "Intervals"};
        for (int i = 0; i < types.size(); i += 2) {
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            for (int j = i; j < Math.min(types.size(), i + 2); j++) {
                final int gt = types.get(j);
                LinearLayout.LayoutParams lp = weight(1f);
                if (j % 2 == 0) lp.rightMargin = dp(3);
                else lp.leftMargin = dp(3);
                r.addView(chip(names[gt], gt == setupGoalType, v -> selectGoalType(gt)), lp);
            }
            if (types.size() - i == 1) r.addView(new View(this), weight(1f));
            setupList.addView(r, match(6));
        }

        if (setupGoalType == WorkoutState.GOAL_NONE) {
            TextView free = Ui.text(this, "No target, just go", 11, Ui.MUTED, false);
            free.setPadding(0, dp(14), 0, dp(14));
            setupList.addView(free);
        } else if (setupGoalType == WorkoutState.GOAL_INTERVALS) {
            addPresetRows();
        } else {
            LinearLayout stepper = new LinearLayout(this);
            stepper.setOrientation(LinearLayout.HORIZONTAL);
            stepper.setGravity(Gravity.CENTER_VERTICAL);
            stepper.addView(roundButton("−", v -> nudgeGoal(-1)));
            LinearLayout mid = column();
            mid.setGravity(Gravity.CENTER);
            String value = setupGoalType == WorkoutState.GOAL_DISTANCE
                ? String.format(Locale.getDefault(), "%.1f", setupValue)
                : String.format(Locale.getDefault(), "%d", Math.round(setupValue));
            mid.addView(Ui.num(this, value, 44, Ui.INK));
            String unit = setupGoalType == WorkoutState.GOAL_DISTANCE ? (WatchPrefs.miles(this) ? "MILES" : "KM")
                : setupGoalType == WorkoutState.GOAL_TIME ? "MINUTES" : "KCAL";
            TextView u = Ui.text(this, unit, 10, Ui.MUTED, true);
            u.setLetterSpacing(0.14f);
            mid.addView(u);
            stepper.addView(mid, weight(1f));
            stepper.addView(roundButton("+", v -> nudgeGoal(1)));
            setupList.addView(stepper, match(10));
            TextView tip = Ui.text(this, "Turn the crown to adjust", 9, Ui.MUTED, false);
            tip.setPadding(0, dp(4), 0, dp(6));
            setupList.addView(tip);
        }

        addTargetRows();
        }

        LinearLayout start = new LinearLayout(this);
        start.setGravity(Gravity.CENTER);
        start.setBackground(Ui.solid(this, Ui.ACCENT, 30));
        start.setMinimumHeight(dp(56));
        TextView go = Ui.num(this, "START", 24, BLACK);
        go.setLetterSpacing(0.04f);
        start.addView(go);
        start.setOnClickListener(v -> onStartPressed());
        setupList.addView(start, match(8));

        LinearLayout back = row(R.drawable.ic_close, Ui.MUTED, "Back");
        back.setOnClickListener(v -> {
            nav = setupFrom;
            render();
        });
        back.setLayoutParams(match(10));
        setupList.addView(back);
    }

    /** The interval workouts that suit this activity: those measured by distance need GPS. */
    private void addPresetRows() {
        TextView hint = Ui.text(this, "Buzz at every step", 9, Ui.MUTED, false);
        hint.setPadding(0, dp(10), 0, dp(2));
        setupList.addView(hint);
        for (final WatchIntervals.Preset preset : WatchIntervals.ALL) {
            if (preset.needsDistance && !setupSport.hasDistance()) continue;
            boolean on = preset.id.equals(setupPresetId);
            TextView r = Ui.text(this, preset.name, 13, on ? BLACK : Ui.INK, true);
            r.setBackground(on ? Ui.solid(this, Ui.ACCENT, 20) : Ui.glass(this, 20));
            r.setPadding(dp(10), dp(10), dp(10), dp(10));
            r.setOnClickListener(v -> {
                setupPresetId = preset.id;
                renderSetup();
            });
            setupList.addView(r, match(5));
        }
    }

    private static final int[] BEAT_PRESETS = {160, 170, 180, 190};

    /** Pace alert, heart-rate zone alert and the cadence beat, saved as you change them. */
    private void addTargetRows() {
        TextView cap = Ui.text(this, "ALERTS", 9, Ui.MUTED, true);
        cap.setLetterSpacing(0.16f);
        cap.setPadding(0, dp(14), 0, dp(4));
        setupList.addView(cap);

        if ("Swimming".equals(setupSport.type)) {
            float len = WatchPrefs.poolLengthM(this);
            float[] lens = {25f, 50f, 22.86f};
            String[] names = {"25 m", "50 m", "25 yd"};
            LinearLayout pool = new LinearLayout(this);
            pool.setOrientation(LinearLayout.HORIZONTAL);
            for (int i = 0; i < lens.length; i++) {
                final float l = lens[i];
                TextView c = chip(names[i], Math.abs(len - l) < 0.05f, v -> {
                    WatchPrefs.setPoolLengthM(this, l);
                    renderSetup();
                });
                LinearLayout.LayoutParams lp = weight(1f);
                lp.leftMargin = dp(2);
                lp.rightMargin = dp(2);
                pool.addView(c, lp);
            }
            TextView pcap = Ui.text(this, "Pool length", 9, Ui.MUTED, false);
            pcap.setPadding(0, dp(8), 0, dp(2));
            setupList.addView(pcap);
            setupList.addView(pool, match(2));
        }

        if (setupSport.hasDistance() && !"Swimming".equals(setupSport.type)) {
            float pace = WatchPrefs.targetPace(this);
            boolean miles = WatchPrefs.miles(this);
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.addView(chip(pace > 0 ? "Pace on" : "Pace off", pace > 0, v -> {
                WatchPrefs.setTargetPace(this, WatchPrefs.targetPace(this) > 0 ? 0f : (miles ? 330f / 1.609344f : 330f));
                renderSetup();
            }), weight(1f));
            if (pace > 0) {
                double shown = miles ? pace * 1.609344 : pace;
                int total = (int) Math.round(shown);
                TextView value = Ui.num(this, String.format(Locale.getDefault(), "%d:%02d", total / 60, total % 60), 22, Ui.INK);
                LinearLayout.LayoutParams vp = new LinearLayout.LayoutParams(dp(64), LinearLayout.LayoutParams.WRAP_CONTENT);
                row.addView(roundButton("\u2212", v -> nudgePace(-5)), new LinearLayout.LayoutParams(dp(40), dp(40)));
                row.addView(value, vp);
                row.addView(roundButton("+", v -> nudgePace(5)), new LinearLayout.LayoutParams(dp(40), dp(40)));
            }
            setupList.addView(row, match(5));
        }

        int zone = WatchPrefs.targetZone(this);
        LinearLayout zones = new LinearLayout(this);
        zones.setOrientation(LinearLayout.HORIZONTAL);
        for (int z = 0; z <= 5; z++) {
            final int zz = z;
            TextView c = chip(z == 0 ? "Off" : "Z" + z, zone == z, v -> {
                WatchPrefs.setTargetZone(this, zz);
                renderSetup();
            });
            c.setPadding(dp(2), dp(8), dp(2), dp(8));
            LinearLayout.LayoutParams lp = weight(1f);
            lp.leftMargin = dp(2);
            lp.rightMargin = dp(2);
            zones.addView(c, lp);
        }
        TextView zcap = Ui.text(this, "Heart-rate zone", 9, Ui.MUTED, false);
        zcap.setPadding(0, dp(8), 0, dp(2));
        setupList.addView(zcap);
        setupList.addView(zones, match(2));

        boolean beat = WatchPrefs.beatOn(this);
        int bpm = WatchPrefs.beatBpm(this);
        LinearLayout beatRow = new LinearLayout(this);
        beatRow.setOrientation(LinearLayout.HORIZONTAL);
        beatRow.setGravity(Gravity.CENTER_VERTICAL);
        beatRow.addView(chip(beat ? "Beat on" : "Beat off", beat, v -> {
            WatchPrefs.setBeat(this, !WatchPrefs.beatOn(this), WatchPrefs.beatBpm(this));
            renderSetup();
        }), weight(1f));
        if (beat) {
            beatRow.addView(roundButton("\u2212", v -> nudgeBeat(-2)), new LinearLayout.LayoutParams(dp(40), dp(40)));
            beatRow.addView(Ui.num(this, String.valueOf(bpm), 22, Ui.INK), new LinearLayout.LayoutParams(dp(54), LinearLayout.LayoutParams.WRAP_CONTENT));
            beatRow.addView(roundButton("+", v -> nudgeBeat(2)), new LinearLayout.LayoutParams(dp(40), dp(40)));
        }
        setupList.addView(beatRow, match(8));
        if (beat) {
            TextView bcap = Ui.text(this, "steps per minute", 9, Ui.MUTED, false);
            setupList.addView(bcap);
        }
    }

    private void nudgePace(int deltaSec) {
        boolean miles = WatchPrefs.miles(this);
        double shown = WatchPrefs.targetPace(this) * (miles ? 1.609344 : 1.0);
        shown = Math.max(150, Math.min(900, Math.round(shown / 5.0) * 5 + deltaSec));
        WatchPrefs.setTargetPace(this, (float) (miles ? shown / 1.609344 : shown));
        renderSetup();
    }

    private void nudgeBeat(int delta) {
        int bpm = Math.max(120, Math.min(210, WatchPrefs.beatBpm(this) + delta));
        WatchPrefs.setBeat(this, WatchPrefs.beatOn(this), bpm);
        renderSetup();
    }

    private void onStartPressed() {
        if (WorkoutService.running) return;
        WatchPrefs.setGoal(this, setupSport.type, setupGoalType, setupValue);
        WorkoutState.pendingRoutine = "Strength".equals(setupSport.type) && setupRoutineId != null ? setupRoutineId : "";
        WorkoutState.workoutGear = chosenGearId();
        WorkoutState.miles = WatchPrefs.miles(this);
        WatchPrefs.setIntervalId(this, setupPresetId);
        WorkoutState.setIntervals(setupGoalType == WorkoutState.GOAL_INTERVALS ? WatchIntervals.find(setupPresetId) : null);
        WorkoutState.targetPaceSecPerKm = setupSport.hasDistance() ? WatchPrefs.targetPace(this) : 0;
        WorkoutState.targetZone = WatchPrefs.targetZone(this);
        double v = setupGoalType == WorkoutState.GOAL_DISTANCE ? setupValue * WorkoutState.unitM()
            : setupGoalType == WorkoutState.GOAL_TIME ? setupValue * 60_000.0
            : setupValue;
        WorkoutState.setGoal(setupGoalType == WorkoutState.GOAL_INTERVALS ? WorkoutState.GOAL_NONE : setupGoalType, setupGoalType == WorkoutState.GOAL_INTERVALS ? 0 : v);
        if (!hasSensorPermission()) {
            pendingType = setupSport.type;
            pendingFromSetup = true;
            requestPermissions();
            return;
        }
        beginCountdown();
    }

    private final Runnable countdownTick = new Runnable() {
        @Override
        public void run() {
            countdownLeft--;
            if (countdownLeft > 0) {
                countdownText.setText(String.valueOf(countdownLeft));
                Haptics.tick(MainActivity.this);
                ui.postDelayed(this, 1000);
            } else {
                countdownText.setText("GO");
                Haptics.lap(MainActivity.this);
                startingAt = System.currentTimeMillis();
                WorkoutState.summary = null;
                WorkoutService.start(MainActivity.this, setupSport.type);
                render();
            }
        }
    };

    private void beginCountdown() {
        countdownLeft = 3;
        startingAt = 0;
        countdownText.setText("3");
        nav = Screen.COUNTDOWN;
        Haptics.tick(this);
        ui.removeCallbacks(countdownTick);
        ui.postDelayed(countdownTick, 1000);
        render();
    }

    private void cancelCountdown() {
        ui.removeCallbacks(countdownTick);
        countdownLeft = 0;
        startingAt = 0;
        if (!WorkoutService.running) WorkoutState.clearGoal();
        nav = Screen.SETUP;
        render();
    }

    // ---------------------------------------------------------------- settings

    private View buildSettings() {
        settingsList = column();
        settingsScroll = scroller(settingsList, 34, 60);
        settingsScroll.setVisibility(View.GONE);
        return settingsScroll;
    }

    private void renderSettings() {
        settingsList.removeAllViews();
        settingsList.addView(Ui.num(this, "SETTINGS", 22, Ui.INK));
        addToggle("Auto-pause", "Pause when you stop moving", "autoPause", WatchPrefs.autoPause(this));
        addToggle("Auto-lap", "A lap every km or mile", "autoLap", WatchPrefs.autoLap(this));
        LinearLayout warnRow = row(R.drawable.ic_bolt, Ui.ORANGE, WatchPrefs.stepWarnSec(this) > 0 ? "Step warning: " + WatchPrefs.stepWarnSec(this) + " s" : "Step warning: off");
        warnRow.setOnClickListener(v -> {
            int[] choices = {0, 5, 10, 15, 20, 30};
            int cur = WatchPrefs.stepWarnSec(this);
            int next = choices[0];
            for (int i = 0; i < choices.length; i++) if (choices[i] == cur) next = choices[(i + 1) % choices.length];
            WatchPrefs.setStepWarnSec(this, next);
            renderSettings();
        });
        settingsList.addView(warnRow);
        addToggle("Step countdown", "Tick the last 3 seconds of a step", "stepCountdown", WatchPrefs.stepCountdown(this));
        addToggle("Lap haptics", "Vibrate on each lap", "lapHaptics", WatchPrefs.lapHaptics(this));
        addToggle("Zone alerts", "Vibrate in or out of zone 5", "zoneAlerts", WatchPrefs.zoneAlerts(this));
        addToggle("Always-on screen", "Dim screen stays on in workouts. Off saves battery: raise your wrist to wake", "alwaysOn", WatchPrefs.alwaysOnWorkout(this));
        if (WatchCaps.repCounting(this)) addToggle("Count reps", "Counts strength reps from wrist movement", "autoReps", WatchPrefs.autoReps(this));
        addToggle("Fasting", "Fast timer, tile and complication. Off saves battery", "fasting", WatchPrefs.fasting(this));
        addToggle("Water nudges", "A buzz when water is well behind the day", "nudgeWater", WatchPrefs.nudgeWater(this));
        addToggle("Meal nudges", "A buzz at meal times when nothing is logged", "nudgeMeal", WatchPrefs.nudgeMeal(this));
        addToggle("All-day tracking", "Heart rate, activity and sleep for the app", "allDay", WatchPrefs.allDay(this));
        addToggle("Suggest workouts", "Offer to record a run or ride", "detect", WatchPrefs.detect(this));
        if (WatchPrefs.detect(this)) addToggle("Suggest walks too", "After about 12 minutes of walking", "detectWalks", WatchPrefs.detectWalks(this));

        LinearLayout units = row(R.drawable.ic_cardio, Ui.BLUE, WatchPrefs.miles(this) ? "Units: miles" : "Units: kilometers");
        units.setOnClickListener(v -> {
            WatchPrefs.setMiles(this, !WatchPrefs.miles(this));
            renderSettings();
        });
        settingsList.addView(units);

        LinearLayout back = row(R.drawable.ic_check, Ui.ACCENT, "Done");
        back.setOnClickListener(v -> {
            nav = Screen.HOME;
            render();
        });
        back.setLayoutParams(match(14));
        settingsList.addView(back);
    }

    private boolean prefValue(String key) {
        switch (key) {
            case "autoPause": return WatchPrefs.autoPause(this);
            case "autoLap": return WatchPrefs.autoLap(this);
            case "lapHaptics": return WatchPrefs.lapHaptics(this);
            case "allDay": return WatchPrefs.allDay(this);
            case "fasting": return WatchPrefs.fasting(this);
            case "nudgeWater": return WatchPrefs.nudgeWater(this);
            case "nudgeMeal": return WatchPrefs.nudgeMeal(this);
            case "detect": return WatchPrefs.detect(this);
            case "detectWalks": return WatchPrefs.detectWalks(this);
            case "autoReps": return WatchPrefs.autoReps(this);
            case "alwaysOn": return WatchPrefs.alwaysOnWorkout(this);
            case "stepCountdown": return WatchPrefs.stepCountdown(this);
            default: return WatchPrefs.zoneAlerts(this);
        }
    }

    private void addToggle(String title, String sub, final String key, boolean on) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setBackground(Ui.glass(this, 24));
        r.setPadding(dp(14), dp(8), dp(14), dp(8));
        r.setMinimumHeight(dp(52));
        r.setLayoutParams(match(7));
        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        TextView head = Ui.text(this, title, 14, Ui.INK, false);
        head.setGravity(Gravity.START);
        TextView s = Ui.text(this, sub, 10, Ui.MUTED, false);
        s.setGravity(Gravity.START);
        text.addView(head);
        text.addView(s);
        r.addView(text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView state = Ui.text(this, on ? "On" : "Off", 12, on ? BLACK : Ui.MUTED, true);
        state.setBackground(on ? Ui.solid(this, Ui.ACCENT, 14) : Ui.glass(this, 14));
        state.setPadding(dp(10), dp(4), dp(10), dp(4));
        r.addView(state);
        r.setOnClickListener(v -> {
            WatchPrefs.set(this, key, !prefValue(key));
            if ("alwaysOn".equals(key)) {
                // Whether the app counts as an always-on app is decided when the screen is built, so rebuild it and return to this page.
                getIntent().putExtra(EXTRA_REOPEN_SETTINGS, true);
                recreate();
                return;
            }
            if ("allDay".equals(key)) {
                WatchSteps.register(this);
                if (WatchPrefs.allDay(this)) askBackgroundSensors(true);
            }
            if ("detect".equals(key) || "detectWalks".equals(key)) WatchDetect.configure(this);
            if ("nudgeWater".equals(key) || "nudgeMeal".equals(key)) {
                // Notifications need permission on Wear OS 4 and later; the nudges start (or stop) at once.
                if (android.os.Build.VERSION.SDK_INT >= 33 && (WatchPrefs.nudgeWater(this) || WatchPrefs.nudgeMeal(this))
                    && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 4130);
                }
                NudgeReceiver.schedule(this);
            }
            if ("fasting".equals(key)) {
                // The complication and the tile show the change at once: the fast timer is gone, or back.
                GlanceComplicationService.request(this, FastingComplicationService.class);
                try {
                    androidx.wear.tiles.TileService.getUpdater(this).requestUpdate(KyFuelTileService.class);
                } catch (RuntimeException ignored) {
                    // the tile is not on the watch
                }
            }
            renderSettings();
        });
        settingsList.addView(r);
    }

    // ---------------------------------------------------------------- workout pager

    private View buildPager() {
        pagerFrame = new FrameLayout(this);
        pager = new ViewPager2(this);
        View metrics = buildMetricsPage();
        View controls = buildControlsPage();
        View music = buildMusicPage();
        pagesPlain = new View[] {metrics, controls, music, buildZonesPage(), buildLapsPage()};
        pagesStrength = new View[] {buildStrengthSetPage(), buildStrengthListPage(), metrics, controls, music};
        pages = pagesPlain;
        pager.setAdapter(new RecyclerView.Adapter<RecyclerView.ViewHolder>() {
            @NonNull
            @Override
            public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
                FrameLayout f = new FrameLayout(parent.getContext());
                f.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                return new RecyclerView.ViewHolder(f) {};
            }

            @Override
            public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
                FrameLayout f = (FrameLayout) holder.itemView;
                f.removeAllViews();
                View page = pages[position];
                if (page.getParent() instanceof ViewGroup) ((ViewGroup) page.getParent()).removeView(page);
                f.addView(page, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }

            @Override
            public int getItemCount() {
                return pages.length;
            }
        });
        pager.setOffscreenPageLimit(pages.length);
        pager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback() {
            @Override
            public void onPageSelected(int position) {
                updateDots(position);
            }
        });
        pagerFrame.addView(pager, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        dots = Ui.text(this, "", 9, Ui.MUTED, false);
        FrameLayout.LayoutParams dotLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        dotLp.bottomMargin = dp(14);
        pagerFrame.addView(dots, dotLp);
        updateDots(0);
        pagerFrame.setVisibility(View.GONE);
        return pagerFrame;
    }

    private void updateDots(int position) {
        StringBuilder sb = new StringBuilder();
        int n = pages == null ? 4 : pages.length;
        for (int i = 0; i < n; i++) sb.append(i == position ? "●" : "○").append(i < n - 1 ? " " : "");
        dots.setText(sb.toString());
    }

    private FrameLayout pageFrame(LinearLayout content) {
        FrameLayout f = new FrameLayout(this);
        content.setPadding(dp(24), dp(28), dp(24), dp(34));
        f.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return f;
    }

    private View buildMetricsPage() {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER);
        p0Type = Ui.text(this, "", 11, Ui.ACCENT, true);
        p0Type.setLetterSpacing(0.14f);
        p0Banner = Ui.text(this, "", 12, Ui.YELLOW, true);
        p0Banner.setVisibility(View.GONE);
        p0Main = Ui.num(this, "0.00", 62, Ui.INK);
        p0MainCap = Ui.text(this, "KM", 11, Ui.MUTED, true);
        p0MainCap.setLetterSpacing(0.16f);
        // Steps, as big as the distance, for the sports where you take them.
        p0Steps = Ui.num(this, "0", 62, Ui.INK);
        p0StepsCap = Ui.text(this, "STEPS", 11, Ui.MUTED, true);
        p0StepsCap.setLetterSpacing(0.16f);

        goalTrack = new FrameLayout(this);
        goalTrack.setBackground(Ui.solid(this, Ui.EDGE, 4));
        goalFill = new View(this);
        goalFill.setBackground(Ui.solid(this, Ui.ACCENT, 4));
        goalTrack.addView(goalFill, new FrameLayout.LayoutParams(dp(2), dp(6)));
        goalTrack.setVisibility(View.GONE);
        p0GoalText = Ui.text(this, "", 10, Ui.MUTED, true);
        p0GoalText.setVisibility(View.GONE);
        p0Sub = Ui.text(this, "", 12, Ui.MUTED, true);

        p0Hr = Ui.num(this, "--", 26, Ui.RED);
        p0Zone = Ui.text(this, "", 9, Ui.MUTED, true);
        p0ValueA = Ui.num(this, "--", 26, Ui.INK);
        p0CaptionA = Ui.text(this, "", 9, Ui.MUTED, true);

        c.addView(p0Type);
        c.addView(p0Banner);
        LinearLayout distCol = column();
        distCol.setGravity(Gravity.CENTER_HORIZONTAL);
        distCol.addView(p0Main);
        distCol.addView(p0MainCap);
        stepsCol = column();
        stepsCol.setGravity(Gravity.CENTER_HORIZONTAL);
        stepsCol.addView(p0Steps);
        stepsCol.addView(p0StepsCap);
        stepsCol.setVisibility(View.GONE);
        LinearLayout mainRow = new LinearLayout(this);
        mainRow.setOrientation(LinearLayout.HORIZONTAL);
        mainRow.setGravity(Gravity.CENTER);
        mainRow.addView(distCol, weight(1f));
        mainRow.addView(stepsCol, weight(1f));
        c.addView(mainRow, match(2));
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(dp(150), dp(6));
        gp.topMargin = dp(8);
        c.addView(goalTrack, gp);
        c.addView(p0GoalText, match(3));
        c.addView(p0Sub, match(4));

        LinearLayout cells = new LinearLayout(this);
        cells.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout a = glassCell(p0ValueA, p0CaptionA);
        LinearLayout b = glassCell(p0Hr, p0Zone);
        LinearLayout.LayoutParams ap = weight(1f);
        ap.rightMargin = dp(4);
        LinearLayout.LayoutParams bp = weight(1f);
        bp.leftMargin = dp(4);
        cells.addView(a, ap);
        cells.addView(b, bp);
        c.addView(cells, match(8));

        TextView more = Ui.text(this, "SCROLL FOR MORE", 9, Ui.MUTED, true);
        more.setLetterSpacing(0.14f);
        more.setPadding(0, dp(8), 0, dp(4));
        c.addView(more);

        // Every other stat, two to a row. They are filled in by renderMetrics.
        xTime = Ui.num(this, "--", 22, Ui.INK);
        xDist = Ui.num(this, "--", 22, Ui.INK);
        xDistCap = Ui.text(this, "DISTANCE", 9, Ui.MUTED, true);
        xAvgPace = Ui.num(this, "--", 22, Ui.INK);
        xAvgPaceCap = Ui.text(this, "AVG PACE", 9, Ui.MUTED, true);
        xKcal = Ui.num(this, "--", 22, Ui.INK);
        xAvgHr = Ui.num(this, "--", 22, Ui.RED);
        xMaxHr = Ui.num(this, "--", 22, Ui.RED);
        xClimb = Ui.num(this, "--", 22, Ui.INK);
        xClimbCap = Ui.text(this, "CLIMB", 9, Ui.MUTED, true);
        xLaps = Ui.num(this, "0", 22, Ui.INK);
        xLastLap = Ui.text(this, "LAPS", 9, Ui.MUTED, true);
        c.addView(statPair(xTime, Ui.text(this, "TIME", 9, Ui.MUTED, true), xDist, xDistCap), match(4));
        c.addView(statPair(xAvgPace, xAvgPaceCap, xKcal, Ui.text(this, "KCAL", 9, Ui.MUTED, true)), match(6));
        c.addView(statPair(xAvgHr, Ui.text(this, "AVG BPM", 9, Ui.MUTED, true), xMaxHr, Ui.text(this, "MAX BPM", 9, Ui.MUTED, true)), match(6));
        c.addView(statPair(xClimb, xClimbCap, xLaps, xLastLap), match(6));

        // A scrolling page: the crown and a swipe up or down move it, a swipe sideways still changes page.
        p0Scroll = scroller(c, 28, 40);
        p0Scroll.setFillViewport(true);
        return p0Scroll;
    }

    /** Two stat cells side by side. */
    private LinearLayout statPair(TextView v1, TextView c1, TextView v2, TextView c2) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams a = weight(1f);
        a.rightMargin = dp(4);
        LinearLayout.LayoutParams b = weight(1f);
        b.leftMargin = dp(4);
        r.addView(glassCell(v1, c1), a);
        r.addView(glassCell(v2, c2), b);
        return r;
    }

    private View buildControlsPage() {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER);
        TextView ctl = Ui.text(this, "CONTROLS", 10, Ui.MUTED, true);
        ctl.setLetterSpacing(0.16f);
        c.addView(ctl);

        TextView[] lbl = new TextView[1];
        ImageView[] ico = new ImageView[1];
        LinearLayout pause = actionButton(R.drawable.ic_pause, "Pause", Ui.ACCENT, lbl, ico);
        pause.setBackground(Ui.solid(this, Ui.ACCENT, 26));
        ico[0].setColorFilter(BLACK);
        lbl[0].setTextColor(BLACK);
        pauseLabel = lbl[0];
        pauseIcon = ico[0];
        pause.setOnClickListener(v -> {
            WorkoutService.setPausedByUser(this, !WorkoutState.paused);
            render();
        });
        TextView[] lbl2 = new TextView[1];
        LinearLayout lap = actionButton(R.drawable.ic_lap, "Lap", Ui.YELLOW, lbl2, null);
        lapCount = lbl2[0];
        lap.setOnClickListener(v -> {
            WorkoutService.addLap(this, false);
            render();
        });
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams pp = weight(1f);
        pp.rightMargin = dp(5);
        LinearLayout.LayoutParams lp = weight(1f);
        lp.leftMargin = dp(5);
        top.addView(pause, pp);
        top.addView(lap, lp);
        c.addView(top, match(10));

        LinearLayout end = actionButton(R.drawable.ic_stop, "End workout", Ui.RED, null, null);
        end.setOnClickListener(v -> {
            endDialog = true;
            render();
        });
        c.addView(end, match(10));
        return pageFrame(c);
    }

    private View buildZonesPage() {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER);
        zHeader = Ui.text(this, "Heart rate zones", 13, Ui.MUTED, false);
        c.addView(zHeader);
        for (int i = 4; i >= 0; i--) {
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            r.setGravity(Gravity.CENTER_VERTICAL);
            r.setPadding(dp(8), dp(3), dp(8), dp(3));
            r.addView(Ui.text(this, "Z" + (i + 1), 11, Ui.INK, true), new LinearLayout.LayoutParams(dp(24), LinearLayout.LayoutParams.WRAP_CONTENT));
            FrameLayout track = new FrameLayout(this);
            track.setBackground(Ui.glass(this, 6));
            View bar = new View(this);
            bar.setBackground(Ui.tinted(this, Ui.zoneColor(i), 6, 0xFF, 0xCC));
            track.addView(bar, new FrameLayout.LayoutParams(dp(2), dp(10)));
            LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, dp(10), 1f);
            tp.leftMargin = dp(4);
            r.addView(track, tp);
            TextView time = Ui.text(this, "0:00", 11, Ui.MUTED, false);
            time.setGravity(Gravity.END);
            LinearLayout.LayoutParams xp = new LinearLayout.LayoutParams(dp(40), LinearLayout.LayoutParams.WRAP_CONTENT);
            xp.leftMargin = dp(6);
            r.addView(time, xp);
            c.addView(r, match(2));
            zBars[i] = bar;
            zTimes[i] = time;
            zRows[i] = r;
        }
        zFooter = Ui.text(this, "", 12, Ui.MUTED, false);
        c.addView(zFooter, match(8));
        return pageFrame(c);
    }

    private View buildLapsPage() {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        c.addView(Ui.text(this, "Laps", 13, Ui.MUTED, false));
        lapsCurrent = Ui.text(this, "", 20, Ui.INK, true);
        c.addView(lapsCurrent, match(4));
        lapsList = column();
        c.addView(lapsList, match(8));
        return pageFrame(c);
    }

    private void renderMetrics(long now) {
        Sports.Sport sport = Sports.find(WorkoutState.type);
        long elapsed = WorkoutState.elapsedMs(now);
        String tag = WorkoutState.paused ? (WorkoutState.autoPaused ? "AUTO-PAUSED" : "PAUSED") : sport.label.toUpperCase(Locale.getDefault());
        p0Type.setText(tag);
        p0Type.setTextColor(WorkoutState.paused ? Ui.YELLOW : Ui.ACCENT);

        boolean dist = sport.hasDistance() || WorkoutState.distanceM() > 0;
        double kcal = WorkoutState.kcal > 0 ? WorkoutState.kcal : WorkoutState.phoneKcal;
        String clock = WorkoutState.clock(elapsed / 1000);
        if (dist) {
            double m = WorkoutState.distanceM();
            p0Main.setText(String.format(Locale.getDefault(), "%.2f", m / WorkoutState.unitM()));
            p0MainCap.setText(WorkoutState.unitName().toUpperCase(Locale.getDefault()));
            p0Sub.setText(clock + (kcal > 0 ? "   " + Math.round(kcal) + " kcal" : ""));
            if (WorkoutState.type.contains("Cycling")) {
                double v = WorkoutState.speedMs * 3.6 / (WorkoutState.miles ? WorkoutState.KM_PER_MI : 1.0);
                p0ValueA.setText(v > 0 ? String.format(Locale.getDefault(), "%.1f", v) : "--");
                p0CaptionA.setText(WorkoutState.miles ? "MPH" : "KM/H");
            } else {
                String pace = WorkoutState.currentPace();
                if ("--:--".equals(pace)) pace = WorkoutState.averagePace(elapsed);
                p0ValueA.setText(pace);
                p0CaptionA.setText("PACE /" + WorkoutState.unitName().toUpperCase(Locale.getDefault()));
            }
        } else {
            p0Main.setText(clock);
            p0MainCap.setText("TIME");
            p0Sub.setText(kcal > 0 ? Math.round(kcal) + " kcal" : "");
            int avg = WorkoutState.hrCount > 0 ? (int) (WorkoutState.hrSum / WorkoutState.hrCount) : 0;
            p0ValueA.setText(avg > 0 ? String.valueOf(avg) : "--");
            p0CaptionA.setText("AVG BPM");
        }
        p0Main.setTextColor(WorkoutState.paused ? Ui.YELLOW : Ui.INK);
        // Steps beside the distance, the same size, for walking, running, hiking and the like (and any sport that reports some).
        boolean showSteps = sport.takesSteps() || WorkoutState.stepCount > 0;
        stepsCol.setVisibility(showSteps ? View.VISIBLE : View.GONE);
        p0Steps.setText(String.format(Locale.getDefault(), "%,d", WorkoutState.stepCount));
        p0Steps.setTextColor(WorkoutState.paused ? Ui.YELLOW : Ui.INK);
        // With two numbers across, each is a little smaller and shrinks to fit; alone, the distance stays big.
        int maxSp = showSteps ? 40 : 62;
        p0Main.setAutoSizeTextTypeUniformWithConfiguration(16, maxSp, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        p0Steps.setAutoSizeTextTypeUniformWithConfiguration(16, maxSp, 1, android.util.TypedValue.COMPLEX_UNIT_SP);

        int bpm = WorkoutState.bpm;
        int zone = WorkoutState.zoneOf(bpm);
        int color = zone == 0 ? Ui.MUTED : Ui.zoneColor(zone - 1);
        p0Hr.setText(bpm > 0 ? String.valueOf(bpm) : "--");
        p0Hr.setTextColor(zone == 0 ? Ui.INK : color);
        p0Zone.setText(bpm > 0 ? WorkoutState.zoneLabel(bpm).toUpperCase(Locale.getDefault()) : "BPM");
        p0Zone.setTextColor(bpm > 0 ? color : Ui.MUTED);

        double progress = WorkoutState.goalProgress(now);
        boolean hasGoal = progress >= 0;
        goalTrack.setVisibility(hasGoal ? View.VISIBLE : View.GONE);
        p0GoalText.setVisibility(hasGoal ? View.VISIBLE : View.GONE);
        if (hasGoal) {
            int trackWidth = goalTrack.getWidth();
            ViewGroup.LayoutParams lp = goalFill.getLayoutParams();
            lp.width = Math.max(dp(2), (int) (trackWidth * Math.min(1.0, progress)));
            goalFill.setLayoutParams(lp);
            p0GoalText.setText(progress >= 1.0
                ? "GOAL REACHED  -  " + WorkoutState.goalLabel()
                : Math.round(progress * 100) + "%  OF  " + WorkoutState.goalLabel());
            p0GoalText.setTextColor(progress >= 1.0 ? Ui.ACCENT : Ui.MUTED);
        }

        // An interval workout shows its current step and how far through it you are, in place of the goal bar.
        boolean phoneSteps = WorkoutState.linkedToPhone && WorkoutState.phoneStepCount > 0;
        WatchIntervals.Step[] steps = WorkoutState.steps;
        if (phoneSteps) {
            String kind = WorkoutState.phoneStepKind;
            double fraction = WorkoutState.phoneStepFraction;
            String left = WorkoutState.phoneStepLeft;
            if (WorkoutState.phoneStepEndsAt > 0 && !WorkoutState.paused && WorkoutState.phoneStepDurMs > 0) {
                long remaining = Math.max(0, WorkoutState.phoneStepEndsAt - now);
                left = WorkoutState.clock(remaining / 1000);
                fraction = 1.0 - remaining / (double) WorkoutState.phoneStepDurMs;
            }
            int stepColor = WorkoutState.phoneStepsDone || "work".equals(kind) ? Ui.ACCENT : "recover".equals(kind) ? Ui.BLUE : Ui.ORANGE;
            goalTrack.setVisibility(View.VISIBLE);
            p0GoalText.setVisibility(View.VISIBLE);
            ViewGroup.LayoutParams lp3 = goalFill.getLayoutParams();
            lp3.width = Math.max(dp(2), (int) (goalTrack.getWidth() * Math.min(1.0, Math.max(0.0, fraction))));
            goalFill.setLayoutParams(lp3);
            goalFill.setBackground(Ui.solid(this, stepColor, 4));
            p0GoalText.setText(WorkoutState.phoneStepsDone
                ? "WORKOUT COMPLETE"
                : (WorkoutState.phoneStepLabel.toUpperCase(Locale.getDefault()) + "  -  " + left + "  -  " + (WorkoutState.phoneStepIndex + 1) + "/" + WorkoutState.phoneStepCount));
            p0GoalText.setTextColor(stepColor);
        } else if (steps != null && WorkoutState.stepIdx < steps.length) {
            WatchIntervals.Step st = steps[Math.min(WorkoutState.stepIdx, steps.length - 1)];
            double fraction;
            String left;
            if (st.durMs > 0) {
                long inStep = elapsed - WorkoutState.stepStartElapsedMs;
                fraction = inStep / (double) st.durMs;
                left = WorkoutState.clock(Math.max(0, st.durMs - inStep) / 1000);
            } else {
                double inStep = WorkoutState.distanceM() - WorkoutState.stepStartDistM;
                fraction = inStep / st.distM;
                left = String.format(Locale.getDefault(), "%.2f %s", Math.max(0, st.distM - inStep) / WorkoutState.unitM(), WorkoutState.unitName());
            }
            int stepColor = WorkoutState.stepsDone ? Ui.ACCENT : st.kind == WatchIntervals.WORK ? Ui.ACCENT : st.kind == WatchIntervals.RECOVER ? Ui.BLUE : Ui.ORANGE;
            goalTrack.setVisibility(View.VISIBLE);
            p0GoalText.setVisibility(View.VISIBLE);
            ViewGroup.LayoutParams lp2 = goalFill.getLayoutParams();
            lp2.width = Math.max(dp(2), (int) (goalTrack.getWidth() * Math.min(1.0, Math.max(0.0, fraction))));
            goalFill.setLayoutParams(lp2);
            goalFill.setBackground(Ui.solid(this, stepColor, 4));
            p0GoalText.setText(WorkoutState.stepsDone
                ? "WORKOUT COMPLETE"
                : (st.label.toUpperCase(Locale.getDefault()) + "  -  " + left + "  -  " + (WorkoutState.stepIdx + 1) + "/" + steps.length));
            p0GoalText.setTextColor(stepColor);
        } else {
            goalFill.setBackground(Ui.solid(this, Ui.ACCENT, 4));
        }

        // The rest of the stats, below the big numbers.
        xTime.setText(clock);
        boolean hasDist = dist && WorkoutState.distanceM() > 0;
        xDist.setText(hasDist ? String.format(Locale.getDefault(), "%.2f", WorkoutState.distanceM() / WorkoutState.unitM()) : "--");
        xDistCap.setText("DISTANCE " + WorkoutState.unitName().toUpperCase(Locale.getDefault()));
        if (WorkoutState.type.contains("Cycling")) {
            double hours = elapsed / 3_600_000.0;
            double avgSpeed = hasDist && hours > 0 ? (WorkoutState.distanceM() / WorkoutState.unitM()) / hours : 0;
            xAvgPace.setText(avgSpeed > 0 ? String.format(Locale.getDefault(), "%.1f", avgSpeed) : "--");
            xAvgPaceCap.setText(WorkoutState.miles ? "AVG MPH" : "AVG KM/H");
        } else {
            xAvgPace.setText(hasDist ? WorkoutState.averagePace(elapsed) : "--");
            xAvgPaceCap.setText("AVG PACE /" + WorkoutState.unitName().toUpperCase(Locale.getDefault()));
        }
        xKcal.setText(kcal > 0 ? String.valueOf(Math.round(kcal)) : "--");
        int avgBpm = WorkoutState.hrCount > 0 ? (int) (WorkoutState.hrSum / WorkoutState.hrCount) : 0;
        xAvgHr.setText(avgBpm > 0 ? String.valueOf(avgBpm) : "--");
        xMaxHr.setText(WorkoutState.hrMax > 0 ? String.valueOf(WorkoutState.hrMax) : "--");
        double climb = WorkoutState.elevGainM;
        xClimb.setText(climb > 0 ? String.valueOf(Math.round(WorkoutState.miles ? climb * 3.28084 : climb)) : "--");
        xClimbCap.setText(WorkoutState.miles ? "CLIMB FT" : "CLIMB M");
        int lapCount;
        long lastSplit = 0;
        synchronized (WorkoutState.laps) {
            lapCount = WorkoutState.laps.size();
            if (lapCount > 0) lastSplit = WorkoutState.laps.get(lapCount - 1).splitMs;
        }
        xLaps.setText(String.valueOf(lapCount));
        xLastLap.setText(lapCount > 0 ? "LAPS  -  LAST " + WorkoutState.clock(lastSplit / 1000) : "LAPS");

        boolean banner = now < WorkoutState.bannerUntil && !WorkoutState.banner.isEmpty();
        p0Banner.setVisibility(banner ? View.VISIBLE : View.GONE);
        if (banner) p0Banner.setText(WorkoutState.banner);
    }

    private void renderControls() {
        pauseIcon.setImageResource(WorkoutState.paused ? R.drawable.ic_play : R.drawable.ic_pause);
        pauseLabel.setText(WorkoutState.paused ? "Resume" : "Pause");
        int n;
        synchronized (WorkoutState.laps) {
            n = WorkoutState.laps.size();
        }
        lapCount.setText(n == 0 ? "Lap" : "Lap " + (n + 1));
    }

    private void renderZones() {
        long max = 1;
        for (long z : WorkoutState.zoneSec) max = Math.max(max, z);
        int current = WorkoutState.zoneOf(WorkoutState.bpm);
        zHeader.setText(current > 0 ? "Zone " + current + "  -  " + WorkoutState.bpm + " bpm" : "Heart rate zones");
        for (int i = 0; i < 5; i++) {
            long ms = WorkoutState.zoneSec[i];
            long secs = ms / 1000;
            zTimes[i].setText(String.format(Locale.getDefault(), "%d:%02d", secs / 60, secs % 60));
            ViewGroup.LayoutParams lp = zBars[i].getLayoutParams();
            int trackWidth = ((View) zBars[i].getParent()).getWidth();
            lp.width = Math.max(dp(2), (int) (trackWidth * (ms / (double) max)));
            zBars[i].setLayoutParams(lp);
            zRows[i].setBackground(i + 1 == current ? Ui.glass(this, 12) : null);
        }
        int avg = WorkoutState.hrCount > 0 ? (int) (WorkoutState.hrSum / WorkoutState.hrCount) : 0;
        zFooter.setText(avg > 0 ? "avg " + avg + "   max " + WorkoutState.hrMax + " bpm" : "Waiting for heart rate");
    }

    private void renderLaps(long now) {
        long elapsed = WorkoutState.elapsedMs(now);
        long sinceLap = elapsed - WorkoutState.lapStartElapsedMs;
        double lapDist = Math.max(0, WorkoutState.distanceM() - WorkoutState.lapStartDistanceM);
        String d = lapDist > 5 ? String.format(Locale.getDefault(), "  %.2f %s", lapDist / WorkoutState.unitM(), WorkoutState.unitName()) : "";
        lapsCurrent.setText(WorkoutState.clock(sinceLap / 1000) + d);
        List<WorkoutState.Lap> copy;
        synchronized (WorkoutState.laps) {
            copy = new ArrayList<>(WorkoutState.laps);
        }
        int n = copy.size();
        if (n != shownLapCount) {
            shownLapCount = n;
            lapsList.removeAllViews();
            if (n == 0) {
                lapsList.addView(Ui.text(this, WatchPrefs.autoLap(this) ? "A lap is added every " + WorkoutState.unitName() : "Tap Lap on the Controls page", 11, Ui.MUTED, false));
            }
            for (int i = n - 1; i >= Math.max(0, n - 4); i--) {
                WorkoutState.Lap l = copy.get(i);
                String pace = l.distanceM > 20 ? WorkoutState.formatPace((l.splitMs / 1000.0) / (l.distanceM / WorkoutState.unitM())) : "";
                TextView t = Ui.text(this,
                    l.n + "   " + WorkoutState.clock(l.splitMs / 1000) + (pace.isEmpty() ? "" : "   " + pace) + (l.avgHr > 0 ? "   " + l.avgHr : ""),
                    12, Ui.INK, false);
                t.setGravity(Gravity.START);
                t.setBackground(Ui.glass(this, 14));
                t.setPadding(dp(12), dp(6), dp(12), dp(6));
                t.setLayoutParams(match(4));
                lapsList.addView(t);
            }
        }
    }

    // ---------------------------------------------------------------- strength (set by set, run from the phone's logger)

    /** The plain pages are used until the phone sends a strength session; then the set page and the exercise list lead. */
    private void syncPagesForStrength() {
        boolean want = WorkoutState.strength != null && "Strength".equals(WorkoutState.type);
        if (want == strengthPagesShown) return;
        strengthPagesShown = want;
        pages = want ? pagesStrength : pagesPlain;
        pager.getAdapter().notifyDataSetChanged();
        pager.setCurrentItem(0, false);
        updateDots(0);
        stListKey = "";
        stDoneShown = -1;
    }

    private String weightText(double w) {
        return w == Math.rint(w) ? String.format(Locale.getDefault(), "%d", (long) w) : String.format(Locale.getDefault(), "%.1f", w);
    }

    /** A button press on the strength screen: shown at once here, applied by the phone, and the phone answers with the real state. */
    private void strengthSend(String action, int delta, int index) {
        // Next on the last exercise of a session run here opens the picker, so there is something real to add (a blank one only if the
        // phone has never sent its exercise list).
        if ("next".equals(action) && LocalStrength.active != null && LocalStrength.onLastExercise() && ExerciseLibStore.available(this)) {
            openPicker();
            return;
        }
        // Moving on or ticking a set starts the next count from nothing.
        if ("done".equals(action) || "next".equals(action) || "prev".equals(action) || "jump".equals(action) || "skiprest".equals(action)) WorkoutState.autoReps = 0;
        if (LocalStrength.active != null) {
            LocalStrength.apply(action, delta, index);
        } else {
            WorkoutState.localAdjust(action, delta);
            PhoneLink.sendSet(this, action, delta, index);
            watchPhoneAnswer(action, delta, index);
        }
        renderStrengthSet(System.currentTimeMillis());
    }

    /** Buttons pressed since the phone last sent a strength state, and the state version they were pressed against. */
    private final List<int[]> unanswered = new ArrayList<>();
    private final List<String> unansweredAction = new ArrayList<>();
    private int answeredVersion = -1;

    /**
     * The phone applies each button and answers with the new state. When it does not answer (it is asleep, or its page is not running),
     * the watch takes the session over so the buttons keep working: it carries on from what it was showing.
     */
    private void watchPhoneAnswer(String action, int delta, int index) {
        if (answeredVersion != WorkoutState.strengthVersion) {
            answeredVersion = WorkoutState.strengthVersion;
            unanswered.clear();
            unansweredAction.clear();
        }
        unansweredAction.add(action);
        unanswered.add(new int[] {delta, index});
        final int version = WorkoutState.strengthVersion;
        ui.postDelayed(() -> {
            if (version != WorkoutState.strengthVersion || LocalStrength.active != null || WorkoutState.strength == null) return;
            if (!LocalStrength.adopt(this, WorkoutState.strength)) return;
            // The buttons the watch could not show by itself are applied now, in the order they were pressed.
            for (int i = 0; i < unansweredAction.size(); i++) {
                String a = unansweredAction.get(i);
                if ("next".equals(a) || "prev".equals(a) || "jump".equals(a) || "addset".equals(a) || "delset".equals(a)) {
                    LocalStrength.apply(a, unanswered.get(i)[0], unanswered.get(i)[1]);
                }
            }
            unanswered.clear();
            unansweredAction.clear();
            stListKey = "";
            renderStrengthSet(System.currentTimeMillis());
            Toast.makeText(this, "Phone not answering: running on the watch", Toast.LENGTH_SHORT).show();
        }, 2500);
    }

    private LinearLayout stepperRow(TextView[] valueOut, TextView[] unitOut, String unit, View.OnClickListener minus, View.OnClickListener plus) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.addView(roundButton("−", minus));
        LinearLayout mid = column();
        mid.setGravity(Gravity.CENTER);
        TextView v = Ui.num(this, "0", 30, Ui.INK);
        TextView u = Ui.text(this, unit, 9, Ui.MUTED, true);
        u.setLetterSpacing(0.14f);
        mid.addView(v);
        mid.addView(u);
        r.addView(mid, weight(1f));
        r.addView(roundButton("+", plus));
        valueOut[0] = v;
        unitOut[0] = u;
        return r;
    }

    private View buildStrengthSetPage() {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        stHeader = Ui.text(this, "", 10, Ui.ACCENT, true);
        stHeader.setLetterSpacing(0.12f);
        c.addView(stHeader);
        stName = Ui.text(this, "", 15, Ui.INK, true);
        stName.setMaxLines(2);
        stName.setEllipsize(TextUtils.TruncateAt.END);
        c.addView(stName, match(2));
        stSetLine = Ui.text(this, "", 11, Ui.MUTED, true);
        c.addView(stSetLine, match(1));

        // Rest: a countdown with -15 s, Skip and +15 s. Shown only while resting.
        stRestBox = column();
        stRestBox.setGravity(Gravity.CENTER);
        stRestBox.setBackground(Ui.tinted(this, Ui.ACCENT, 20, 0x55, 0x22));
        stRestBox.setPadding(dp(8), dp(6), dp(8), dp(8));
        TextView restCap = Ui.text(this, "REST", 9, Ui.MUTED, true);
        restCap.setLetterSpacing(0.16f);
        stRestBox.addView(restCap);
        stRestClock = Ui.num(this, "0:00", 34, Ui.ACCENT);
        stRestBox.addView(stRestClock);
        LinearLayout restBtns = new LinearLayout(this);
        restBtns.setOrientation(LinearLayout.HORIZONTAL);
        String[] labels = {"−15s", "Skip", "+15s"};
        for (int i = 0; i < 3; i++) {
            final int k = i;
            TextView b = chip(labels[i], false, v -> {
                if (k == 0) strengthSend("rest", -15, 0);
                else if (k == 1) strengthSend("skiprest", 0, 0);
                else strengthSend("rest", 15, 0);
            });
            b.setPadding(dp(4), dp(7), dp(4), dp(7));
            LinearLayout.LayoutParams lp = weight(1f);
            lp.leftMargin = dp(2);
            lp.rightMargin = dp(2);
            restBtns.addView(b, lp);
        }
        stRestBox.addView(restBtns, match(4));
        stRestBox.setVisibility(View.GONE);
        c.addView(stRestBox, match(6));

        // Weight and reps for this set, each with minus and plus.
        TextView[] wv = new TextView[1];
        TextView[] wu = new TextView[1];
        c.addView(stepperRow(wv, wu, "KG", v -> strengthSend("weight", -1, 0), v -> strengthSend("weight", 1, 0)), match(8));
        stWeightVal = wv[0];
        stWeightUnit = wu[0];
        TextView[] rv = new TextView[1];
        TextView[] ru = new TextView[1];
        c.addView(stepperRow(rv, ru, "REPS", v -> strengthSend("reps", -1, 0), v -> strengthSend("reps", 1, 0)), match(4));
        stRepsVal = rv[0];
        stAuto = Ui.text(this, "", 10, Ui.ACCENT, true);
        stAuto.setVisibility(View.GONE);
        stAuto.setOnClickListener(v -> {
            WorkoutState.Strength cur = WorkoutState.strength;
            if (cur == null || WorkoutState.autoReps <= 0) return;
            int delta = WorkoutState.autoReps - (int) Math.round(cur.reps);
            if (delta != 0) strengthSend("reps", delta, 0);
            renderStrengthSet(System.currentTimeMillis());
        });
        c.addView(stAuto, match(2));

        // The big button: tick the set off (starts the rest), tap again to undo.
        stDoneBtn = new LinearLayout(this);
        stDoneBtn.setGravity(Gravity.CENTER);
        stDoneBtn.setMinimumHeight(dp(54));
        stDoneLabel = Ui.num(this, "DONE SET", 22, BLACK);
        stDoneBtn.addView(stDoneLabel);
        stDoneBtn.setOnClickListener(v -> {
            Haptics.lap(this);
            WorkoutState.Strength cur = WorkoutState.strength;
            // With rep counting on, the reps the watch counted become this set's reps (unless the set is being un-ticked).
            if (cur != null && !cur.done && countingReps() && WorkoutState.autoReps > 0) {
                int delta = WorkoutState.autoReps - (int) Math.round(cur.reps);
                if (delta != 0) strengthSend("reps", delta, 0);
            }
            strengthSend("done", 0, 0);
        });
        c.addView(stDoneBtn, match(8));

        // Add or remove a set, and move between exercises.
        LinearLayout setRow = new LinearLayout(this);
        setRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams a1 = weight(1f);
        a1.rightMargin = dp(3);
        setRow.addView(chip("+ Set", false, v -> strengthSend("addset", 0, 0)), a1);
        LinearLayout.LayoutParams a2 = weight(1f);
        a2.leftMargin = dp(3);
        setRow.addView(chip("− Set", false, v -> strengthSend("delset", 0, 0)), a2);
        c.addView(setRow, match(8));

        LinearLayout navRow = new LinearLayout(this);
        navRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams b1 = weight(1f);
        b1.rightMargin = dp(3);
        navRow.addView(chip("‹ Prev", false, v -> strengthSend("prev", 0, 0)), b1);
        LinearLayout.LayoutParams b2 = weight(1f);
        b2.leftMargin = dp(3);
        navRow.addView(chip("Next ›", false, v -> strengthSend("next", 0, 0)), b2);
        c.addView(navRow, match(6));

        stNext = Ui.text(this, "", 10, Ui.MUTED, false);
        stNext.setMaxLines(2);
        stNext.setEllipsize(TextUtils.TruncateAt.END);
        c.addView(stNext, match(8));

        stSetScroll = scroller(c, 30, 46);
        return stSetScroll;
    }

    private View buildStrengthListPage() {
        stListBox = column();
        stListScroll = scroller(stListBox, 30, 46);
        return stListScroll;
    }

    private void renderStrengthSet(long now) {
        WorkoutState.Strength s = WorkoutState.strength;
        if (s == null || stHeader == null) return;
        stHeader.setText(String.format(Locale.getDefault(), "EXERCISE %d / %d", s.ex + 1, Math.max(1, s.exCount)));
        stName.setText(s.name);
        stSetLine.setText(String.format(Locale.getDefault(), "SET %d OF %d%s", s.setIdx + 1, Math.max(1, s.setCount), s.done ? "  ✓" : ""));
        stWeightVal.setText(weightText(s.weight));
        stWeightUnit.setText(s.unit.toUpperCase(Locale.getDefault()));
        stRepsVal.setText(String.valueOf(Math.round(s.reps)));
        if (countingReps()) {
            stAuto.setVisibility(View.VISIBLE);
            stAuto.setText(WorkoutState.autoReps > 0 ? "Counted " + WorkoutState.autoReps + " - tap to use" : "Counting your reps...");
        } else {
            stAuto.setVisibility(View.GONE);
        }
        long left = s.restEndsAt - now;
        boolean resting = s.restEndsAt > 0 && left > 0;
        stRestBox.setVisibility(resting ? View.VISIBLE : View.GONE);
        if (resting) stRestClock.setText(WorkoutState.clock((left + 999) / 1000));
        int shown = s.done ? 1 : 0;
        if (shown != stDoneShown) {
            stDoneShown = shown;
            stDoneBtn.setBackground(s.done ? Ui.glass(this, 28) : Ui.solid(this, Ui.ACCENT, 28));
            stDoneLabel.setTextColor(s.done ? Ui.INK : BLACK);
            stDoneLabel.setText(s.done ? "UNDO SET" : "DONE SET");
        }
        stNext.setText(s.next.isEmpty()
            ? "Last exercise  -  " + s.doneSets + " sets done" + (s.volume.isEmpty() ? "" : "  -  " + s.volume)
            : "Next: " + s.next);
    }

    private void renderStrengthList() {
        WorkoutState.Strength s = WorkoutState.strength;
        if (s == null || stListBox == null) return;
        StringBuilder key = new StringBuilder().append(s.ex).append('|').append(s.volume).append(ExerciseLibStore.available(this) ? "|lib" : "");
        for (int i = 0; i < s.exNames.length; i++) key.append('|').append(s.exNames[i]).append(':').append(s.exDone[i]).append('/').append(s.exTotal[i]);
        String k = key.toString();
        if (k.equals(stListKey)) return;
        stListKey = k;
        stListBox.removeAllViews();
        stListBox.addView(Ui.num(this, "EXERCISES", 22, Ui.INK));
        TextView sub = Ui.text(this, s.doneSets + " sets done" + (s.volume.isEmpty() ? "" : "  -  " + s.volume), 10, Ui.MUTED, false);
        sub.setPadding(0, dp(2), 0, dp(6));
        stListBox.addView(sub);
        for (int i = 0; i < s.exNames.length; i++) {
            final int idx = i;
            boolean current = i == s.ex;
            boolean complete = s.exTotal[i] > 0 && s.exDone[i] >= s.exTotal[i];
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            r.setGravity(Gravity.CENTER_VERTICAL);
            r.setBackground(current ? Ui.tinted(this, Ui.ACCENT, 20, 0x55, 0x22) : Ui.glass(this, 20));
            r.setPadding(dp(12), dp(9), dp(12), dp(9));
            TextView n = Ui.text(this, s.exNames[i], 13, complete ? Ui.MUTED : Ui.INK, true);
            n.setGravity(Gravity.START);
            n.setMaxLines(2);
            n.setEllipsize(TextUtils.TruncateAt.END);
            r.addView(n, weight(1f));
            TextView c = Ui.text(this, complete ? "✓" : s.exDone[i] + "/" + s.exTotal[i], 12, complete ? Ui.ACCENT : Ui.MUTED, true);
            c.setPadding(dp(8), 0, 0, 0);
            r.addView(c);
            r.setOnClickListener(v -> {
                strengthSend("jump", 0, idx);
                pager.setCurrentItem(0, true);
            });
            stListBox.addView(r, match(5));
        }
        if (ExerciseLibStore.available(this)) {
            LinearLayout add = row(R.drawable.ic_plus, Ui.ACCENT, "Add exercise");
            add.setOnClickListener(v -> openPicker());
            add.setLayoutParams(match(8));
            stListBox.addView(add);
        }
    }

    /** The gear id to count this workout toward: what was tapped, else the phone's choice, else none offered. */
    private String chosenGearId() {
        String kind = Sports.gearKind(setupSport.type);
        if (kind.isEmpty()) return "";
        List<GearStore.Gear> list = GearStore.list(this, kind);
        if (list.isEmpty()) return "";
        if (setupGearId != null) return setupGearId;
        for (GearStore.Gear g : list) if (g.selected) return g.id;
        return list.get(0).id;
    }

    /** Shoes (run, walk, hike) or bike (ride): tap the one this workout counts toward, so the mileage lands on the right pair. */
    private void addGearRows() {
        final String kind = Sports.gearKind(setupSport.type);
        if (kind.isEmpty()) return;
        List<GearStore.Gear> list = GearStore.list(this, kind);
        TextView cap = Ui.text(this, kind.equals("bike") ? "BIKE" : "SHOES", 9, Ui.MUTED, true);
        cap.setLetterSpacing(0.16f);
        cap.setPadding(0, dp(12), 0, dp(4));
        setupList.addView(cap);
        if (list.isEmpty()) {
            TextView hint = Ui.text(this, kind.equals("bike") ? "Add a bike in the phone app (Run, Gear) to track its mileage" : "Add shoes in the phone app (Run, Gear) to track their mileage", 9, Ui.MUTED, false);
            hint.setPadding(0, dp(2), 0, dp(6));
            setupList.addView(hint);
            return;
        }
        String chosen = chosenGearId();
        for (GearStore.Gear g : list) addGearRow(g.id, g.name, g.text, g.warn, g.id.equals(chosen));
        addGearRow("none", "Don't count it", "", "", "none".equals(chosen));
    }

    private void addGearRow(final String id, String name, String sub, String warn, boolean on) {
        LinearLayout r = column();
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setBackground(on ? Ui.solid(this, Ui.ACCENT, 20) : Ui.glass(this, 20));
        r.setPadding(dp(12), dp(8), dp(12), dp(8));
        TextView n = Ui.text(this, name, 13, on ? BLACK : Ui.INK, true);
        n.setGravity(Gravity.START);
        n.setMaxLines(1);
        n.setEllipsize(TextUtils.TruncateAt.END);
        r.addView(n, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        String detail = warn.isEmpty() ? sub : sub + "  -  " + warn;
        if (!detail.isEmpty()) {
            TextView s = Ui.text(this, detail, 9, on ? BLACK : (warn.isEmpty() ? Ui.MUTED : Ui.YELLOW), false);
            s.setGravity(Gravity.START);
            r.addView(s, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }
        r.setOnClickListener(v -> {
            setupGearId = id;
            renderSetup();
        });
        setupList.addView(r, match(4));
    }

    /** Strength setup: choose today's plan day, a routine or a template, or start an empty session. */
    private void addRoutineRows() {
        TextView cap = Ui.text(this, "WORKOUT", 9, Ui.MUTED, true);
        cap.setLetterSpacing(0.16f);
        cap.setPadding(0, dp(12), 0, dp(4));
        setupList.addView(cap);
        List<RoutineStore.Routine> list = RoutineStore.list(this);
        if (setupRoutineId == null) setupRoutineId = !list.isEmpty() && list.get(0).id.startsWith("plan:") ? list.get(0).id : "";
        addRoutineRow("", "Empty workout", "Add exercises as you go");
        for (RoutineStore.Routine r : list) addRoutineRow(r.id, r.name, r.sub);
        if (list.isEmpty()) {
            TextView hint = Ui.text(this, "Open the phone app once to load your routines here (they then work without the phone too)", 9, Ui.MUTED, false);
            hint.setPadding(0, dp(6), 0, dp(6));
            setupList.addView(hint);
        }
    }

    private void addRoutineRow(final String id, String name, String sub) {
        boolean on = id.equals(setupRoutineId);
        LinearLayout r = column();
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setBackground(on ? Ui.solid(this, Ui.ACCENT, 20) : Ui.glass(this, 20));
        r.setPadding(dp(12), dp(9), dp(12), dp(9));
        TextView n = Ui.text(this, name, 13, on ? BLACK : Ui.INK, true);
        n.setGravity(Gravity.START);
        n.setMaxLines(2);
        n.setEllipsize(TextUtils.TruncateAt.END);
        r.addView(n, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        if (!sub.isEmpty()) {
            TextView s = Ui.text(this, sub, 9, on ? BLACK : Ui.MUTED, false);
            s.setGravity(Gravity.START);
            r.addView(s, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }
        r.setOnClickListener(v -> {
            setupRoutineId = id;
            renderSetup();
        });
        setupList.addView(r, match(5));
    }

    // ---------------------------------------------------------------- sleep (last night, as the phone worked it out)

    private View buildSleep() {
        sleepList = column();
        sleepScroll = scroller(sleepList, 34, 60);
        sleepScroll.setVisibility(View.GONE);
        return sleepScroll;
    }

    /** "23:20" in the way the watch is set to show the time. */
    private String clockText(String hhmm) {
        try {
            String[] p = hhmm.split(":");
            int h = Integer.parseInt(p[0].trim());
            int m = Integer.parseInt(p[1].trim());
            if (DateFormat.is24HourFormat(this)) return String.format(Locale.getDefault(), "%d:%02d", h, m);
            return String.format(Locale.getDefault(), "%d:%02d %s", h % 12 == 0 ? 12 : h % 12, m, h < 12 ? "AM" : "PM");
        } catch (RuntimeException e) {
            return hhmm;
        }
    }

    /** The morning a night ended ("yyyy-MM-dd") as a caption: "LAST NIGHT", or the day for an older one. */
    private String sleepDayLabel(String iso) {
        try {
            java.time.LocalDate d = java.time.LocalDate.parse(iso);
            java.time.LocalDate today = java.time.LocalDate.now();
            if (d.equals(today) || d.equals(today.minusDays(1))) return "LAST NIGHT";
            return d.format(java.time.format.DateTimeFormatter.ofPattern("EEE d MMM", Locale.getDefault())).toUpperCase(Locale.getDefault());
        } catch (RuntimeException e) {
            return "LAST NIGHT";
        }
    }

    private static String hoursMinutes(int min) {
        return (min / 60) + "h " + String.format(Locale.getDefault(), "%02d", min % 60) + "m";
    }

    /** One stage of the night: its name, a bar and the time. */
    private LinearLayout sleepStageRow(String name, int minutes, int totalStages, int color) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(6), dp(3), dp(6), dp(3));
        r.addView(Ui.text(this, name, 11, Ui.INK, true), new LinearLayout.LayoutParams(dp(44), LinearLayout.LayoutParams.WRAP_CONTENT));
        FrameLayout track = new FrameLayout(this);
        track.setBackground(Ui.glass(this, 6));
        View bar = new View(this);
        bar.setBackground(Ui.solid(this, color, 6));
        int width = Math.max(dp(2), Math.round(dp(52) * (minutes / (float) Math.max(1, totalStages))));
        track.addView(bar, new FrameLayout.LayoutParams(width, dp(10)));
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(dp(52), dp(10));
        tp.leftMargin = dp(4);
        r.addView(track, tp);
        TextView t = Ui.text(this, hoursMinutes(minutes), 11, Ui.MUTED, false);
        t.setGravity(Gravity.END);
        LinearLayout.LayoutParams xp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        xp.leftMargin = dp(6);
        r.addView(t, xp);
        return r;
    }

    private void renderSleep() {
        int total = GlanceStore.sleepMin(this);
        int deep = GlanceStore.sleepDeep(this);
        int rem = GlanceStore.sleepRem(this);
        int light = GlanceStore.sleepLight(this);
        int awake = GlanceStore.sleepAwake(this);
        int score = GlanceStore.sleepScore(this);
        int goal = GlanceStore.sleepGoalMin(this);
        int debtMin = GlanceStore.sleepDebtMin(this);
        String key = debtMin + "|" + total + "|" + deep + "|" + rem + "|" + light + "|" + awake + "|" + score + "|" + goal + "|" + GlanceStore.sleepBed(this) + GlanceStore.sleepWake(this) + GlanceStore.sleepDate(this);
        if (key.equals(shownSleepKey)) return;
        shownSleepKey = key;
        sleepList.removeAllViews();
        sleepList.addView(Ui.num(this, "SLEEP", 22, Ui.INK));
        if (total < 0) {
            TextView none = Ui.text(this, "No night yet. Open the phone app once and last night appears here.", 12, Ui.MUTED, false);
            none.setPadding(0, dp(10), 0, dp(10));
            sleepList.addView(none);
        } else {
            TextView day = Ui.text(this, sleepDayLabel(GlanceStore.sleepDate(this)), 10, Ui.PURPLE, true);
            day.setLetterSpacing(0.14f);
            day.setPadding(0, dp(4), 0, 0);
            sleepList.addView(day);
            sleepList.addView(Ui.num(this, hoursMinutes(total), 40, Ui.INK));
            String bed = GlanceStore.sleepBed(this);
            String wake = GlanceStore.sleepWake(this);
            if (!bed.isEmpty() && !wake.isEmpty()) {
                TextView span = Ui.text(this, clockText(bed) + "  to  " + clockText(wake), 12, Ui.MUTED, false);
                span.setPadding(0, dp(1), 0, dp(6));
                sleepList.addView(span);
            }
            // How close the night came to the goal.
            FrameLayout track = new FrameLayout(this);
            track.setBackground(Ui.solid(this, Ui.EDGE, 4));
            View fill = new View(this);
            fill.setBackground(Ui.solid(this, total >= goal ? Ui.ACCENT : Ui.PURPLE, 4));
            track.addView(fill, new FrameLayout.LayoutParams(Math.max(dp(2), Math.round(dp(150) * Math.min(1f, total / (float) goal))), dp(6)));
            sleepList.addView(track, new LinearLayout.LayoutParams(dp(150), dp(6)));
            TextView goalText = Ui.text(this, Math.round(100f * total / goal) + "%  OF  " + (goal / 60) + "H  GOAL", 9, Ui.MUTED, true);
            goalText.setPadding(0, dp(4), 0, dp(8));
            sleepList.addView(goalText);

            int stages = deep + rem + light + awake;
            if (stages > 0) {
                sleepList.addView(sleepStageRow("Deep", deep, stages, Ui.PURPLE), match(2));
                sleepList.addView(sleepStageRow("REM", rem, stages, Ui.BLUE), match(2));
                sleepList.addView(sleepStageRow("Light", light, stages, Ui.GREEN), match(2));
                sleepList.addView(sleepStageRow("Awake", awake, stages, Ui.ORANGE), match(2));
            }
            if (score >= 0) {
                TextView sc = Ui.text(this, "Sleep score " + score + "  (an estimate)", 11, Ui.MUTED, false);
                sc.setPadding(0, dp(8), 0, 0);
                sleepList.addView(sc);
            }
            if (debtMin >= 0) {
                TextView debt = Ui.text(this, debtMin == 0 ? "No sleep debt this week" : "This week: " + hoursMinutes(debtMin) + " short of your goal", 11, debtMin == 0 ? Ui.GREEN : Ui.PURPLE, false);
                debt.setPadding(0, dp(6), 0, 0);
                sleepList.addView(debt);
            }
        }
        LinearLayout back = row(R.drawable.ic_check, Ui.ACCENT, "Done");
        back.setOnClickListener(v -> {
            nav = Screen.HOME;
            render();
        });
        back.setLayoutParams(match(14));
        sleepList.addView(back);
    }

    // ---------------------------------------------------------------- music (play, skip and volume during a workout)

    /** A compact icon button for the music page. */
    private LinearLayout mediaButton(int iconRes, String description, boolean primary, View.OnClickListener click) {
        LinearLayout b = new LinearLayout(this);
        b.setGravity(Gravity.CENTER);
        b.setBackground(primary ? Ui.solid(this, Ui.ACCENT, 22) : Ui.glass(this, 22));
        b.setMinimumHeight(dp(44));
        b.setContentDescription(description);
        b.addView(Ui.icon(this, iconRes, primary ? BLACK : Ui.INK, 22));
        b.setOnClickListener(v -> {
            Haptics.lap(this);
            click.onClick(v);
        });
        return b;
    }

    private View buildMusicPage() {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER);
        TextView cap = Ui.text(this, "MUSIC", 10, Ui.MUTED, true);
        cap.setLetterSpacing(0.16f);
        c.addView(cap);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams p1 = weight(1f);
        p1.rightMargin = dp(3);
        LinearLayout.LayoutParams p2 = weight(1.2f);
        p2.leftMargin = dp(3);
        p2.rightMargin = dp(3);
        LinearLayout.LayoutParams p3 = weight(1f);
        p3.leftMargin = dp(3);
        top.addView(mediaButton(R.drawable.ic_skip_prev, "Previous track", false, v -> mediaKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS)), p1);
        top.addView(mediaButton(R.drawable.ic_play, "Play or pause", true, v -> mediaKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)), p2);
        top.addView(mediaButton(R.drawable.ic_skip_next, "Next track", false, v -> mediaKey(KeyEvent.KEYCODE_MEDIA_NEXT)), p3);
        c.addView(top, match(10));

        LinearLayout vol = new LinearLayout(this);
        vol.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams v1 = weight(1f);
        v1.rightMargin = dp(3);
        LinearLayout.LayoutParams v2 = weight(1f);
        v2.leftMargin = dp(3);
        vol.addView(mediaButton(R.drawable.ic_volume_down, "Volume down", false, v -> volume(AudioManager.ADJUST_LOWER)), v1);
        vol.addView(mediaButton(R.drawable.ic_volume_up, "Volume up", false, v -> volume(AudioManager.ADJUST_RAISE)), v2);
        c.addView(vol, match(8));

        TextView hint = Ui.text(this, "Controls what is playing on this watch", 9, Ui.MUTED, false);
        hint.setPadding(0, dp(8), 0, 0);
        c.addView(hint);
        return pageFrame(c);
    }

    /** Sends a media key to whatever player is active, the same as the buttons on a pair of headphones. */
    private void mediaKey(int code) {
        AudioManager am = getSystemService(AudioManager.class);
        if (am == null) return;
        long t = SystemClock.uptimeMillis();
        am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, code, 0));
        am.dispatchMediaKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_UP, code, 0));
    }

    private void volume(int direction) {
        AudioManager am = getSystemService(AudioManager.class);
        if (am != null) am.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, AudioManager.FLAG_SHOW_UI);
    }

    // ---------------------------------------------------------------- adding an exercise to a strength session

    private View buildPicker() {
        pickerLayer = new FrameLayout(this);
        pickerLayer.setBackgroundColor(Ui.BG);
        pickerList = column();
        pickerScroll = scroller(pickerList, 34, 60);
        pickerLayer.addView(pickerScroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        pickerLayer.setVisibility(View.GONE);
        // Touches must not fall through to the workout pages underneath.
        pickerLayer.setClickable(true);
        return pickerLayer;
    }

    private void openPicker() {
        pickerGroup = null;
        pickerOpen = true;
        pickerLayer.setVisibility(View.VISIBLE);
        renderPicker();
        pickerScroll.scrollTo(0, 0);
    }

    private void closePicker() {
        pickerOpen = false;
        pickerGroup = null;
        pickerLayer.setVisibility(View.GONE);
    }

    /** Back one step: from a list of exercises to the groups, from the groups out. */
    private void pickerBack() {
        if (pickerGroup != null) {
            pickerGroup = null;
            renderPicker();
            pickerScroll.scrollTo(0, 0);
        } else {
            closePicker();
        }
    }

    private void renderPicker() {
        pickerList.removeAllViews();
        if (pickerGroup == null) {
            pickerList.addView(Ui.num(this, "ADD EXERCISE", 22, Ui.INK));
            List<String> groups = ExerciseLibStore.groups(this);
            if (groups.isEmpty()) {
                TextView none = Ui.text(this, "Open the phone app once to load the exercise list here.", 11, Ui.MUTED, false);
                none.setPadding(0, dp(8), 0, dp(4));
                pickerList.addView(none);
            }
            for (final String g : groups) {
                LinearLayout r = row(R.drawable.ic_strength, Ui.ACCENT, g);
                r.addView(Ui.text(this, "›", 16, Ui.MUTED, false));
                r.setOnClickListener(v -> {
                    pickerGroup = g;
                    renderPicker();
                    pickerScroll.scrollTo(0, 0);
                });
                pickerList.addView(r);
            }
            if (LocalStrength.active != null) {
                LinearLayout blank = row(R.drawable.ic_plus, Ui.BLUE, "Blank exercise");
                blank.setOnClickListener(v -> {
                    LocalStrength.addBlank();
                    finishPicking();
                });
                pickerList.addView(blank);
            }
        } else {
            pickerList.addView(Ui.num(this, pickerGroup.toUpperCase(Locale.getDefault()), 20, Ui.INK));
            String unit = ExerciseLibStore.unit(this);
            for (final ExerciseLibStore.Ex ex : ExerciseLibStore.inGroup(this, pickerGroup)) {
                LinearLayout r = row(R.drawable.ic_strength, Ui.ACCENT, ex.name);
                if (!ex.sets.isEmpty()) {
                    double[] top = ex.sets.get(0);
                    TextView last = Ui.text(this, ex.sets.size() + "x" + Math.round(top[0]) + (top[1] > 0 ? " " + weightText(top[1]) + unit : ""), 10, Ui.MUTED, false);
                    r.addView(last);
                }
                r.setOnClickListener(v -> {
                    if (LocalStrength.active != null) LocalStrength.addExercise(ex.id, ex.name, ex.step, ex.sets);
                    else PhoneLink.sendSet(this, "addex", 0, ex.index);
                    finishPicking();
                });
                pickerList.addView(r);
            }
        }
        LinearLayout back = row(R.drawable.ic_close, Ui.MUTED, pickerGroup == null ? "Close" : "Back");
        back.setOnClickListener(v -> pickerBack());
        back.setLayoutParams(match(14));
        pickerList.addView(back);
    }

    /** An exercise was chosen: close the picker and go to the set page, where it now is. */
    private void finishPicking() {
        closePicker();
        stListKey = "";
        if (pager != null) pager.setCurrentItem(0, true);
        render();
    }

    /** True while the automatic rep count is on, the watch supports it and a strength session is on screen. */
    private boolean countingReps() {
        return WatchPrefs.autoReps(this) && WatchCaps.repCounting(this) && WorkoutState.strength != null;
    }

    // ---------------------------------------------------------------- always-on display during a workout

    private View buildAmbientLayer() {
        ambientLayer = new FrameLayout(this);
        // Pure black with plain white and grey text: nothing bright or colored stays lit on the OLED while the wrist is down.
        ambientLayer.setBackgroundColor(0xFF000000);
        ambientLayer.setClickable(true);
        ambientBox = new LinearLayout(this);
        ambientBox.setOrientation(LinearLayout.VERTICAL);
        ambientBox.setGravity(Gravity.CENTER);
        amType = Ui.text(this, "", 12, 0xFFBBBBBB, true);
        amType.setLetterSpacing(0.14f);
        amMain = Ui.num(this, "", 54, 0xFFFFFFFF);
        amSub = Ui.text(this, "", 14, 0xFFBBBBBB, false);
        amSub.setGravity(Gravity.CENTER);
        amHr = Ui.text(this, "", 18, 0xFFFFFFFF, true);
        ambientBox.addView(amType);
        ambientBox.addView(amMain, match(2));
        ambientBox.addView(amSub, match(2));
        ambientBox.addView(amHr, match(10));
        ambientLayer.addView(ambientBox, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        ambientLayer.setVisibility(View.GONE);
        return ambientLayer;
    }

    private void enterAmbient(boolean burnInProtection) {
        ambient = true;
        ambientBurnIn = burnInProtection;
        ui.removeCallbacks(refresh);
        boolean workout = WorkoutState.active && WorkoutService.running;
        if (!workout) {
            // Nothing to keep on show: go back to the watch face, as an app without an always-on screen would.
            moveTaskToBack(true);
            return;
        }
        ambientLayer.setVisibility(View.VISIBLE);
        renderAmbient();
    }

    private void exitAmbient() {
        ambient = false;
        ambientLayer.setVisibility(View.GONE);
        ambientBox.setTranslationX(0);
        ambientBox.setTranslationY(0);
        ui.removeCallbacks(refresh);
        ui.post(refresh);
    }

    /** The always-on face: the one number that matters, the heart rate and the time so far. It is redrawn about once a minute. */
    private void renderAmbient() {
        boolean workout = WorkoutState.active && WorkoutService.running;
        if (!workout) {
            ambientLayer.setVisibility(View.GONE);
            moveTaskToBack(true);
            return;
        }
        long now = System.currentTimeMillis();
        Sports.Sport sport = Sports.find(WorkoutState.type);
        long mins = WorkoutState.elapsedMs(now) / 60_000;
        String clock = mins >= 60 ? (mins / 60) + ":" + String.format(Locale.getDefault(), "%02d", mins % 60) : mins + " min";
        amType.setText((WorkoutState.paused ? "PAUSED  " : "") + sport.label.toUpperCase(Locale.getDefault()));
        WorkoutState.Strength st = WorkoutState.strength;
        if (st != null && "Strength".equals(WorkoutState.type)) {
            amMain.setText(weightText(st.weight) + " x " + Math.round(st.reps));
            amSub.setText(st.name + "\nSET " + (st.setIdx + 1) + " OF " + Math.max(1, st.setCount) + (st.restEndsAt > now ? "   RESTING" : "") + "\n" + clock);
        } else if (sport.hasDistance() || WorkoutState.distanceM() > 0) {
            amMain.setText(String.format(Locale.getDefault(), "%.2f", WorkoutState.distanceM() / WorkoutState.unitM()));
            String pace = WorkoutState.currentPace();
            if ("--:--".equals(pace)) pace = WorkoutState.averagePace(WorkoutState.elapsedMs(now));
            amSub.setText(WorkoutState.unitName().toUpperCase(Locale.getDefault()) + "   " + pace + "\n" + clock);
        } else {
            amMain.setText(clock);
            double kcal = WorkoutState.kcal > 0 ? WorkoutState.kcal : WorkoutState.phoneKcal;
            amSub.setText(kcal > 0 ? Math.round(kcal) + " kcal" : "");
        }
        amHr.setText(WorkoutState.bpm > 0 ? WorkoutState.bpm + " bpm" : "");
        // Moves the picture a few pixels each time, so that no pixel stays lit for hours (burn-in protection).
        if (ambientBurnIn) {
            ambientTicks++;
            int off = dp(3);
            ambientBox.setTranslationX(((ambientTicks % 3) - 1) * off);
            ambientBox.setTranslationY((((ambientTicks / 3) % 3) - 1) * off);
        }
    }

    // ---------------------------------------------------------------- end dialog + summary

    private View buildEnd() {
        LinearLayout c = column();
        c.setGravity(Gravity.CENTER);
        endTitle = Ui.text(this, "End workout?", 18, Ui.INK, true);
        c.addView(endTitle);

        LinearLayout save = row(R.drawable.ic_check, Ui.ACCENT, "Save");
        save.setOnClickListener(v -> {
            endDialog = false;
            WorkoutService.stopFromWatch(this);
            render();
        });
        LinearLayout resume = row(R.drawable.ic_play, Ui.BLUE, "Resume");
        resume.setOnClickListener(v -> {
            endDialog = false;
            render();
        });
        LinearLayout discard = row(R.drawable.ic_close, Ui.RED, "Discard");
        discard.setOnClickListener(v -> {
            endDialog = false;
            WorkoutService.discard(this);
            render();
        });
        c.addView(save, match(12));
        c.addView(resume);
        c.addView(discard);
        endScroll = scroller(c, 40, 50);
        endScroll.setVisibility(View.GONE);
        return endScroll;
    }

    private View buildSummary() {
        summaryBox = column();
        summaryScroll = scroller(summaryBox, 34, 60);
        summaryScroll.setVisibility(View.GONE);
        return summaryScroll;
    }

    private LinearLayout statTile(String value, String cap, int color) {
        return glassCell(Ui.text(this, value, 17, color, true), Ui.text(this, cap, 10, Ui.MUTED, false));
    }

    private void renderSummary() {
        WorkoutState.Summary s = WorkoutState.summary;
        if (s == shownSummary) return;
        shownSummary = s;
        summaryBox.removeAllViews();
        if (s == null) return;
        Sports.Sport sport = Sports.find(s.type);
        TextView done0 = Ui.text(this, (sport.label + " done").toUpperCase(Locale.getDefault()), 11, Ui.ACCENT, true);
        done0.setLetterSpacing(0.14f);
        summaryBox.addView(done0);
        summaryBox.addView(Ui.num(this, WorkoutState.clock(s.durationMs / 1000), 46, Ui.INK));
        if (!s.goal.isEmpty()) {
            TextView g = Ui.text(this, (s.goalReached ? "GOAL REACHED  -  " : "GOAL  -  ") + s.goal, 10, s.goalReached ? Ui.ACCENT : Ui.MUTED, true);
            g.setPadding(0, dp(4), 0, 0);
            summaryBox.addView(g);
        }

        List<LinearLayout> tiles = new ArrayList<>();
        if (s.distanceM >= 20) tiles.add(statTile(String.format(Locale.getDefault(), "%.2f", s.distanceM / WorkoutState.unitM()), WorkoutState.unitName(), Ui.ACCENT));
        if (!s.avgPace.isEmpty() && !"--:--".equals(s.avgPace)) tiles.add(statTile(s.avgPace, "avg pace /" + WorkoutState.unitName(), Ui.YELLOW));
        if (s.steps > 0) tiles.add(statTile(String.format(Locale.getDefault(), "%,d", s.steps), "steps", Ui.BLUE));
        if (s.avgHr > 0) tiles.add(statTile(String.valueOf(s.avgHr), "avg bpm", Ui.RED));
        if (s.maxHr > 0) tiles.add(statTile(String.valueOf(s.maxHr), "max bpm", Ui.RED));
        if (s.kcal > 0) tiles.add(statTile(String.valueOf(Math.round(s.kcal)), "kcal", Ui.ORANGE));
        if (s.elevGainM > 0) tiles.add(statTile("+" + s.elevGainM, "m climbed", Ui.BLUE));
        for (int i = 0; i < tiles.size(); i += 2) {
            LinearLayout rowL = new LinearLayout(this);
            rowL.setOrientation(LinearLayout.HORIZONTAL);
            LinearLayout.LayoutParams a = weight(1f);
            a.rightMargin = dp(4);
            rowL.addView(tiles.get(i), a);
            LinearLayout.LayoutParams b = weight(1f);
            b.leftMargin = dp(4);
            if (i + 1 < tiles.size()) rowL.addView(tiles.get(i + 1), b);
            else rowL.addView(new View(this), b);
            summaryBox.addView(rowL, match(8));
        }

        long total = 0;
        for (long z : s.zones) total += z;
        if (total > 5000) {
            LinearLayout bar = new LinearLayout(this);
            bar.setOrientation(LinearLayout.HORIZONTAL);
            bar.setBackground(Ui.glass(this, 6));
            for (int i = 0; i < 5; i++) {
                if (s.zones[i] <= 0) continue;
                View seg = new View(this);
                seg.setBackground(Ui.tinted(this, Ui.zoneColor(i), 4, 0xFF, 0xCC));
                bar.addView(seg, new LinearLayout.LayoutParams(0, dp(10), s.zones[i]));
            }
            summaryBox.addView(caption("Time in zones"));
            summaryBox.addView(bar, match(2));
        }

        String note = s.standalone
            ? (s.sentToPhone ? "Recorded on the watch. It will appear in the phone app." : "Saved on the watch.")
            : "Saved on the watch and the phone.";
        TextView n = Ui.text(this, note, 11, Ui.MUTED, false);
        n.setPadding(0, dp(10), 0, 0);
        summaryBox.addView(n);

        LinearLayout done = row(R.drawable.ic_check, Ui.ACCENT, "Done");
        done.setOnClickListener(v -> {
            WorkoutState.summary = null;
            render();
        });
        done.setLayoutParams(match(12));
        summaryBox.addView(done);
        summaryScroll.scrollTo(0, 0);
    }

    // ---------------------------------------------------------------- actions

    /**
     * All-day heart rate needs the "all the time" body sensor permission on Wear OS 4 and newer. It must be asked for
     * after the normal one, and only once automatically; the "All-day tracking" switch in Settings asks again.
     */
    private void askBackgroundSensorsOnce() {
        askBackgroundSensors(false);
    }

    private void askBackgroundSensors(boolean force) {
        if (Build.VERSION.SDK_INT < 33 || !hasSensorPermission()) return;
        if (checkSelfPermission("android.permission.BODY_SENSORS_BACKGROUND") == PackageManager.PERMISSION_GRANTED) return;
        android.content.SharedPreferences p = getSharedPreferences("ky_vitals_sync", MODE_PRIVATE);
        if (!force && p.getBoolean("bgAsked", false)) return;
        p.edit().putBoolean("bgAsked", true).apply();
        requestPermissions(new String[] {"android.permission.BODY_SENSORS_BACKGROUND"}, REQ_BG_SENSORS);
    }

    private boolean hasSensorPermission() {
        return checkSelfPermission(Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestPermissions() {
        List<String> need = new ArrayList<>();
        need.add(Manifest.permission.BODY_SENSORS);
        need.add(Manifest.permission.ACTIVITY_RECOGNITION);
        need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33) need.add(Manifest.permission.POST_NOTIFICATIONS);
        requestPermissions(need.toArray(new String[0]), REQ_PERMS);
    }

    /** A workout started on the phone: start the sensor service now that we are in the foreground. */
    private void ensureServiceForPhoneWorkout() {
        if (WorkoutState.active && !WorkoutService.running) {
            if (hasSensorPermission()) {
                WorkoutService.start(this, WorkoutState.type);
            } else if (pendingType == null) {
                pendingType = WorkoutState.type;
                requestPermissions();
            }
        }
    }

    private void toggleHeartRateOnly() {
        if (HeartRateService.running) {
            stopService(new Intent(this, HeartRateService.class));
        } else if (hasSensorPermission()) {
            startForegroundService(new Intent(this, HeartRateService.class));
        } else {
            pendingType = "HR_ONLY";
            requestPermissions();
        }
        render();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        String type = pendingType;
        boolean fromSetup = pendingFromSetup;
        pendingType = null;
        pendingFromSetup = false;
        if (requestCode == REQ_PERMS && hasSensorPermission()) {
            WatchSteps.register(this);
            askBackgroundSensorsOnce();
        }
        if (requestCode == REQ_BG_SENSORS) WatchSteps.register(this);
        if (requestCode == REQ_PERMS && type != null && hasSensorPermission()) {
            if ("HR_ONLY".equals(type)) startForegroundService(new Intent(this, HeartRateService.class));
            else if (fromSetup) beginCountdown();
            else if (!WorkoutService.running) WorkoutService.start(this, type);
        }
        render();
    }

    // ---------------------------------------------------------------- rendering

    private void show(Screen next) {
        if (next == shown) return;
        shown = next;
        idleScroll.setVisibility(next == Screen.HOME ? View.VISIBLE : View.GONE);
        moreScroll.setVisibility(next == Screen.MORE ? View.VISIBLE : View.GONE);
        setupScroll.setVisibility(next == Screen.SETUP ? View.VISIBLE : View.GONE);
        countdownFrame.setVisibility(next == Screen.COUNTDOWN ? View.VISIBLE : View.GONE);
        settingsScroll.setVisibility(next == Screen.SETTINGS ? View.VISIBLE : View.GONE);
        sleepScroll.setVisibility(next == Screen.SLEEP ? View.VISIBLE : View.GONE);
        fastScroll.setVisibility(next == Screen.FAST ? View.VISIBLE : View.GONE);
        pagerFrame.setVisibility(next == Screen.WORKOUT ? View.VISIBLE : View.GONE);
        endScroll.setVisibility(next == Screen.END ? View.VISIBLE : View.GONE);
        summaryScroll.setVisibility(next == Screen.SUMMARY ? View.VISIBLE : View.GONE);
        if (next == Screen.WORKOUT) {
            pager.setCurrentItem(0, false);
            shownLapCount = -1;
        }
        if (next == Screen.SETTINGS) renderSettings();
        if (next == Screen.FAST) {
            fastScroll.scrollTo(0, 0);
            fastEndArmedUntil = 0;
            fastMeter.setFast(fastHours(), GlanceStore.fastGoalHours(this), true);
        }
        if (next == Screen.SLEEP) {
            shownSleepKey = "";
            sleepScroll.scrollTo(0, 0);
        }
        if (next == Screen.MORE) {
            renderMore();
            moreScroll.scrollTo(0, 0);
        }
        if (next == Screen.HOME) {
            shownHistoryCount = -1;
            shownFavorites = "";
        }
    }

    /** A strength session from the phone's Lift logger (or run here) is under way. */
    private static boolean liftSessionOn() {
        return WorkoutState.active && WorkoutState.strength != null && "Strength".equals(WorkoutState.type);
    }

    private void render() {
        // In always-on mode only renderAmbient() draws, about once a minute.
        if (ambient) return;
        // A lifting session wears the Lift look; when it starts or ends the screens are built again in the right colors.
        if (liftSessionOn() != Ui.lift) {
            recreate();
            return;
        }
        ensureServiceForPhoneWorkout();
        long now = System.currentTimeMillis();
        boolean workout = WorkoutState.active && WorkoutService.running;
        if (!workout) endDialog = false;
        if (workout && nav == Screen.COUNTDOWN) nav = Screen.HOME;
        // The service did not come up after the countdown: go back to the setup page.
        if (!workout && nav == Screen.COUNTDOWN && startingAt > 0 && now - startingAt > 6000) {
            startingAt = 0;
            WorkoutState.clearGoal();
            nav = Screen.SETUP;
        }
        Screen next = workout
            ? (endDialog ? Screen.END : Screen.WORKOUT)
            : (WorkoutState.summary != null ? Screen.SUMMARY : nav);
        show(next);
        if (pickerOpen && next != Screen.WORKOUT) closePicker();
        switch (next) {
            case FAST:
                renderFast();
                break;
            case SLEEP:
                renderSleep();
                break;
            case WORKOUT:
                syncPagesForStrength();
                if (strengthPagesShown) {
                    renderStrengthSet(now);
                    renderStrengthList();
                }
                renderMetrics(now);
                renderControls();
                renderZones();
                renderLaps(now);
                break;
            case END:
                endTitle.setText("End " + Sports.find(WorkoutState.type).label.toLowerCase(Locale.getDefault()) + "?\n" + WorkoutState.clock(WorkoutState.elapsedMs(now) / 1000));
                break;
            case SUMMARY:
                renderSummary();
                break;
            case HOME:
                renderIdle();
                break;
            default:
                break;
        }
    }
}





