import { useSyncExternalStore } from 'react';
import { Segment, readSegments, subscribeSegments, writeSegments } from '../lib/segments';

/** The saved segments, kept in step across every screen that shows them. */
export const useSegments = (): [Segment[], (next: Segment[]) => void] => {
  const list = useSyncExternalStore(subscribeSegments, readSegments, readSegments);
  return [list, writeSegments];
};
