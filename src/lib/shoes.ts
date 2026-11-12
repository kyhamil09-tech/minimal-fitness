import { WorkoutSession } from '../types/health';

export type GearKind = 'shoe' | 'bike';

export interface Shoe {
  id: string;
  name: string;
  /** Shoes (the default for older entries) or a bike. */
  kind?: GearKind;
  /** Kilometers already on the gear when you added it. */
  startKm: number;
  /** Replace-by distance for shoes, service-by distance for a bike, in kilometers. */
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

/** Total kilometers on a piece of gear: what it had when added plus every workout logged with it. */
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

export interface GearAlert {
  id: string;
  state: 'worn' | 'replace';
  title: string;
  body: string;
}

/** What has been said about each piece of gear, so each level is announced once ("worn" first, then "replace"). */
export type GearNotified = Record<string, 'worn' | 'replace'>;

/**
 * Alerts for gear that has crossed a threshold since the last time: 85 % of its distance ("worn") and the full distance ("replace").
 * Retired gear and gear already announced at that level (or a higher one) stay quiet. Returns the alerts and the updated record.
 */
export const gearAlerts = (gear: Shoe[], workouts: WorkoutSession[], notified: GearNotified): { alerts: GearAlert[]; notified: GearNotified } => {
  const next: GearNotified = { ...notified };
  const alerts: GearAlert[] = [];
  for (const g of gear) {
    if (g.retired) continue;
    const state = shoeState(shoeKm(g, workouts), g.retireKm);
    if (state === 'good') {
      // Back under the line (a longer replace-by distance was set): start over for this one.
      delete next[g.id];
      continue;
    }
    const said = next[g.id];
    if (said === 'replace' || said === state) continue;
    next[g.id] = state;
    const bike = kindOf(g) === 'bike';
    alerts.push({
      id: g.id,
      state,
      title: state === 'replace' ? (bike ? `${g.name}: service due` : `${g.name}: time for a new pair`) : bike ? `${g.name}: service coming up` : `${g.name} is getting worn`,
      body: `${shoeMessage(state, kindOf(g))}. ${Math.round(shoeKm(g, workouts))} of ${Math.round(g.retireKm)} km.`,
    });
  }
  return { alerts, notified: next };
};
