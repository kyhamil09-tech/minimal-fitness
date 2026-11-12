import React from 'react';
import { ArrowUp, Flag, Home } from 'lucide-react';
import { FollowState, relativeTurn, turnAdvice, turnText } from '../lib/routeFollow';
import { UnitSystem } from '../types/tracking';
import { distanceUnit, kmToDisplay } from '../lib/units';

interface Props {
  /** Null while there is no position yet. */
  state: FollowState | null;
  /** Direction you are moving, degrees from north, or null when you have barely moved. */
  heading: number | null;
  /** True to show the way back to the start instead of the route guidance. */
  homeMode: boolean;
  routeName?: string;
  units: UnitSystem;
  accent: string;
}

const dist = (km: number, units: UnitSystem) => {
  const m = units === 'imperial' ? km * 1609.344 : km * 1000;
  const small = m < 1000 ? Math.round(m / 10) * 10 : null;
  return small !== null ? `${small} ${units === 'imperial' ? 'yd' : 'm'}` : `${kmToDisplay(km, units, 2)} ${distanceUnit(units)}`;
};

/** A compact guide on the live run screen: on the route or not, which way to turn, how far to go. Or the way back to the start. */
export const FollowBanner: React.FC<Props> = ({ state, heading, homeMode, routeName, units, accent }) => {
  if (!state) {
    return (
      <div className="mx-4 mt-3 rounded-2xl glass-chip px-4 py-3 text-xs text-neutral-300" role="status">
        Waiting for your position…
      </div>
    );
  }
  const target = homeMode ? state.bearingToStart : state.bearingToRoute;
  const turn = heading === null ? null : relativeTurn(heading, target);
  const advice = turn === null ? null : turnAdvice(turn);
  const rotation = turn ?? target; // with no heading the arrow points at the compass bearing instead
  const off = !homeMode && state.isOff;
  const color = off ? '#FBBF24' : state.finished && !homeMode ? '#6EE7B7' : accent;

  let title: string;
  let sub: string;
  if (homeMode) {
    title = `Start is ${dist(state.toStartKm, units)} away`;
    sub = advice ? `${turnText(advice)}` : 'Keep moving to see which way to turn';
  } else if (state.finished) {
    title = 'You reached the end of the route';
    sub = routeName ?? '';
  } else if (off) {
    title = `Off the route by ${dist(state.offRouteM / 1000, units)}`;
    sub = advice ? `Head back: ${turnText(advice)}` : 'Keep moving to see which way back';
  } else {
    title = 'On the route';
    sub = `${dist(state.remainingKm, units)} to go${routeName ? ` · ${routeName}` : ''}`;
  }

  return (
    <div className="mx-4 mt-3 rounded-2xl border px-4 py-3 flex items-center gap-3" style={{ borderColor: `${color}66`, backgroundColor: `${color}14` }} role="status" aria-live="polite">
      <span className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}22`, color }}>
        {state.finished && !homeMode ? <Flag className="w-5 h-5" /> : off || homeMode ? <ArrowUp className="w-6 h-6" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.4s' }} /> : <Home className="hidden" />}
        {!off && !homeMode && !state.finished && <span className="text-xs font-extrabold">{Math.round((state.progressKm / Math.max(0.01, state.totalKm)) * 100)}%</span>}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-bold text-white leading-tight">{title}</div>
        <div className="text-xs text-neutral-300 mt-0.5 truncate">{sub}</div>
      </div>
    </div>
  );
};
