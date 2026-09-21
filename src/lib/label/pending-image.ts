// Holds the ONE image being analysed, in memory only. It is deliberately not in
// session state, the store, localStorage, or the audit log (site-contract §5, §11).
let pending: Blob | null = null;

export const setPendingImage = (blob: Blob): void => {
  pending = blob;
};
export const peekPendingImage = (): Blob | null => pending;
export const clearPendingImage = (): void => {
  pending = null;
};
