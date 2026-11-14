import { homedir } from "node:os";
import { join } from "node:path";

/** The daemon's home, resolved as Paseo resolves it. Shared by every client of this daemon. */
export const PASEO_HOME = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
