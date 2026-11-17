import assert from "node:assert/strict";
import { test } from "node:test";
import { type NestSearchFields, filterNestCandidates, nestBranchHint, nestSearchMatches, normalizeNestQuery } from "./nest-search.ts";

const fields: Record<string, NestSearchFields> = {
  a: { title: "Checkout flow", name: "checkout", branch: "feature/pay-123" },
  b: { title: "Docs", name: "docs-site", branch: "main" },
  c: { title: null, name: "infra", branch: null },
  d: { title: "Search  Index", name: "search", branch: "fix/Search-Bug" },
};
/** The view's side: a key matches when its workspace is known and its fields match. */
const fieldsOf = (key: string, query: string) => {
  const known = fields[key];
  return known !== undefined && nestSearchMatches(query, known);
};
const all = ["a", "b", "c", "d"];

test("the query is lowercased, trimmed and its runs of spaces made one", () => {
  assert.equal(normalizeNestQuery("  Foo   BAR  "), "foo bar");
  assert.equal(normalizeNestQuery("   "), "");
});

test("an empty or blank query keeps every eligible workspace, in order", () => {
  assert.deepEqual(filterNestCandidates(all, "", fieldsOf), all);
  assert.deepEqual(filterNestCandidates(all, "   ", fieldsOf), all);
});

test("matches the workspace title", () => {
  assert.deepEqual(filterNestCandidates(all, "flow", fieldsOf), ["a"]);
});

test("matches the workspace name", () => {
  assert.deepEqual(filterNestCandidates(all, "docs-si", fieldsOf), ["b"]);
  assert.deepEqual(filterNestCandidates(all, "infra", fieldsOf), ["c"]);
});

test("matches the git branch", () => {
  assert.deepEqual(filterNestCandidates(all, "pay-123", fieldsOf), ["a"]);
  assert.deepEqual(filterNestCandidates(all, "main", fieldsOf), ["b"]);
});

test("ignores case on both sides", () => {
  assert.deepEqual(filterNestCandidates(all, "CHECKOUT", fieldsOf), ["a"]);
  assert.deepEqual(filterNestCandidates(all, "search-bug", fieldsOf), ["d"]);
});

test("ignores extra spaces in the query and in the fields", () => {
  assert.deepEqual(filterNestCandidates(all, "  checkout   FLOW ", fieldsOf), ["a"]);
  assert.deepEqual(filterNestCandidates(all, "search index", fieldsOf), ["d"]);
});

test("keeps the eligible order and drops unknown workspaces", () => {
  assert.deepEqual(filterNestCandidates(["d", "x", "a", "b"], "s", fieldsOf), ["d", "b"]);
  assert.deepEqual(filterNestCandidates(["d", "x", "a"], "", fieldsOf), ["d", "x", "a"]);
});

test("no match gives an empty list", () => {
  assert.deepEqual(filterNestCandidates(all, "zzz", fieldsOf), []);
});

test("nestSearchMatches takes an already normalized query", () => {
  assert.equal(nestSearchMatches("feature/", fields.a!), true);
  assert.equal(nestSearchMatches("", fields.c!), true);
  assert.equal(nestSearchMatches("main", fields.c!), false);
});

test("the branch shows under an item only when it differs from the title", () => {
  assert.equal(nestBranchHint("Checkout flow", "feature/pay-123"), "feature/pay-123");
  assert.equal(nestBranchHint("main", "main"), null);
  assert.equal(nestBranchHint("Docs", null), null);
  assert.equal(nestBranchHint("Docs", ""), null);
});
