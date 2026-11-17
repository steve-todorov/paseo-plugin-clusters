import type { PluginServerContext } from "@getpaseo/plugin/server";
import { handleReadProgress } from "./server/progress";
import { handleReadProjectIcon } from "./server/project-custom-icon";
import { readClusters, writeClusters } from "./server/storage";
import { handleReadWorkspaceLabels } from "./server/workspace-labels";
import { readProgress, readProjectIcon, readWorkspaceLabels } from "./shared/daemon-data";
import { readState, writeState } from "./shared/storage";

export default function contribute(server: PluginServerContext) {
  server.handle(readState, readClusters);
  server.handle(writeState, writeClusters);
  server.handle(readProjectIcon, handleReadProjectIcon);
  server.handle(readWorkspaceLabels, handleReadWorkspaceLabels);
  server.handle(readProgress, handleReadProgress);
  return () => {};
}
