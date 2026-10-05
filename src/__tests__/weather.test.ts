import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Weather, describeCode, mapWeather, runConditions } from '../lib/weather';

const base: Weather = { at: 0, tempC: 15, feelsC: 15, windKmh: 8, humidity: 50, rainChance: 10, code: 1 };

test('maps an Open-Meteo response', () => {
  const w = mapWeather(
    {
      current: { temperature_2m: 12.4, apparent_temperature: 10.1, wind_speed_10m: 18, relative_humidity_2m: 70, weather_code: 61 },
      hourly: { precipitation_probability: [10, 40, 80, 20, 5, 0, 99] },
    },
    123
  );
  assert.ok(w);
  assert.equal(w!.feelsC, 10.1);
  assert.equal(w!.rainChance, 80, 'looks at the next six hours only');
  assert.equal(describeCode(w!.code), 'Rain');
  assert.equal(mapWeather({}), null);
});

test('good conditions', () => {
  const c = runConditions(base);
  assert.equal(c.tone, 'good');
  assert.equal(c.label, 'Great for a run');
});

test('cold, hot, wind, rain and storms are called out', () => {
  assert.equal(runConditions({ ...base, feelsC: 0 }).tone, 'ok');
  assert.equal(runConditions({ ...base, feelsC: -12 }).tone, 'bad');
  assert.equal(runConditions({ ...base, feelsC: 30 }).tone, 'ok');
  assert.equal(runConditions({ ...base, feelsC: 36 }).tone, 'bad');
  assert.equal(runConditions({ ...base, windKmh: 30 }).tone, 'ok');
  assert.equal(runConditions({ ...base, windKmh: 45 }).tone, 'bad');
  assert.equal(runConditions({ ...base, rainChance: 80 }).tone, 'ok');
  assert.equal(runConditions({ ...base, code: 95 }).tone, 'bad');
});
