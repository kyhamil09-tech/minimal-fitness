package com.kyfitness.app

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseRoute
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.feature.ExperimentalMindfulnessSessionApi
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.MindfulnessSessionRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByDurationRequest
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.BloodGlucose
import androidx.health.connect.client.units.Percentage
import androidx.health.connect.client.units.Pressure
import androidx.health.connect.client.units.Volume
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import kotlin.reflect.KClass
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Two-way Health Connect access. Asks only for the data types listed in readTypes and writeTypes (plus older
 * history reads), reads sleep, steps, heart rate, body measurements, workouts and daily totals, and writes
 * workouts (with route, heart rate, distance and calories), body weight and fat, meals, water and sleep.
 * The user grants access in Android's own permission screen.
 */
@OptIn(ExperimentalMindfulnessSessionApi::class)
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val prefix = "android.permission.health."

    /** The most heart-rate samples or route points written for one workout. */
    private val MAX_SAMPLES = 2000

    /** Data types the app reads. Keep in step with AndroidManifest.xml: a type that is never read or written is not asked for. */
    private val readTypes = listOf(
        "SLEEP", "HEART_RATE", "RESTING_HEART_RATE", "HEART_RATE_VARIABILITY", "RESPIRATORY_RATE", "OXYGEN_SATURATION",
        "SKIN_TEMPERATURE", "VO2_MAX", "STEPS", "TOTAL_CALORIES_BURNED", "ACTIVE_CALORIES_BURNED", "DISTANCE",
        "FLOORS_CLIMBED", "EXERCISE", "WEIGHT", "BODY_FAT", "HEIGHT", "BLOOD_PRESSURE", "BLOOD_GLUCOSE",
    )

    /** Data types the app writes (and removes again when you delete the matching entry). */
    private val writeTypes = listOf(
        "EXERCISE", "DISTANCE", "TOTAL_CALORIES_BURNED", "HEART_RATE", "WEIGHT", "BODY_FAT", "NUTRITION", "HYDRATION",
        "SLEEP", "BLOOD_PRESSURE", "BLOOD_GLUCOSE", "EXERCISE_ROUTE", "MINDFULNESS",
    )

    private val permissions: Set<String> =
        readTypes.map { "${prefix}READ_$it" }.toSet() +
            writeTypes.map { "${prefix}WRITE_$it" }.toSet() +
            setOf("${prefix}READ_HEALTH_DATA_HISTORY")

    /**
     * The permissions grouped by what they are for, so the app can ask for one feature at a time (when the person turns it on)
     * instead of showing one long list. Together the groups cover exactly the set above.
     */
    private val groups: Map<String, Set<String>> = mapOf(
        "activity" to setOf(
            "READ_STEPS", "READ_DISTANCE", "READ_TOTAL_CALORIES_BURNED", "READ_ACTIVE_CALORIES_BURNED", "READ_FLOORS_CLIMBED",
            "READ_EXERCISE", "WRITE_EXERCISE", "WRITE_DISTANCE", "WRITE_TOTAL_CALORIES_BURNED", "WRITE_EXERCISE_ROUTE", "READ_HEALTH_DATA_HISTORY",
        ),
        "heart" to setOf("READ_HEART_RATE", "WRITE_HEART_RATE", "READ_RESTING_HEART_RATE", "READ_VO2_MAX"),
        "sleep" to setOf(
            "READ_SLEEP", "WRITE_SLEEP", "READ_HEART_RATE_VARIABILITY", "READ_RESPIRATORY_RATE", "READ_OXYGEN_SATURATION", "READ_SKIN_TEMPERATURE",
        ),
        "body" to setOf("READ_WEIGHT", "WRITE_WEIGHT", "READ_BODY_FAT", "WRITE_BODY_FAT", "READ_HEIGHT"),
        "nutrition" to setOf("WRITE_NUTRITION", "WRITE_HYDRATION"),
        "mindfulness" to setOf("WRITE_MINDFULNESS"),
        "vitals" to setOf("READ_BLOOD_PRESSURE", "WRITE_BLOOD_PRESSURE", "READ_BLOOD_GLUCOSE", "WRITE_BLOOD_GLUCOSE"),
    ).mapValues { (_, v) -> v.map { "$prefix$it" }.toSet() }

    /** The permissions for the named groups (all of them when none are named); unknown names are ignored. */
    private fun permissionsFor(names: List<String>): Set<String> {
        if (names.isEmpty()) return permissions
        val picked = names.mapNotNull { groups[it] }.flatten().toSet()
        return if (picked.isEmpty()) permissions else picked
    }

    private fun available() = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    private fun client() = HealthConnectClient.getOrCreate(context)

    private suspend fun granted(): Set<String> = client().permissionController.getGrantedPermissions()

    private fun offset(at: Instant): ZoneOffset = ZoneId.systemDefault().rules.getOffset(at)

    private fun statusObject(sdk: Int, grantedSet: Set<String>): JSObject {
        val out = JSObject()
        out.put("available", sdk == HealthConnectClient.SDK_AVAILABLE)
        out.put("needsUpdate", sdk == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED)
        out.put("sleepGranted", grantedSet.contains("${prefix}READ_SLEEP"))
        out.put("stepsGranted", grantedSet.contains("${prefix}READ_STEPS"))
        val have = permissions.count { grantedSet.contains(it) }
        out.put("total", permissions.size)
        out.put("grantedCount", have)
        out.put("allGranted", have == permissions.size)
        out.put("canRead", grantedSet.contains("${prefix}READ_EXERCISE") && grantedSet.contains("${prefix}READ_HEART_RATE"))
        out.put("canWrite", grantedSet.contains("${prefix}WRITE_EXERCISE") && grantedSet.contains("${prefix}WRITE_NUTRITION"))
        // The same counts for receive-only use: only the permissions that let the app read.
        val readPerms = permissions.filter { it.startsWith("${prefix}READ_") }
        val readHave = readPerms.count { grantedSet.contains(it) }
        out.put("readTotal", readPerms.size)
        out.put("readGrantedCount", readHave)
        out.put("allReadGranted", readHave == readPerms.size)
        val perGroup = JSObject()
        for ((name, perms) in groups) {
            val g = JSObject()
            g.put("total", perms.size)
            g.put("granted", perms.count { grantedSet.contains(it) })
            val reads = perms.filter { it.startsWith("${prefix}READ_") }
            g.put("readTotal", reads.size)
            g.put("readGranted", reads.count { grantedSet.contains(it) })
            perGroup.put(name, g)
        }
        out.put("groups", perGroup)
        val missing = JSArray()
        permissions.filter { !grantedSet.contains(it) }.sorted().forEach { missing.put(it.removePrefix(prefix)) }
        out.put("missing", missing)
        return out
    }

    @PluginMethod
    fun status(call: PluginCall) {
        scope.launch {
            val sdk = HealthConnectClient.getSdkStatus(context)
            var g: Set<String> = emptySet()
            if (sdk == HealthConnectClient.SDK_AVAILABLE) {
                try {
                    g = granted()
                } catch (e: Exception) {
                    // treated as not granted
                }
            }
            call.resolve(statusObject(sdk, g))
        }
    }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        if (!available()) {
            call.reject("Health Connect is not available on this phone. Install or update it from Google Play.")
            return
        }
        val asked = call.getArray("groups")
        val names = (0 until (asked?.length() ?: 0)).mapNotNull { asked!!.optString(it).ifEmpty { null } }
        // Receive-only: ask for nothing that lets the app write, so Android's screen lists only the reads.
        val readOnly = call.getBoolean("readOnly", false) == true
        val wanted = permissionsFor(names).filter { !readOnly || it.startsWith("${prefix}READ_") }.toSet()
        if (wanted.isEmpty()) {
            status(call)
            return
        }
        val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, wanted)
        startActivityForResult(call, intent, "accessResult")
    }

    @ActivityCallback
    private fun accessResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        status(call)
    }

    /** Android stops showing the permission pop-up after a few refusals; this opens Health Connect's own settings. */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = HealthConnectClient.getHealthConnectManageDataIntent(context)
            activity.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Could not open Health Connect: ${e.message}")
        }
    }

    // ------------------------------------------------------------------ reads

    /** Every record of a type in a range, following the pages Health Connect hands back. */
    private suspend fun <T : Record> readAll(type: KClass<T>, filter: TimeRangeFilter): List<T> {
        val out = mutableListOf<T>()
        var token: String? = null
        do {
            val resp = client().readRecords(ReadRecordsRequest(type, filter, pageSize = 5000, pageToken = token))
            out.addAll(resp.records)
            token = resp.pageToken
        } while (!token.isNullOrEmpty() && out.size < 100_000)
        return out
    }

    private fun round1(v: Double): Double = Math.round(v * 10.0) / 10.0

    private fun round2(v: Double): Double = Math.round(v * 100.0) / 100.0

    /** Sleep sessions with their measured stages. Fast: one read. The overnight readings come from [readSleepVitals]. */
    @PluginMethod
    fun readSleep(call: PluginCall) {
        val days = call.getInt("days", 14) ?: 14
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val end = Instant.now()
                val start = end.minus(days.toLong(), ChronoUnit.DAYS)
                val resp = client().readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(start, end)))
                val sessions = JSArray()
                for (r in resp.records) {
                    val o = JSObject()
                    o.put("id", r.metadata.id)
                    o.put("start", r.startTime.toEpochMilli())
                    o.put("end", r.endTime.toEpochMilli())
                    o.put("offsetSeconds", r.endZoneOffset?.totalSeconds ?: 0)
                    o.put("source", r.metadata.dataOrigin.packageName)
                    val stages = JSArray()
                    for (s in r.stages) {
                        val row = JSArray()
                        row.put(s.stage)
                        row.put(s.startTime.toEpochMilli())
                        row.put(s.endTime.toEpochMilli())
                        stages.put(row)
                    }
                    o.put("stages", stages)
                    sessions.put(o)
                }
                val out = JSObject()
                out.put("sessions", sessions)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read sleep: ${e.message}")
            }
        }
    }

    /**
     * The overnight readings the watch saved for the given nights ({id, start, end}): heart rate (average, lowest, highest),
     * HRV, breathing rate, blood oxygen and skin temperature change. Each Health Connect call costs about two seconds on a
     * phone, so the app asks for a few nights at a time. A reading that was not recorded or not shared is left out.
     */
    @PluginMethod
    fun readSleepVitals(call: PluginCall) {
        val nights = call.getArray("nights")
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val list = (0 until (nights?.length() ?: 0)).map { nights!!.getJSONObject(it) }
                if (list.isEmpty()) {
                    call.resolve(JSObject().also { it.put("nights", JSArray()) })
                    return@launch
                }
                val from = Instant.ofEpochMilli(list.minOf { it.getLong("start") })
                val to = Instant.ofEpochMilli(list.maxOf { it.getLong("end") })
                val range = TimeRangeFilter.between(from, to)
                // Read once for all the nights, then match each reading to its night.
                val heart = try { readAll(HeartRateRecord::class, range) } catch (e: Exception) { emptyList() }
                val hrv = try { readAll(HeartRateVariabilityRmssdRecord::class, range) } catch (e: Exception) { emptyList() }
                val breathing = try { readAll(RespiratoryRateRecord::class, range) } catch (e: Exception) { emptyList() }
                val oxygen = try { readAll(OxygenSaturationRecord::class, range) } catch (e: Exception) { emptyList() }
                val skin = try { readAll(SkinTemperatureRecord::class, range) } catch (e: Exception) { emptyList() }

                val out = JSArray()
                for (n in list) {
                    val start = Instant.ofEpochMilli(n.getLong("start"))
                    val end = Instant.ofEpochMilli(n.getLong("end"))
                    val o = JSObject()
                    o.put("id", n.getString("id"))
                    try {
                        val agg = client().aggregate(
                            AggregateRequest(
                                setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MIN, HeartRateRecord.BPM_MAX),
                                TimeRangeFilter.between(start, end),
                            )
                        )
                        val avg = agg[HeartRateRecord.BPM_AVG]
                        if (avg != null && avg > 0) {
                            o.put("hrAvg", avg)
                            o.put("hrMin", agg[HeartRateRecord.BPM_MIN] ?: avg)
                            o.put("hrMax", agg[HeartRateRecord.BPM_MAX] ?: avg)
                        }
                    } catch (e: Exception) {
                        // heart rate not shared
                    }
                    // The night's heart rate as five-minute averages, for the curve on the Sleep screen.
                    val buckets = java.util.TreeMap<Long, MutableList<Long>>()
                    for (rec in heart) for (s in rec.samples) {
                        if (s.time < start || s.time > end || s.beatsPerMinute !in 25..250) continue
                        buckets.getOrPut(s.time.toEpochMilli() / 300_000L * 300_000L) { mutableListOf() }.add(s.beatsPerMinute)
                    }
                    if (buckets.size >= 6) {
                        val series = JSArray()
                        for ((t, v) in buckets) series.put(JSArray().also { it.put(t); it.put(Math.round(v.average())) })
                        o.put("hrSeries", series)
                    }
                    val hv = hrv.filter { it.time >= start && it.time <= end }.map { it.heartRateVariabilityMillis }.filter { it > 0 }
                    if (hv.isNotEmpty()) {
                        o.put("hrvAvg", round1(hv.average()))
                        o.put("hrvCount", hv.size)
                    }
                    val br = breathing.filter { it.time >= start && it.time <= end }.map { it.rate }.filter { it > 0 }
                    if (br.isNotEmpty()) o.put("respAvg", round1(br.average()))
                    val ox = oxygen.filter { it.time >= start && it.time <= end }.map { it.percentage.value }.filter { it > 0 }
                    if (ox.isNotEmpty()) {
                        o.put("spo2Avg", round1(ox.average()))
                        o.put("spo2Min", round1(ox.minOrNull() ?: ox.first()))
                    }
                    val deltas = skin.filter { it.endTime >= start && it.startTime <= end }
                        .flatMap { rec -> rec.deltas.filter { d -> d.time >= start && d.time <= end }.map { d -> d.delta.inCelsius } }
                    if (deltas.isNotEmpty()) o.put("skinDelta", round2(deltas.average()))
                    out.put(o)
                }
                call.resolve(JSObject().also { it.put("nights", out) })
            } catch (e: Exception) {
                call.reject("Could not read overnight readings: ${e.message}")
            }
        }
    }

    /**
     * Daily fitness numbers for the last `days` days: heart-rate range, resting heart rate, floors, exercise minutes and
     * HRV, plus the VO2 max history (cardio fitness). Each group is read on its own so a data type that was not shared
     * only removes its own numbers.
     */
    @PluginMethod
    fun readFitness(call: PluginCall) {
        val days = call.getInt("days", 30) ?: 30
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val firstDay = LocalDate.now().minusDays((days - 1).toLong())
                val range = TimeRangeFilter.between(firstDay.atStartOfDay(), LocalDateTime.now())
                val byDate = sortedMapOf<String, JSObject>()
                fun day(date: String): JSObject = byDate.getOrPut(date) { JSObject().also { it.put("date", date) } }

                // One request for everything that can be summed or averaged per day. If a permission is missing the whole
                // request fails, and each group is then read on its own so only that group goes missing.
                fun fillDay(b: androidx.health.connect.client.aggregate.AggregationResultGroupedByPeriod) {
                    val avg = b.result[HeartRateRecord.BPM_AVG]
                    val rest = b.result[RestingHeartRateRecord.BPM_AVG]
                    val floors = b.result[FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL]
                    val exercise = b.result[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]
                    val date = b.startTime.toLocalDate().toString()
                    if (avg != null && avg > 0) {
                        val d = day(date)
                        d.put("hrAvg", avg)
                        d.put("hrMin", b.result[HeartRateRecord.BPM_MIN] ?: avg)
                        d.put("hrMax", b.result[HeartRateRecord.BPM_MAX] ?: avg)
                    }
                    if (rest != null && rest > 0) day(date).put("restingHr", rest)
                    if (floors != null && floors > 0) day(date).put("floors", Math.round(floors))
                    if (exercise != null && exercise.toMinutes() > 0) day(date).put("exerciseMin", exercise.toMinutes())
                }
                val groups = listOf(
                    setOf(
                        HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MIN, HeartRateRecord.BPM_MAX, RestingHeartRateRecord.BPM_AVG,
                        FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL, ExerciseSessionRecord.EXERCISE_DURATION_TOTAL,
                    ),
                )
                var combinedOk = false
                try {
                    client().aggregateGroupByPeriod(AggregateGroupByPeriodRequest(groups[0], range, Period.ofDays(1))).forEach { fillDay(it) }
                    combinedOk = true
                } catch (e: Exception) {
                    // fall back to one group at a time below
                }
                if (!combinedOk) {
                    val each = listOf(
                        setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MIN, HeartRateRecord.BPM_MAX),
                        setOf(RestingHeartRateRecord.BPM_AVG),
                        setOf(FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL),
                        setOf(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL),
                    )
                    for (metrics in each) {
                        try {
                            client().aggregateGroupByPeriod(AggregateGroupByPeriodRequest(metrics, range, Period.ofDays(1))).forEach { fillDay(it) }
                        } catch (e: Exception) {
                            // that group is not shared
                        }
                    }
                }
                try {
                    val zone = ZoneId.systemDefault()
                    val instants = TimeRangeFilter.between(firstDay.atStartOfDay(zone).toInstant(), Instant.now())
                    readAll(HeartRateVariabilityRmssdRecord::class, instants)
                        .groupBy { it.time.atZone(zone).toLocalDate().toString() }
                        .forEach { (date, list) ->
                            val v = list.map { it.heartRateVariabilityMillis }.filter { it > 0 }
                            if (v.isNotEmpty()) day(date).put("hrvMs", round1(v.average()))
                        }
                } catch (e: Exception) {
                    // HRV not shared
                }
                val vo2 = JSArray()
                try {
                    val now = Instant.now()
                    readAll(Vo2MaxRecord::class, TimeRangeFilter.between(now.minus(365, ChronoUnit.DAYS), now))
                        .sortedBy { it.time }
                        .forEach {
                            val row = JSArray()
                            row.put(it.time.toEpochMilli())
                            row.put(round1(it.vo2MillilitersPerMinuteKilogram))
                            vo2.put(row)
                        }
                } catch (e: Exception) {
                    // cardio fitness not shared
                }
                val arr = JSArray()
                byDate.values.forEach { arr.put(it) }
                val out = JSObject()
                out.put("days", arr)
                out.put("vo2", vo2)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read fitness data: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun readSteps(call: PluginCall) {
        val days = call.getInt("days", 7) ?: 7
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val firstDay = LocalDate.now().minusDays((days - 1).toLong())
                val buckets = client().aggregateGroupByPeriod(
                    AggregateGroupByPeriodRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(firstDay.atStartOfDay(), LocalDateTime.now()),
                        timeRangeSlicer = Period.ofDays(1),
                    )
                )
                val arr = JSArray()
                for (b in buckets) {
                    val o = JSObject()
                    o.put("date", b.startTime.toLocalDate().toString())
                    o.put("steps", b.result[StepsRecord.COUNT_TOTAL] ?: 0L)
                    arr.put(o)
                }
                val out = JSObject()
                out.put("days", arr)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read steps: ${e.message}")
            }
        }
    }

    /** Steps in one-hour pieces for the last `days` days, as [start ms, end ms, steps]: lets a period such as a drive be taken out. */
    @PluginMethod
    fun readStepBuckets(call: PluginCall) {
        val days = call.getInt("days", 3) ?: 3
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val from = LocalDate.now().minusDays((days - 1).toLong()).atStartOfDay(ZoneId.systemDefault()).toInstant()
                val buckets = client().aggregateGroupByDuration(
                    AggregateGroupByDurationRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(from, Instant.now()),
                        timeRangeSlicer = Duration.ofHours(1),
                    )
                )
                val arr = JSArray()
                for (b in buckets) {
                    val n = b.result[StepsRecord.COUNT_TOTAL] ?: 0L
                    if (n <= 0L) continue
                    val row = JSArray()
                    row.put(b.startTime.toEpochMilli())
                    row.put(b.endTime.toEpochMilli())
                    row.put(n)
                    arr.put(row)
                }
                val out = JSObject()
                out.put("buckets", arr)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read steps by hour: ${e.message}")
            }
        }
    }

    /** Daily calories, distance and average heart rate for the last `days` days. */
    @PluginMethod
    fun readDaily(call: PluginCall) {
        val days = call.getInt("days", 7) ?: 7
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val firstDay = LocalDate.now().minusDays((days - 1).toLong())
                val buckets = client().aggregateGroupByPeriod(
                    AggregateGroupByPeriodRequest(
                        metrics = setOf(
                            TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                            ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                            DistanceRecord.DISTANCE_TOTAL,
                            HeartRateRecord.BPM_AVG,
                        ),
                        timeRangeFilter = TimeRangeFilter.between(firstDay.atStartOfDay(), LocalDateTime.now()),
                        timeRangeSlicer = Period.ofDays(1),
                    )
                )
                val arr = JSArray()
                for (b in buckets) {
                    val o = JSObject()
                    o.put("date", b.startTime.toLocalDate().toString())
                    o.put("totalKcal", b.result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories ?: 0.0)
                    o.put("activeKcal", b.result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0)
                    o.put("distanceKm", (b.result[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0) / 1000.0)
                    o.put("avgHr", b.result[HeartRateRecord.BPM_AVG] ?: 0L)
                    arr.put(o)
                }
                val out = JSObject()
                out.put("days", arr)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read daily totals: ${e.message}")
            }
        }
    }

    /** Heart-rate readings from the last `hours` hours as [epoch ms, bpm], thinned to at most 1500. */
    @PluginMethod
    fun readHeartRate(call: PluginCall) {
        val hours = call.getInt("hours", 24) ?: 24
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val end = Instant.now()
                val start = end.minus(hours.toLong(), ChronoUnit.HOURS)
                val resp = client().readRecords(
                    ReadRecordsRequest(HeartRateRecord::class, TimeRangeFilter.between(start, end))
                )
                val all = resp.records.flatMap { it.samples }.sortedBy { it.time }
                val step = Math.max(1, all.size / 1500)
                val samples = JSArray()
                all.forEachIndexed { i, s ->
                    if (i % step == 0) {
                        val row = JSArray()
                        row.put(s.time.toEpochMilli())
                        row.put(s.beatsPerMinute)
                        samples.put(row)
                    }
                }
                val resting = client().readRecords(
                    ReadRecordsRequest(RestingHeartRateRecord::class, TimeRangeFilter.between(start.minus(7, ChronoUnit.DAYS), end))
                ).records.maxByOrNull { it.time }
                val out = JSObject()
                out.put("samples", samples)
                out.put("restingBpm", resting?.beatsPerMinute ?: 0L)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read heart rate: ${e.message}")
            }
        }
    }

    /** Weight, body fat and height entries from the last `days` days. */
    @PluginMethod
    fun readBody(call: PluginCall) {
        val days = call.getInt("days", 90) ?: 90
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val end = Instant.now()
                val filter = TimeRangeFilter.between(end.minus(days.toLong(), ChronoUnit.DAYS), end)
                val weights = JSArray()
                client().readRecords(ReadRecordsRequest(WeightRecord::class, filter)).records.forEach {
                    val o = JSObject()
                    o.put("id", it.metadata.id)
                    o.put("time", it.time.toEpochMilli())
                    o.put("kg", it.weight.inKilograms)
                    o.put("own", it.metadata.dataOrigin.packageName == context.packageName)
                    weights.put(o)
                }
                val fats = JSArray()
                client().readRecords(ReadRecordsRequest(BodyFatRecord::class, filter)).records.forEach {
                    val o = JSObject()
                    o.put("time", it.time.toEpochMilli())
                    o.put("pct", it.percentage.value)
                    fats.put(o)
                }
                val height = client().readRecords(ReadRecordsRequest(HeightRecord::class, filter)).records.maxByOrNull { it.time }
                val out = JSObject()
                out.put("weights", weights)
                out.put("bodyFat", fats)
                out.put("heightCm", (height?.height?.inMeters ?: 0.0) * 100.0)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read body measurements: ${e.message}")
            }
        }
    }

    /** Workouts other apps and the watch recorded in the last `days` days. */
    @PluginMethod
    fun readExercise(call: PluginCall) {
        val days = call.getInt("days", 30) ?: 30
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val end = Instant.now()
                val resp = client().readRecords(
                    ReadRecordsRequest(
                        ExerciseSessionRecord::class,
                        TimeRangeFilter.between(end.minus(days.toLong(), ChronoUnit.DAYS), end),
                    )
                )
                val arr = JSArray()
                for (r in resp.records) {
                    val o = JSObject()
                    o.put("id", r.metadata.id)
                    o.put("type", r.exerciseType)
                    o.put("title", r.title ?: "")
                    o.put("start", r.startTime.toEpochMilli())
                    o.put("end", r.endTime.toEpochMilli())
                    o.put("source", r.metadata.dataOrigin.packageName)
                    o.put("own", r.metadata.dataOrigin.packageName == context.packageName)
                    arr.put(o)
                }
                val out = JSObject()
                out.put("sessions", arr)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read workouts: ${e.message}")
            }
        }
    }

    /**
     * Workouts other apps recorded (Google Health / Fitbit, Strava and so on) with their distance, calories and heart rate, so the app
     * can show them in its own list. Sessions this app wrote itself and ids in `skip` are left out. Every session costs two Health
     * Connect calls (a summary and the heart-rate samples), which is slow on a phone, so at most `max` of the newest are returned
     * per call and `remaining` says how many are still waiting. Routes other apps recorded need a separate permission and are not read.
     */
    @PluginMethod
    fun readWorkouts(call: PluginCall) {
        val days = call.getInt("days", 30) ?: 30
        val max = call.getInt("max", 8) ?: 8
        val skipArr = call.getArray("skip")
        val skip = (0 until (skipArr?.length() ?: 0)).map { skipArr!!.getString(it) }.toSet()
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val end = Instant.now()
                val all = client().readRecords(
                    ReadRecordsRequest(
                        ExerciseSessionRecord::class,
                        TimeRangeFilter.between(end.minus(days.toLong(), ChronoUnit.DAYS), end),
                    )
                ).records
                val fresh = all
                    .filter { it.metadata.dataOrigin.packageName != context.packageName && !skip.contains(it.metadata.id) && it.endTime.isAfter(it.startTime) }
                    .sortedByDescending { it.startTime }
                val arr = JSArray()
                for (r in fresh.take(max)) {
                    val o = JSObject()
                    o.put("id", r.metadata.id)
                    o.put("type", r.exerciseType)
                    o.put("title", r.title ?: "")
                    o.put("notes", r.notes ?: "")
                    o.put("start", r.startTime.toEpochMilli())
                    o.put("end", r.endTime.toEpochMilli())
                    o.put("source", r.metadata.dataOrigin.packageName)
                    val range = TimeRangeFilter.between(r.startTime, r.endTime)
                    try {
                        val agg = client().aggregate(
                            AggregateRequest(
                                setOf(
                                    DistanceRecord.DISTANCE_TOTAL, TotalCaloriesBurnedRecord.ENERGY_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                                    HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MAX,
                                ),
                                range,
                            )
                        )
                        o.put("distanceM", agg[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0)
                        o.put("totalKcal", agg[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories ?: 0.0)
                        o.put("activeKcal", agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0)
                        o.put("hrAvg", agg[HeartRateRecord.BPM_AVG] ?: 0L)
                        o.put("hrMax", agg[HeartRateRecord.BPM_MAX] ?: 0L)
                    } catch (e: Exception) {
                        // summary not shared: the session is still listed with its times
                    }
                    val hr = JSArray()
                    try {
                        for (rec in readAll(HeartRateRecord::class, range)) {
                            for (s in rec.samples) {
                                if (s.time.isBefore(r.startTime) || s.time.isAfter(r.endTime)) continue
                                hr.put(JSArray().also { it.put(s.time.toEpochMilli()); it.put(s.beatsPerMinute) })
                            }
                        }
                    } catch (e: Exception) {
                        // heart rate not shared
                    }
                    o.put("hr", hr)
                    arr.put(o)
                }
                val out = JSObject()
                out.put("sessions", arr)
                out.put("remaining", Math.max(0, fresh.size - max))
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read workouts: ${e.message}")
            }
        }
    }

    // ------------------------------------------------------------------ writes

    private fun exerciseType(type: String): Int = when (type) {
        "Running" -> ExerciseSessionRecord.EXERCISE_TYPE_RUNNING
        "Treadmill" -> ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL
        "Walking" -> ExerciseSessionRecord.EXERCISE_TYPE_WALKING
        "Hiking" -> ExerciseSessionRecord.EXERCISE_TYPE_HIKING
        "Cycling" -> ExerciseSessionRecord.EXERCISE_TYPE_BIKING
        "IndoorCycling" -> ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY
        "Rowing" -> ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE
        "Strength" -> ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING
        "HIIT" -> ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING
        "Yoga" -> ExerciseSessionRecord.EXERCISE_TYPE_YOGA
        "Elliptical" -> ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL
        "Calisthenics", "Core" -> ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS
        "Mobility", "Stretching" -> ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING
        "Swimming" -> ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL
        "OpenWaterSwim" -> ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER
        "StairClimbing" -> ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING
        "Dance" -> ExerciseSessionRecord.EXERCISE_TYPE_DANCING
        "Pilates" -> ExerciseSessionRecord.EXERCISE_TYPE_PILATES
        "AlpineSkiing", "CrossCountrySkiing" -> ExerciseSessionRecord.EXERCISE_TYPE_SKIING
        "Snowboarding" -> ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING
        "Snowshoeing" -> ExerciseSessionRecord.EXERCISE_TYPE_SNOWSHOEING
        "IceSkating" -> ExerciseSessionRecord.EXERCISE_TYPE_ICE_SKATING
        "Kayaking", "Paddleboarding" -> ExerciseSessionRecord.EXERCISE_TYPE_PADDLING
        else -> ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT
    }

    private fun meta(id: String, live: Boolean): Metadata =
        if (live) Metadata.activelyRecorded(Device(type = Device.TYPE_PHONE), clientRecordId = id)
        else Metadata.manualEntry(clientRecordId = id)

    private suspend fun insert(call: PluginCall, records: List<Record>, what: String) {
        try {
            if (!available()) {
                call.reject("Health Connect is not available.")
                return
            }
            if (records.isEmpty()) {
                call.resolve()
                return
            }
            // Health Connect takes at most 1000 records in one call, so a long batch goes in pieces. Every record carries its own
            // clientRecordId, so a piece sent twice (a retry, or the same workout from phone and watch) updates instead of duplicating.
            for (piece in records.chunked(1000)) client().insertRecords(piece)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Could not save $what to Health Connect: ${e.message}")
        }
    }

    /**
     * Saves a finished workout: the session (with GPS route when there is one), distance, calories and heart
     * rate. Uses the app's own id so saving the same workout twice updates it instead of duplicating it.
     */
    @PluginMethod
    fun writeWorkout(call: PluginCall) {
        scope.launch {
            val id = call.getString("id") ?: return@launch call.reject("Missing id")
            val type = call.getString("type") ?: "Other"
            val startMs = call.getDouble("start")?.toLong() ?: return@launch call.reject("Missing start")
            val endMs = call.getDouble("end")?.toLong() ?: return@launch call.reject("Missing end")
            if (endMs <= startMs) return@launch call.reject("Workout has no duration")
            val live = call.getBoolean("live", false) ?: false
            val start = Instant.ofEpochMilli(startMs)
            val end = Instant.ofEpochMilli(endMs)
            val so = offset(start)
            val eo = offset(end)
            val records = mutableListOf<Record>()

            var route: ExerciseRoute? = null
            val routeArr = call.getArray("route")
            if (routeArr != null && routeArr.length() >= 2) {
                val points = mutableListOf<ExerciseRoute.Location>()
                for (i in 0 until routeArr.length()) {
                    val p = routeArr.getJSONArray(i)
                    val t = Instant.ofEpochMilli(p.getLong(0))
                    if (t.isBefore(start) || t.isAfter(end)) continue
                    val alt = if (p.isNull(3)) null else Length.meters(p.getDouble(3))
                    points.add(ExerciseRoute.Location(time = t, latitude = p.getDouble(1), longitude = p.getDouble(2), altitude = alt))
                }
                if (points.size >= 2) {
                    val step = (points.size + MAX_SAMPLES - 1) / MAX_SAMPLES
                    val kept = if (step > 1) points.filterIndexed { i, _ -> i % step == 0 || i == points.size - 1 } else points
                    route = ExerciseRoute(kept)
                }
            }
            records.add(
                ExerciseSessionRecord(
                    startTime = start,
                    startZoneOffset = so,
                    endTime = end,
                    endZoneOffset = eo,
                    metadata = meta(id, live),
                    exerciseType = exerciseType(type),
                    title = call.getString("title"),
                    notes = call.getString("notes"),
                    exerciseRoute = route,
                )
            )
            val km = call.getDouble("distanceKm") ?: 0.0
            if (km > 0.0) {
                records.add(DistanceRecord(start, so, end, eo, Length.kilometers(km), meta("$id-dist", live)))
            }
            val kcal = call.getDouble("kcal") ?: 0.0
            if (kcal > 0.0) {
                records.add(TotalCaloriesBurnedRecord(start, so, end, eo, Energy.kilocalories(kcal), meta("$id-kcal", live)))
            }
            val hrArr = call.getArray("hr")
            if (hrArr != null && hrArr.length() > 0) {
                val samples = mutableListOf<HeartRateRecord.Sample>()
                for (i in 0 until hrArr.length()) {
                    val p = hrArr.getJSONArray(i)
                    val t = Instant.ofEpochMilli(p.getLong(0))
                    val bpm = p.getLong(1)
                    if (!t.isBefore(start) && !t.isAfter(end) && bpm in 20..250) samples.add(HeartRateRecord.Sample(t, bpm))
                }
                if (samples.isNotEmpty()) {
                    // A very long workout is thinned to an even spread so one record never grows past what Health Connect accepts.
                    val step = (samples.size + MAX_SAMPLES - 1) / MAX_SAMPLES
                    val kept = if (step > 1) samples.filterIndexed { i, _ -> i % step == 0 } else samples
                    records.add(HeartRateRecord(start, so, end, eo, kept, meta("$id-hr", live)))
                }
            }
            insert(call, records, "the workout")
        }
    }

    /** Weight (and body fat when given) at a moment in time. */
    @PluginMethod
    fun writeBody(call: PluginCall) {
        scope.launch {
            val id = call.getString("id") ?: return@launch call.reject("Missing id")
            val timeMs = call.getDouble("time")?.toLong() ?: return@launch call.reject("Missing time")
            val t = Instant.ofEpochMilli(timeMs)
            val off = offset(t)
            val records = mutableListOf<Record>()
            val kg = call.getDouble("weightKg") ?: 0.0
            if (kg > 0.0) records.add(WeightRecord(t, off, Mass.kilograms(kg), meta(id, false)))
            val fat = call.getDouble("bodyFatPct") ?: 0.0
            if (fat > 0.0) records.add(BodyFatRecord(t, off, Percentage(fat), meta("$id-fat", false)))
            insert(call, records, "your measurements")
        }
    }

    /** One logged food as a nutrition record. */
    @PluginMethod
    fun writeNutrition(call: PluginCall) {
        scope.launch {
            val id = call.getString("id") ?: return@launch call.reject("Missing id")
            val startMs = call.getDouble("start")?.toLong() ?: return@launch call.reject("Missing start")
            val start = Instant.ofEpochMilli(startMs)
            val end = start.plusSeconds(60)
            val meal = when (call.getString("meal")) {
                "Breakfast" -> MealType.MEAL_TYPE_BREAKFAST
                "Lunch" -> MealType.MEAL_TYPE_LUNCH
                "Dinner" -> MealType.MEAL_TYPE_DINNER
                else -> MealType.MEAL_TYPE_SNACK
            }
            val record = NutritionRecord(
                startTime = start,
                startZoneOffset = offset(start),
                endTime = end,
                endZoneOffset = offset(end),
                metadata = meta(id, false),
                name = call.getString("name"),
                mealType = meal,
                energy = Energy.kilocalories(call.getDouble("calories") ?: 0.0),
                protein = Mass.grams(call.getDouble("proteinG") ?: 0.0),
                totalCarbohydrate = Mass.grams(call.getDouble("carbsG") ?: 0.0),
                totalFat = Mass.grams(call.getDouble("fatG") ?: 0.0),
            )
            insert(call, listOf(record), "the meal")
        }
    }

    @PluginMethod
    fun writeHydration(call: PluginCall) {
        scope.launch {
            val id = call.getString("id") ?: return@launch call.reject("Missing id")
            val startMs = call.getDouble("start")?.toLong() ?: return@launch call.reject("Missing start")
            val ml = call.getDouble("ml") ?: 0.0
            if (ml <= 0.0) return@launch call.resolve()
            val start = Instant.ofEpochMilli(startMs)
            val end = start.plusSeconds(60)
            val record = HydrationRecord(start, offset(start), end, offset(end), Volume.milliliters(ml), meta(id, false))
            insert(call, listOf(record), "the water entry")
        }
    }

    /** A finished guided-breathing session, saved as a mindfulness session (Health Connect marks this record type as experimental). */
    @OptIn(ExperimentalMindfulnessSessionApi::class)
    @PluginMethod
    fun writeMindfulness(call: PluginCall) {
        scope.launch {
            val id = call.getString("id") ?: return@launch call.reject("Missing id")
            val startMs = call.getDouble("start")?.toLong() ?: return@launch call.reject("Missing start")
            val endMs = call.getDouble("end")?.toLong() ?: return@launch call.reject("Missing end")
            if (endMs <= startMs) return@launch call.resolve()
            val start = Instant.ofEpochMilli(startMs)
            val end = Instant.ofEpochMilli(endMs)
            try {
                val record = MindfulnessSessionRecord(
                    startTime = start,
                    startZoneOffset = offset(start),
                    endTime = end,
                    endZoneOffset = offset(end),
                    metadata = meta(id, false),
                    mindfulnessSessionType = MindfulnessSessionRecord.MINDFULNESS_SESSION_TYPE_BREATHING,
                    title = call.getString("title"),
                    notes = call.getString("notes"),
                )
                insert(call, listOf(record), "the breathing session")
            } catch (e: Throwable) {
                // an older Health Connect without mindfulness sessions: nothing to save, and nothing to report
                call.resolve()
            }
        }
    }

    /** A night of sleep with its stages ([stage, start ms, end ms] using Health Connect stage codes). */
    @PluginMethod
    fun writeSleep(call: PluginCall) {
        scope.launch {
            val id = call.getString("id") ?: return@launch call.reject("Missing id")
            val startMs = call.getDouble("start")?.toLong() ?: return@launch call.reject("Missing start")
            val endMs = call.getDouble("end")?.toLong() ?: return@launch call.reject("Missing end")
            if (endMs <= startMs) return@launch call.reject("Sleep has no duration")
            val start = Instant.ofEpochMilli(startMs)
            val end = Instant.ofEpochMilli(endMs)
            val stages = mutableListOf<SleepSessionRecord.Stage>()
            val arr = call.getArray("stages")
            if (arr != null) {
                for (i in 0 until arr.length()) {
                    val p = arr.getJSONArray(i)
                    val s = Instant.ofEpochMilli(p.getLong(1))
                    val e = Instant.ofEpochMilli(p.getLong(2))
                    if (e.isAfter(s) && !s.isBefore(start) && !e.isAfter(end)) stages.add(SleepSessionRecord.Stage(s, e, p.getInt(0)))
                }
            }
            val record = SleepSessionRecord(
                startTime = start,
                startZoneOffset = offset(start),
                endTime = end,
                endZoneOffset = offset(end),
                metadata = meta(id, false),
                title = call.getString("title"),
                notes = call.getString("notes"),
                stages = stages,
            )
            insert(call, listOf(record), "the sleep")
        }
    }

    /** A blood-pressure reading in mmHg. */
    @PluginMethod
    fun writeBloodPressure(call: PluginCall) {
        scope.launch {
            val id = call.getString("id") ?: return@launch call.reject("Missing id")
            val timeMs = call.getDouble("time")?.toLong() ?: return@launch call.reject("Missing time")
            val sys = call.getDouble("systolic") ?: return@launch call.reject("Missing systolic")
            val dia = call.getDouble("diastolic") ?: return@launch call.reject("Missing diastolic")
            val t = Instant.ofEpochMilli(timeMs)
            val record = BloodPressureRecord(
                time = t,
                zoneOffset = offset(t),
                systolic = Pressure.millimetersOfMercury(sys),
                diastolic = Pressure.millimetersOfMercury(dia),
                metadata = meta(id, false),
            )
            insert(call, listOf(record), "the blood pressure")
        }
    }

    /** A blood-glucose reading in mg/dL; `relation` is fasting, before, after or general. */
    @PluginMethod
    fun writeBloodGlucose(call: PluginCall) {
        scope.launch {
            val id = call.getString("id") ?: return@launch call.reject("Missing id")
            val timeMs = call.getDouble("time")?.toLong() ?: return@launch call.reject("Missing time")
            val mgdl = call.getDouble("mgdl") ?: return@launch call.reject("Missing value")
            val t = Instant.ofEpochMilli(timeMs)
            val relation = when (call.getString("relation")) {
                "fasting" -> BloodGlucoseRecord.RELATION_TO_MEAL_FASTING
                "before" -> BloodGlucoseRecord.RELATION_TO_MEAL_BEFORE_MEAL
                "after" -> BloodGlucoseRecord.RELATION_TO_MEAL_AFTER_MEAL
                else -> BloodGlucoseRecord.RELATION_TO_MEAL_GENERAL
            }
            val record = BloodGlucoseRecord(
                time = t,
                zoneOffset = offset(t),
                level = BloodGlucose.milligramsPerDeciliter(mgdl),
                specimenSource = BloodGlucoseRecord.SPECIMEN_SOURCE_CAPILLARY_BLOOD,
                relationToMeal = relation,
                metadata = meta(id, false),
            )
            insert(call, listOf(record), "the glucose reading")
        }
    }

    /** Blood pressure and glucose readings other apps and devices saved in the last `days` days. */
    @PluginMethod
    fun readLogs(call: PluginCall) {
        val days = call.getInt("days", 30) ?: 30
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val end = Instant.now()
                val filter = TimeRangeFilter.between(end.minus(days.toLong(), ChronoUnit.DAYS), end)
                val bp = JSArray()
                try {
                    client().readRecords(ReadRecordsRequest(BloodPressureRecord::class, filter)).records.forEach {
                        val o = JSObject()
                        o.put("id", it.metadata.id)
                        o.put("time", it.time.toEpochMilli())
                        o.put("systolic", it.systolic.inMillimetersOfMercury)
                        o.put("diastolic", it.diastolic.inMillimetersOfMercury)
                        o.put("own", it.metadata.dataOrigin.packageName == context.packageName)
                        bp.put(o)
                    }
                } catch (e: Exception) {
                    // blood pressure not shared
                }
                val glucose = JSArray()
                try {
                    client().readRecords(ReadRecordsRequest(BloodGlucoseRecord::class, filter)).records.forEach {
                        val o = JSObject()
                        o.put("id", it.metadata.id)
                        o.put("time", it.time.toEpochMilli())
                        o.put("mgdl", it.level.inMilligramsPerDeciliter)
                        o.put("own", it.metadata.dataOrigin.packageName == context.packageName)
                        glucose.put(o)
                    }
                } catch (e: Exception) {
                    // glucose not shared
                }
                val out = JSObject()
                out.put("bloodPressure", bp)
                out.put("glucose", glucose)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Could not read health logs: ${e.message}")
            }
        }
    }

    private val deletable: Map<String, KClass<out Record>> = mapOf(
        "bloodPressure" to BloodPressureRecord::class,
        "bloodGlucose" to BloodGlucoseRecord::class,
        "workout" to ExerciseSessionRecord::class,
        "distance" to DistanceRecord::class,
        "calories" to TotalCaloriesBurnedRecord::class,
        "heartRate" to HeartRateRecord::class,
        "weight" to WeightRecord::class,
        "bodyFat" to BodyFatRecord::class,
        "nutrition" to NutritionRecord::class,
        "hydration" to HydrationRecord::class,
        "sleep" to SleepSessionRecord::class,
        "mindfulness" to MindfulnessSessionRecord::class,
    )

    /** Removes records this app wrote earlier, by the ids it used (e.g. when you delete a workout). */
    @PluginMethod
    fun deleteRecords(call: PluginCall) {
        scope.launch {
            try {
                if (!available()) {
                    call.reject("Health Connect is not available.")
                    return@launch
                }
                val kind = call.getString("kind") ?: return@launch call.reject("Missing kind")
                val cls = deletable[kind] ?: return@launch call.reject("Unknown kind")
                val arr = call.getArray("ids") ?: return@launch call.resolve()
                val ids = (0 until arr.length()).map { arr.getString(it) }
                if (ids.isNotEmpty()) client().deleteRecords(cls, emptyList(), ids)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Could not delete from Health Connect: ${e.message}")
            }
        }
    }
}

