import assert from "node:assert/strict";
import { test } from "node:test";
import { type WorkspaceScriptLike, selectWorkspaceServiceSummary, workspaceServiceLabelKey } from "./service-summary.ts";

// Ported from Paseo's components/sidebar/workspace-meta-row/service-summary.test.ts (v0.16).

function script(overrides: Partial<WorkspaceScriptLike>): WorkspaceScriptLike {
  return { scriptName: "dev", type: "service", lifecycle: "running", health: null, ...overrides };
}

test("returns nothing when no service is running", () => {
  assert.equal(selectWorkspaceServiceSummary([]), null);
  assert.equal(selectWorkspaceServiceSummary([script({ lifecycle: "stopped" })]), null);
});

test("reports a running service by name", () => {
  assert.deepEqual(selectWorkspaceServiceSummary([script({ scriptName: "web" })]), { name: "web", health: null });
});

test("ignores plain commands entirely", () => {
  // A test watcher running says nothing about whether the workspace is up.
  assert.equal(selectWorkspaceServiceSummary([script({ scriptName: "test", type: "script" })]), null);
});

test("a script with no type is a service", () => {
  assert.deepEqual(selectWorkspaceServiceSummary([script({ scriptName: "web", type: undefined })]), { name: "web", health: null });
});

test("prefers an unhealthy service over a healthy one regardless of order", () => {
  assert.deepEqual(
    selectWorkspaceServiceSummary([script({ scriptName: "web", health: "healthy" }), script({ scriptName: "api", health: "unhealthy" })]),
    { name: "api", health: "unhealthy" },
  );
});

test("takes the first running service when none is failing", () => {
  assert.deepEqual(
    selectWorkspaceServiceSummary([script({ scriptName: "web", health: "healthy" }), script({ scriptName: "api", health: null })]),
    { name: "web", health: "healthy" },
  );
});

test("skips a stopped service to reach a running one", () => {
  assert.deepEqual(selectWorkspaceServiceSummary([script({ scriptName: "web", lifecycle: "stopped" }), script({ scriptName: "api" })]), {
    name: "api",
    health: null,
  });
});

test("names an unhealthy service differently from a running one", () => {
  assert.equal(workspaceServiceLabelKey({ name: "web", health: "unhealthy" }), "serviceUnhealthy");
  assert.equal(workspaceServiceLabelKey({ name: "web", health: "healthy" }), "serviceRunning");
  assert.equal(workspaceServiceLabelKey({ name: "web", health: null }), "serviceRunning");
});
