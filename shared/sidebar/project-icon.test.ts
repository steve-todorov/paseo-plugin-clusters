import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeBase64Utf8,
  getProjectStatusBadgeContent,
  projectIconInitial,
  projectIconRadius,
  projectIconRevision,
  selectProjectIconPicture,
} from "./project-icon.ts";

const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

test("the generated square's radius is a quarter of its side", () => {
  assert.equal(projectIconRadius(16), 4);
  assert.equal(projectIconRadius(40), 10);
});

test("the initial comes from the last segment of the display name", () => {
  assert.equal(projectIconInitial("getpaseo/paseo"), "P");
  assert.equal(projectIconInitial("  iris "), "I");
  assert.equal(projectIconInitial("trailing/"), "T");
  assert.equal(projectIconInitial(""), "");
});

test("a project without a revision is cached as automatic", () => {
  assert.equal(projectIconRevision(null), "automatic");
  assert.equal(projectIconRevision("custom:abc"), "custom:abc");
});

test("raster icons draw as a data URI", () => {
  assert.deepEqual(selectProjectIconPicture({ mimeType: "image/png", data: "AAAA" }), { kind: "image", uri: "data:image/png;base64,AAAA" });
});

test("ICO and missing icons fall back to the lettered square", () => {
  assert.deepEqual(selectProjectIconPicture({ mimeType: "image/x-icon", data: "AAAA" }), { kind: "fallback" });
  assert.deepEqual(selectProjectIconPicture({ mimeType: "image/vnd.microsoft.icon", data: "AAAA" }), { kind: "fallback" });
  assert.deepEqual(selectProjectIconPicture(null), { kind: "fallback" });
});

test("SVG draws from its markup, unless the plugin icon would refuse it", () => {
  const svg = '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';
  assert.deepEqual(selectProjectIconPicture({ mimeType: "image/svg+xml", data: base64(svg) }), { kind: "svg", xml: svg });
  const styled = "<svg><style>rect{fill:red}</style></svg>";
  assert.deepEqual(selectProjectIconPicture({ mimeType: "image/svg+xml", data: base64(styled) }), { kind: "fallback" });
});

test("decodes base64 to UTF-8 like Buffer does", () => {
  for (const text of ["", "a", "ab", "abc", "<svg>é ✓ 𝄞</svg>"]) assert.equal(decodeBase64Utf8(base64(text)), text);
  assert.equal(decodeBase64Utf8("not*base64"), null);
  // 0xff is never valid UTF-8.
  assert.equal(decodeBase64Utf8(Buffer.from([0xff]).toString("base64")), null);
});

test("the corner badge: alert for needs_input, a dot for failed, attention and running", () => {
  assert.deepEqual(getProjectStatusBadgeContent("needs_input"), { kind: "alert" });
  assert.deepEqual(getProjectStatusBadgeContent("running"), { kind: "dot", bucket: "running" });
  assert.deepEqual(getProjectStatusBadgeContent("failed"), { kind: "dot", bucket: "failed" });
  assert.deepEqual(getProjectStatusBadgeContent("attention"), { kind: "dot", bucket: "attention" });
  assert.equal(getProjectStatusBadgeContent("done"), null);
  assert.equal(getProjectStatusBadgeContent(null), null);
});
