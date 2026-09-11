import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { LIMIT, WIDTH, says, scan } from "./scan.js";

let project: string;
let bin: string;
const path = process.env.PATH;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "todos-scan-"));
  bin = await mkdtemp(join(tmpdir(), "todos-bin-"));
});

afterEach(async () => {
  process.env.PATH = path;
  await rm(project, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
});

/** A file in the project, with the directories above it. */
async function file(at: string, text: string | Buffer): Promise<void> {
  const full = join(project, at);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, text);
}

it("reads every TODO and FIXME in the project's files", async () => {
  await file("notes.md", "# Notes\n\nTODO write the rest\n");
  await file(
    "src/app.ts",
    [
      "const a = 1;",
      "// TODO: wire this up",
      "const b = 2;",
      "/* FIXME broken on windows */",
      "// a line with no marker",
    ].join("\n"),
  );

  const found = await scan(project);

  expect(found).toEqual({
    capped: false,
    hits: [
      { path: "notes.md", line: 3, marker: "TODO", text: "write the rest" },
      { path: "src/app.ts", line: 2, marker: "TODO", text: "wire this up" },
      {
        path: "src/app.ts",
        line: 4,
        marker: "FIXME",
        text: "broken on windows",
      },
    ],
  });
});

it("leaves alone what is not text, what is too big, and the directories a walk skips", async () => {
  await file("src/app.ts", "// TODO the one hit\n");
  await file(
    "logo.png",
    Buffer.concat([Buffer.from("TODO in a picture"), Buffer.from([0, 1, 2])]),
  );
  await file("big.ts", `${"x".repeat(600 * 1024)}\n// TODO too big\n`);
  await file("node_modules/dep/index.js", "// TODO in a dependency\n");
  await file("dist/app.js", "// TODO in the build output\n");
  await file("build/app.js", "// TODO in the build output\n");
  await file("target/app.rs", "// TODO in the build output\n");
  await file(".cache/app.ts", "// TODO in a dot directory\n");

  const found = await scan(project);

  expect(found.hits).toEqual([
    { path: "src/app.ts", line: 1, marker: "TODO", text: "the one hit" },
  ]);
});

it("cuts a long marker to a row's width and keeps the marker that says nothing", async () => {
  await file("src/app.ts", `// TODO ${"long ".repeat(40)}\n// TODO\n`);

  const [long, bare] = (await scan(project)).hits;

  expect(long?.text).toHaveLength(WIDTH);
  expect(long?.text.endsWith("…")).toBe(true);
  expect(bare?.text).toBe("");
  expect(bare === undefined ? "" : says(bare)).toBe("TODO");
});

it("stops at the cap and says so", async () => {
  const lines = Array.from(
    { length: LIMIT + 20 },
    (_unused, at) => `// TODO number ${at + 1}`,
  );
  await file("src/many.ts", `${lines.join("\n")}\n`);
  await file("src/one.ts", "// TODO beyond the cap\n");

  const found = await scan(project);

  expect(found.hits).toHaveLength(LIMIT);
  expect(found.capped).toBe(true);
  expect(found.hits[0]?.text).toBe("number 1");
});

it("asks git for the files when the project is a repository", async () => {
  await mkdir(join(project, ".git"), { recursive: true });
  await file("src/tracked.ts", "// TODO the tracked one\n");
  await file("src/untracked.ts", "// TODO the untracked one\n");
  await writeFile(join(bin, "git"), "#!/bin/sh\nprintf 'src/tracked.ts\\0'\n", {
    mode: 0o755,
  });
  process.env.PATH = `${bin}:${path ?? ""}`;

  const found = await scan(project);

  expect(found.hits).toEqual([
    {
      path: "src/tracked.ts",
      line: 1,
      marker: "TODO",
      text: "the tracked one",
    },
  ]);
});

it("walks the directory when git has nothing to say", async () => {
  await mkdir(join(project, ".git"), { recursive: true });
  await file("src/app.ts", "// TODO the one hit\n");
  await writeFile(join(bin, "git"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  process.env.PATH = `${bin}:${path ?? ""}`;

  const found = await scan(project);

  expect(found.hits).toEqual([
    { path: "src/app.ts", line: 1, marker: "TODO", text: "the one hit" },
  ]);
});
