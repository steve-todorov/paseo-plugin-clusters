import assert from "node:assert/strict";
import { test } from "node:test";
import { getForgePresentation, normalizeForge } from "./forge.ts";

// Ported from Paseo's git/forge.test.ts (v0.16), the parts the sidebar row uses.

test("keeps any non-empty forge id and defaults only absent values to github", () => {
  assert.equal(normalizeForge("gitlab"), "gitlab");
  assert.equal(normalizeForge("github"), "github");
  assert.equal(normalizeForge("gitea"), "gitea");
  assert.equal(normalizeForge("forgejo"), "forgejo");
  assert.equal(normalizeForge(undefined), "github");
  assert.equal(normalizeForge(null), "github");
  // An unknown id is kept, so a newer daemon's forge renders neutrally rather than as GitHub.
  assert.equal(normalizeForge("bitbucket"), "bitbucket");
});

test("keeps GitHub on the pull-request noun and the # prefix", () => {
  const github = getForgePresentation("github");
  assert.equal(github.brandLabel, "GitHub");
  assert.equal(github.changeRequestAbbrev, "PR");
  assert.equal(github.numberPrefix, "#");
  assert.equal(github.changeRequestContext, undefined);
});

test("relabels GitLab to the merge-request noun and the ! prefix", () => {
  const gitlab = getForgePresentation("gitlab");
  assert.equal(gitlab.brandLabel, "GitLab");
  assert.equal(gitlab.changeRequestAbbrev, "MR");
  assert.equal(gitlab.numberPrefix, "!");
  assert.equal(gitlab.changeRequestContext, "mr");
});

test("presents Gitea, Forgejo and Codeberg with GitHub nouns", () => {
  for (const [forge, brandLabel] of [["gitea", "Gitea"], ["forgejo", "Forgejo"], ["codeberg", "Codeberg"]]) {
    assert.deepEqual(getForgePresentation(forge), {
      forge,
      brandLabel,
      changeRequestAbbrev: "PR",
      numberPrefix: "#",
      changeRequestContext: undefined,
    });
  }
});

test("an unknown forge is neutral: its own id as the brand, pull-request nouns", () => {
  assert.deepEqual(getForgePresentation("bitbucket"), {
    forge: "bitbucket",
    brandLabel: "bitbucket",
    changeRequestAbbrev: "PR",
    numberPrefix: "#",
    changeRequestContext: undefined,
  });
});
