/** A new id for something the person logs, e.g. `f-1767614400000-k3x9`. Ids only have to be different from each other. */
export const makeId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
