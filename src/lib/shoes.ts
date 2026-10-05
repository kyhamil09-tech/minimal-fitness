import { WorkoutSession } from '../types/health';

export type GearKind = 'shoe' | 'bike';

export interface Shoe {
  id: string;
  name: string;
  /** Shoes (the default for older entries) or a bike. */
  kind?: GearKind;
  /** Kilometres already on the gear when you added it. */
  startKm: number;
  /** Replace-by distance for shoes, service-by distance for a bike, in kilometres. */
  retireKm: number;
  retired: boolean;
  addedAt: number;
}

/** Workout types where a pair of shoes gets worn. */
export const SHOE_SPORTS = new Set(['Running', 'Walking', 'Hiking', 'Treadmill']);

/** Workout types ridden on a bike you can add to Gear (a trainer ride is logged on the same bike). */
export const BIKE_SPORTS = new Set(['Cycling', 'IndoorCycling']);

/** Which kind of gear a workout type uses, or null for none. */
export const gearKindFor = (sport: string): GearKind | null => (SHOE_SPORTS.has(sport) ? 'shoe' : BIKE_SPORTS.has(sport) ? 'bike' : null);

export const kindOf = (g: Pick<Shoe, 'kind'>): GearKind => g.kind ?? 'shoe';

/** The gear of one kind. */
export const gearOfKind = (gear: Shoe[], kind: GearKind): Shoe[] => gear.filter((g) => kindOf(g) === kind);

/** Total kilometres on a piece of gear: what it had when added plus every workout logged with it. */
export const shoeKm = (shoe: Shoe, workouts: WorkoutSession[]): number =>
  shoe.startKm + workouts.reduce((s, w) => (w.shoeId === shoe.id ? s + (w.distanceKm ?? 0) : s), 0);

export type ShoeState = 'good' | 'worn' | 'replace';

export const shoeState = (km: number, retireKm: number): ShoeState =>
  km >= retireKm ? 'replace' : km >= retireKm * 0.85 ? 'worn' : 'good';

export const shoeMessage = (state: ShoeState, kind: GearKind = 'shoe'): string => {
  if (kind === 'bike') return state === 'replace' ? 'Service is due: chain, brakes and tyres' : state === 'worn' ? 'A service is coming up soon' : '';
  return state === 'replace' ? 'Time to replace these' : state === 'worn' ? 'Getting worn, start looking for a new pair' : '';
};

/** The saved choice for "no gear on this workout". */
export const NO_GEAR = 'none';

/** The one to preselect: the saved choice if it is still active, otherwise the first active one. */
export const defaultShoe = (shoes: Shoe[], savedId: string | null): Shoe | null => {
  // "none" is a deliberate choice not to log this workout against any gear.
  if (savedId === NO_GEAR) return null;
  const active = shoes.filter((s) => !s.retired);
  return active.find((s) => s.id === savedId) ?? active[0] ?? null;
};
