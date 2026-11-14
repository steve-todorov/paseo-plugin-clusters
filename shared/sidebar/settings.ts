import { defineSettings } from "@getpaseo/plugin";
import { SidebarSettingsSchema } from "./preferences.ts";

/**
 * The Clusters view's display preferences and manual order. Device scope: like Paseo's own sidebar
 * view state they describe this screen, and they are kept apart from Paseo's settings on purpose.
 * Device documents need no server registration; the app stores them locally.
 */
export const sidebarSettings = defineSettings({
  id: "sidebar-view",
  scope: "device",
  version: 1,
  schema: SidebarSettingsSchema,
});
