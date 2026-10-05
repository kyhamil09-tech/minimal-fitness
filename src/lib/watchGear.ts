import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { GearKind, Shoe, defaultShoe, gearOfKind, kindOf, shoeKm, shoeMessage, shoeState } from './shoes';
import { distanceUnit, kmToDisplay } from './units';

/** One pair of shoes or one bike as the watch shows it when you start a run or a ride. */
export interface WatchGearItem {
  id: string;
  name: string;
  kind: GearKind;
  /** Mileage so far against the replace-by or service-by distance, in the user's units, e.g. "412 / 800 km". */
  text: string;
  /** Empty, or a short warning such as "Time to replace these". */
  warn: string;
  /** The one the phone would pick for this kind of workout. */
  selected: boolean;
}

/** The active (not retired) shoes and bikes, with the phone's current choice marked, ready to send to the watch. */
export const buildWatchGear = (gear: Shoe[], workouts: WorkoutSession[], saved: Record<GearKind, string | null>, units: UnitSystem): WatchGearItem[] => {
  const out: WatchGearItem[] = [];
  for (const kind of ['shoe', 'bike'] as GearKind[]) {
    const list = gearOfKind(gear, kind).filter((g) => !g.retired);
    const chosen = defaultShoe(list, saved[kind]);
    for (const g of list) {
      const km = shoeKm(g, workouts);
      out.push({
        id: g.id,
        name: g.name,
        kind: kindOf(g),
        text: `${kmToDisplay(km, units, 0)} / ${kmToDisplay(g.retireKm, units, 0)} ${distanceUnit(units)}`,
        warn: shoeMessage(shoeState(km, g.retireKm), kind),
        selected: chosen?.id === g.id,
      });
    }
  }
  return out;
};
