import type { WorkoutType } from '../types/health';

/** Groupings of sports that behave alike in the app: how they are shown, and which ones use the phone's GPS. */

/** Winter sports on snow or ice. */
export const SNOW_SPORTS: ReadonlySet<WorkoutType> = new Set<WorkoutType>(['AlpineSkiing', 'CrossCountrySkiing', 'Snowboarding', 'Snowshoeing', 'IceSkating']);

/** Paddle sports on the water. */
export const PADDLE_SPORTS: ReadonlySet<WorkoutType> = new Set<WorkoutType>(['Kayaking', 'Paddleboarding']);

/** Sports where speed (km/h or mph) says more than pace (minutes per km or mile). */
export const SPEED_SPORTS: ReadonlySet<WorkoutType> = new Set<WorkoutType>([
  'Cycling',
  'IndoorCycling',
  'AlpineSkiing',
  'CrossCountrySkiing',
  'Snowboarding',
  'IceSkating',
  'Kayaking',
  'Paddleboarding',
]);

/** Sports that are mostly downhill, where the total descent is the number people want. */
export const DESCENT_SPORTS: ReadonlySet<WorkoutType> = new Set<WorkoutType>(['AlpineSkiing', 'Snowboarding']);

export const isSpeedSport = (type: string): boolean => SPEED_SPORTS.has(type as WorkoutType);
export const isDescentSport = (type: string): boolean => DESCENT_SPORTS.has(type as WorkoutType);
