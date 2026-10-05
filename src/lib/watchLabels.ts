import type { WatchLinkState } from '../hooks/useWatchHeartRate';

interface WatchLike {
  state: WatchLinkState;
  nodeName: string;
  bpm: number | null;
}

/** One-line description of the watch link for status rows and the top bar. */
export const watchStateLabel = ({ state, nodeName, bpm }: WatchLike): string => {
  const name = nodeName || 'Watch';
  switch (state) {
    case 'live':
      return `${name} · ${bpm} bpm live`;
    case 'waiting':
      return `${name} connected · start Minimal Fitness on the watch`;
    case 'no-app':
      return `${name} connected · install the Minimal Fitness watch app`;
    case 'no-watch':
      return 'No watch connected';
    case 'unavailable':
      return 'Watch link unavailable on this phone';
    default:
      return 'Watch link works in the Android app';
  }
};
