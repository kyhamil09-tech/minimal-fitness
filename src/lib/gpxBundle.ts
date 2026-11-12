import { zipSync, strToU8 } from 'fflate';
import { WorkoutSession } from '../types/health';
import { toGpx } from './workoutStats';
import { workoutPoints } from './routes';

/** The workouts that have a route worth exporting, oldest first. */
export const exportableWorkouts = (workouts: WorkoutSession[]): WorkoutSession[] =>
  workouts.filter((w) => w.startedAt && workoutPoints(w).length >= 2).sort((a, b) => (a.startedAt as number) - (b.startedAt as number));

/** One GPX file for each workout, named by date and sport, with a number added when two share a name. */
export const gpxFiles = (workouts: WorkoutSession[]): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const w of exportableWorkouts(workouts)) {
    const day = new Date(w.startedAt as number).toISOString().slice(0, 10);
    const base = `${day}-${w.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    let name = `${base}.gpx`;
    for (let n = 2; files[name]; n++) name = `${base}-${n}.gpx`;
    files[name] = toGpx(w);
  }
  return files;
};

/** All of them in one zip file, built on the phone. */
export const gpxZip = (workouts: WorkoutSession[]): Uint8Array => {
  const files = gpxFiles(workouts);
  const data: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) data[name] = strToU8(text);
  return zipSync(data, { level: 6 });
};
