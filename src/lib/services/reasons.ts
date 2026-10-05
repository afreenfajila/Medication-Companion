// Why help was asked for. Its own module so client code (request schemas, the
// session) can name a reason without bundling the services themselves.
export const HELP_REASONS = [
  "label-trouble",
  "medical-question",
  "record-conflict",
  "wellbeing",
  "help-requested",
] as const;
export type HelpReason = (typeof HELP_REASONS)[number];
