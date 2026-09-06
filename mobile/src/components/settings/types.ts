/**
 * View-model types for the locked Settings main screen (`SettingsView`).
 * Mirrors the pattern established for Plan/Groceries: separate from any
 * backend shape, mapped by settings.tsx.
 */

export type SettingsRowViewModel = {
  id: string;
  label: string;
  /** Right-side summary text. Omitted entirely when no real value exists - never a placeholder like "-" or "0". */
  summary?: string;
  onPress: () => void;
};

export type SettingsSectionViewModel = {
  id: string;
  title: string;
  rows: SettingsRowViewModel[];
};

export type SettingsActionViewModel = {
  id: string;
  label: string;
  /** Restrained red, reserved for Delete account. */
  destructive?: boolean;
  onPress: () => void;
};

export type SettingsViewModel = {
  sections: SettingsSectionViewModel[];
  actions: SettingsActionViewModel[];
};
