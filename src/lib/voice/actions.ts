// UI-only actions a spoken command can trigger (things the reducer doesn't own, like "take the photo").
// A screen registers its handler while it can honour the action and clears it on unmount.
type Actions = { capture: (() => void) | null };
const actions: Actions = { capture: null };

export function registerVoiceAction(name: keyof Actions, fn: (() => void) | null): void {
  actions[name] = fn;
}

export function runVoiceAction(name: keyof Actions): boolean {
  const fn = actions[name];
  if (!fn) return false;
  fn();
  return true;
}
