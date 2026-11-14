import assert from "node:assert/strict";
import { test } from "node:test";
import { selectPrHintFromStatus } from "./pr-hint.ts";

// Ported from Paseo's git/pr-hint.test.ts (v0.16).

const githubStatus = { url: "https://github.com/acme/repo/pull/42", state: "open", isMerged: false };
const gitlabStatus = { url: "https://gitlab.com/group/proj/-/merge_requests/7", state: "open", isMerged: false };

test("defaults the forge to github when none is supplied (old daemon)", () => {
  const hint = selectPrHintFromStatus(githubStatus);
  assert.equal(hint?.number, 42);
  assert.equal(hint?.forge, "github");
});

test("carries the resolved forge onto the hint", () => {
  assert.equal(selectPrHintFromStatus(githubStatus, "github")?.forge, "github");
});

test("parses a GitLab merge-request URL and carries the gitlab forge", () => {
  const hint = selectPrHintFromStatus(gitlabStatus, "gitlab");
  assert.equal(hint?.number, 7);
  assert.equal(hint?.forge, "gitlab");
});

test("passes an unknown forge id through untouched", () => {
  assert.equal(selectPrHintFromStatus(githubStatus, "bitbucket")?.forge, "bitbucket");
});

test("returns null when the url has no parseable change-request number", () => {
  assert.equal(selectPrHintFromStatus({ url: "https://example.com/x", state: "open", isMerged: false }), null);
});

test("a merged flag wins over the reported state, and anything not open is closed", () => {
  assert.equal(selectPrHintFromStatus({ ...githubStatus, isMerged: true })?.state, "merged");
  assert.equal(selectPrHintFromStatus({ ...githubStatus, state: "merged" })?.state, "merged");
  assert.equal(selectPrHintFromStatus({ ...githubStatus, state: "declined" })?.state, "closed");
});

test("no pull request is no hint", () => {
  assert.equal(selectPrHintFromStatus(null), null);
  assert.equal(selectPrHintFromStatus(undefined), null);
});
