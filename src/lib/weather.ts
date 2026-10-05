/** Weather for a run, from Open-Meteo (free, no account). Only a rounded location is sent, and only after you turn it on. */

export interface Weather {
  at: number;
  /** Degrees Celsius. */
  tempC: number;
  feelsC: number;
  windKmh: number;
  humidity: number;
  /** Chance of rain over the next few hours, 0-100. */
  rainChance: number;
  /** WMO weather code. */
  code: number;
}

export interface Conditions {
  label: string;
  tone: 'good' | 'ok' | 'bad';
  tips: string[];
}

/** Short description for a WMO weather code. */
export const describeCode = (code: number): string => {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Mixed';
};

/** A plain verdict on whether it is a good time to run, with what to wear or watch for. */
export const runConditions = (w: Weather): Conditions => {
  const tips: string[] = [];
  let bad = false;
  let meh = false;
  if (w.code >= 95) {
    bad = true;
    tips.push('Thunderstorm nearby: stay in or use a treadmill');
  }
  if (w.feelsC <= -10 || w.feelsC >= 35) {
    bad = true;
    tips.push(w.feelsC <= 0 ? 'Dangerously cold: cover up or train indoors' : 'Very hot: go earlier or later and carry water');
  } else if (w.feelsC <= 2) {
    meh = true;
    tips.push('Cold: gloves and a hat help');
  } else if (w.feelsC >= 28) {
    meh = true;
    tips.push('Hot: slow your pace and drink more');
  }
  if (w.windKmh >= 40) {
    bad = true;
    tips.push('Very windy');
  } else if (w.windKmh >= 25) {
    meh = true;
    tips.push('Windy: start into the wind so it helps you home');
  }
  if (w.rainChance >= 70) {
    meh = true;
    tips.push('Rain likely: wear a shell and watch your footing');
  } else if (w.rainChance >= 40) {
    tips.push('Some chance of rain');
  }
  if (tips.length === 0) tips.push('Comfortable conditions for a run');
  return { label: bad ? 'Not ideal' : meh ? 'Okay' : 'Great for a run', tone: bad ? 'bad' : meh ? 'ok' : 'good', tips };
};

/** Pure mapper so the parsing is testable without network access. */
export const mapWeather = (json: any, now = Date.now()): Weather | null => {
  const c = json?.current;
  if (!c || typeof c.temperature_2m !== 'number') return null;
  const probs: number[] = Array.isArray(json?.hourly?.precipitation_probability) ? json.hourly.precipitation_probability : [];
  const next = probs.slice(0, 6).filter((n) => typeof n === 'number');
  return {
    at: now,
    tempC: c.temperature_2m,
    feelsC: typeof c.apparent_temperature === 'number' ? c.apparent_temperature : c.temperature_2m,
    windKmh: typeof c.wind_speed_10m === 'number' ? c.wind_speed_10m : 0,
    humidity: typeof c.relative_humidity_2m === 'number' ? c.relative_humidity_2m : 0,
    rainChance: next.length ? Math.max(...next) : 0,
    code: typeof c.weather_code === 'number' ? c.weather_code : 0,
  };
};

export const fetchWeather = async (lat: number, lng: number, signal?: AbortSignal): Promise<Weather> => {
  // Rounded to about 1 km so the exact spot you are standing is never sent.
  const la = lat.toFixed(2);
  const lo = lng.toFixed(2);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&hourly=precipitation_probability&forecast_hours=6&wind_speed_unit=kmh&timezone=auto`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('The weather service is unavailable right now.');
  const w = mapWeather(await res.json());
  if (!w) throw new Error('The weather service sent something unexpected.');
  return w;
};

export const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
export const kmhToMph = (k: number) => Math.round(k / 1.609344);
