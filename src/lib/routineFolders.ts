import type { Routine } from '../types/tracking';

/**
 * Folders for routines (Push / Pull / Legs in one folder, a program in another). A folder is just a name: each routine says which folder
 * it is in, and the list of folder names is kept separately so an empty folder can exist. Nothing here touches the exercises in a routine.
 */

export const MAX_FOLDERS = 20;
export const MAX_FOLDER_NAME = 30;

export const cleanFolderName = (name: string): string => name.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME);

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Adds a folder. Returns the new list, or an error in plain words (no name, a duplicate, too many). */
export const addFolder = (folders: string[], name: string): string[] | { error: string } => {
  const n = cleanFolderName(name);
  if (!n) return { error: 'Give the folder a name.' };
  if (folders.some((f) => same(f, n))) return { error: 'You already have a folder with that name.' };
  if (folders.length >= MAX_FOLDERS) return { error: `You can have up to ${MAX_FOLDERS} folders.` };
  return [...folders, n];
};

/** Renames a folder and moves its routines with it. */
export const renameFolder = (folders: string[], routines: Routine[], from: string, to: string): { folders: string[]; routines: Routine[] } | { error: string } => {
  const n = cleanFolderName(to);
  if (!n) return { error: 'Give the folder a name.' };
  if (!same(from, n) && folders.some((f) => same(f, n))) return { error: 'You already have a folder with that name.' };
  return {
    folders: folders.map((f) => (f === from ? n : f)),
    routines: routines.map((r) => (r.folder === from ? { ...r, folder: n } : r)),
  };
};

/** Removes a folder. Its routines are kept and move out to the main list. */
export const deleteFolder = (folders: string[], routines: Routine[], name: string): { folders: string[]; routines: Routine[] } => ({
  folders: folders.filter((f) => f !== name),
  routines: routines.map((r) => {
    if (r.folder !== name) return r;
    const { folder: _gone, ...rest } = r;
    void _gone;
    return rest;
  }),
});

/** Puts one routine in a folder, or in no folder when `folder` is undefined. */
export const moveRoutine = (routines: Routine[], id: string, folder: string | undefined): Routine[] =>
  routines.map((r) => {
    if (r.id !== id) return r;
    if (!folder) {
      const { folder: _gone, ...rest } = r;
      void _gone;
      return rest;
    }
    return { ...r, folder };
  });

export interface RoutineGroup {
  /** The folder's name, or null for routines that are in none. */
  folder: string | null;
  routines: Routine[];
}

/**
 * The routines laid out for the screen: every folder in order (empty ones too), then the routines in no folder. A routine whose folder
 * is no longer in the list (a restored backup, say) is shown with the ones in no folder rather than lost.
 */
export const groupRoutines = (routines: Routine[], folders: string[]): RoutineGroup[] => {
  const known = new Set(folders);
  const groups: RoutineGroup[] = folders.map((f) => ({ folder: f, routines: routines.filter((r) => r.folder === f) }));
  const loose = routines.filter((r) => !r.folder || !known.has(r.folder));
  if (loose.length > 0 || folders.length === 0) groups.push({ folder: null, routines: loose });
  return groups;
};
