/**
 * Keys for the `system_settings` config table (§95). Values are looked up at
 * runtime so they can change without a deploy; these consts just keep the
 * key strings consistent between the seed script, SettingsService and admin UI.
 */
export const SystemSettingKey = {
  NEW_ORGANIZER_FREE_CREDITS: "newOrganizerFreeCredits",
  REVIEW_WINDOW_DAYS: "reviewWindowDays",
  FEED_PASS_COOLDOWN_DAYS: "feedPassCooldownDays",
  DEFAULT_REMINDER_HOURS: "defaultReminderHours",
} as const;
export type SystemSettingKey = (typeof SystemSettingKey)[keyof typeof SystemSettingKey];

/** Hard-coded fallback defaults, used only if a row is missing from the DB. */
export const SYSTEM_SETTING_DEFAULTS = {
  [SystemSettingKey.NEW_ORGANIZER_FREE_CREDITS]: 5,
  [SystemSettingKey.REVIEW_WINDOW_DAYS]: 7,
  [SystemSettingKey.FEED_PASS_COOLDOWN_DAYS]: 30,
  [SystemSettingKey.DEFAULT_REMINDER_HOURS]: [24, 1] as number[],
} as const;
