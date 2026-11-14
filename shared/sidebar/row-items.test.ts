import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSidebarChecksDisplay } from "./checks-display.ts";
import { DEFAULT_SIDEBAR_ROW_ITEMS, isChecksHiddenByLegacyRowItem, parseSidebarRowItems } from "./row-items.ts";

// Ported from Paseo's components/sidebar/display-preferences/row-items.test.ts (v0.16).

test("shows operational metadata but hides identity badges by default", () => {
  assert.deepEqual(DEFAULT_SIDEBAR_ROW_ITEMS, {
    branch: false,
    project: false,
    host: true,
    changeRequest: true,
    services: true,
    labels: true,
  });
});

test("applies stored overrides", () => {
  assert.deepEqual(parseSidebarRowItems({ services: false }), { ...DEFAULT_SIDEBAR_ROW_ITEMS, services: false });
});

test("leaves items absent from storage at their default", () => {
  assert.deepEqual(parseSidebarRowItems({ host: false }), { ...DEFAULT_SIDEBAR_ROW_ITEMS, host: false });
});

test("ignores unknown keys and non-boolean values", () => {
  assert.deepEqual(parseSidebarRowItems({ checks: false, nonsense: false, services: null, host: false }), {
    ...DEFAULT_SIDEBAR_ROW_ITEMS,
    host: false,
  });
});

for (const value of [null, undefined, "diff", 42, ["services"]]) {
  test(`falls back to defaults for ${JSON.stringify(value)}`, () => {
    assert.deepEqual(parseSidebarRowItems(value), DEFAULT_SIDEBAR_ROW_ITEMS);
  });
}

test("carries a switched-off scripts item over to services", () => {
  assert.deepEqual(parseSidebarRowItems({ scripts: false }), { ...DEFAULT_SIDEBAR_ROW_ITEMS, services: false });
});

test("lets a stored services value win over the scripts item it replaced", () => {
  assert.deepEqual(parseSidebarRowItems({ scripts: false, services: true }), DEFAULT_SIDEBAR_ROW_ITEMS);
});

test("does not hand back the shared default object", () => {
  const parsed = parseSidebarRowItems({ services: false });
  assert.notEqual(parsed, DEFAULT_SIDEBAR_ROW_ITEMS);
  assert.equal(DEFAULT_SIDEBAR_ROW_ITEMS.services, true);
});

test("reports the one stored shape that means checks were switched off", () => {
  assert.equal(isChecksHiddenByLegacyRowItem({ checks: false }), true);
});

for (const value of [{ checks: true }, { services: false }, {}, null, "checks", ["checks"]]) {
  test(`leaves ${JSON.stringify(value)} to the new setting's default`, () => {
    assert.equal(isChecksHiddenByLegacyRowItem(value), false);
  });
}

test("parses the three checks displays and nothing else", () => {
  assert.equal(parseSidebarChecksDisplay("iconAndText"), "iconAndText");
  assert.equal(parseSidebarChecksDisplay("icon"), "icon");
  assert.equal(parseSidebarChecksDisplay("none"), "none");
  assert.equal(parseSidebarChecksDisplay("loud"), null);
  assert.equal(parseSidebarChecksDisplay(undefined), null);
});
