import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { customIconPath, readProjectIconFor, validateCustomIcon } from "./project-custom-icon.ts";
import { readWorkspaceLabelCatalog } from "./workspace-labels.ts";

/** A PNG header that says `width`×`height`; the daemon reads no further. */
function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

let home: string;
let projectDir: string;

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "clusters-home-")));
  projectDir = join(home, "project");
  mkdirSync(join(home, "projects", "icons"), { recursive: true });
  mkdirSync(projectDir);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function writeProjects(records: object[]): void {
  writeFileSync(join(home, "projects", "projects.json"), JSON.stringify(records));
}

const record = (customIconRevision: string | null) => ({ projectId: "remote:github.com/a/b", rootPath: projectDir, customIconRevision });

describe("readProjectIconFor", () => {
  it("serves the automatic icon of the project's root when nothing was uploaded", async () => {
    writeProjects([record(null)]);
    writeFileSync(join(projectDir, "favicon.png"), png(16, 16));
    const icon = await readProjectIconFor(home, "remote:github.com/a/b");
    assert.deepEqual(icon, { mimeType: "image/png", data: png(16, 16).toString("base64") });
  });

  it("serves the uploaded icon, stored under the sha256 of the project id", async () => {
    writeProjects([record("rev-1")]);
    writeFileSync(join(projectDir, "favicon.png"), png(16, 16));
    writeFileSync(customIconPath(home, "remote:github.com/a/b"), png(64, 64));
    const icon = await readProjectIconFor(home, "remote:github.com/a/b");
    assert.deepEqual(icon, { mimeType: "image/png", data: png(64, 64).toString("base64") });
  });

  it("shows no icon when the upload is missing, without falling back to the automatic one", async () => {
    writeProjects([record("rev-1")]);
    writeFileSync(join(projectDir, "favicon.png"), png(16, 16));
    assert.equal(await readProjectIconFor(home, "remote:github.com/a/b"), null);
  });

  it("answers null for a project the daemon does not know", async () => {
    writeProjects([record(null)]);
    assert.equal(await readProjectIconFor(home, "elsewhere"), null);
  });

  it("answers null when the registry is missing", async () => {
    assert.equal(await readProjectIconFor(home, "remote:github.com/a/b"), null);
  });
});

describe("validateCustomIcon", () => {
  it("accepts square images up to 1024 and 512 KB", () => {
    assert.equal(validateCustomIcon(png(1024, 1024))?.mimeType, "image/png");
  });

  it("refuses non-square, oversized, empty and unknown data", () => {
    assert.equal(validateCustomIcon(png(32, 16)), null);
    assert.equal(validateCustomIcon(png(2048, 2048)), null);
    assert.equal(validateCustomIcon(Buffer.alloc(0)), null);
    assert.equal(validateCustomIcon(Buffer.from("<svg></svg>")), null);
    assert.equal(validateCustomIcon(Buffer.concat([png(16, 16), Buffer.alloc(512 * 1024)])), null);
  });
});

describe("readWorkspaceLabelCatalog", () => {
  const catalogPath = () => join(home, "projects", "workspace-labels.json");
  const transactionPath = () => join(home, "projects", "workspace-labels.transaction.json");

  it("reads the catalog", async () => {
    writeFileSync(catalogPath(), JSON.stringify([{ name: "p0", color: "red" }]));
    assert.deepEqual(await readWorkspaceLabelCatalog(home), [{ name: "p0", color: "red" }]);
  });

  it("has no labels without a catalog", async () => {
    assert.deepEqual(await readWorkspaceLabelCatalog(home), []);
  });

  it("serves the labels from before a change still being written", async () => {
    writeFileSync(catalogPath(), JSON.stringify([{ name: "p0", color: "teal" }]));
    writeFileSync(
      transactionPath(),
      JSON.stringify({ phase: "prepared", beforeLabels: [{ name: "p0", color: "red" }], afterLabels: [], beforeWorkspaces: [], afterWorkspaces: [] }),
    );
    assert.deepEqual(await readWorkspaceLabelCatalog(home), [{ name: "p0", color: "red" }]);
  });

  it("serves the catalog once the change is committed", async () => {
    writeFileSync(catalogPath(), JSON.stringify([{ name: "p0", color: "teal" }]));
    writeFileSync(
      transactionPath(),
      JSON.stringify({ phase: "committed", beforeLabels: [{ name: "p0", color: "red" }], afterLabels: [], beforeWorkspaces: [], afterWorkspaces: [] }),
    );
    assert.deepEqual(await readWorkspaceLabelCatalog(home), [{ name: "p0", color: "teal" }]);
  });

  it("refuses a colour outside the palette, as the daemon does", async () => {
    writeFileSync(catalogPath(), JSON.stringify([{ name: "p0", color: "black" }]));
    await assert.rejects(readWorkspaceLabelCatalog(home));
  });
});
