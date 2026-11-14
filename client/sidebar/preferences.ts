import { createContext, useContext } from "react";
import { DEFAULT_SIDEBAR_PREFERENCES, type SidebarPreferences } from "../../shared/sidebar/preferences";

/** The display preferences every row reads. Paseo's defaults until the view gets a settings menu. */
const PreferencesContext = createContext<SidebarPreferences>(DEFAULT_SIDEBAR_PREFERENCES);

export const SidebarPreferencesProvider = PreferencesContext.Provider;

export function useSidebarPreferences(): SidebarPreferences {
  return useContext(PreferencesContext);
}
