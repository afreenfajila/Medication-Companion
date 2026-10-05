// The one UI-only action a spoken command can trigger that the reducer doesn't
// own: "take the photo". The camera screen registers it while it can honour it
// and clears it on unmount.
let capture: (() => void) | null = null;

export function registerCapture(fn: (() => void) | null): void {
  capture = fn;
}

export function runCapture(): boolean {
  if (!capture) return false;
  capture();
  return true;
}
