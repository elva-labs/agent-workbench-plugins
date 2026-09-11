import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { HOME, notes } from "./notes.js";
import { add, finish, list } from "./tools.js";

let home: string;
let project: string;
const was = process.env[HOME];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "todos-tools-"));
  project = await mkdtemp(join(tmpdir(), "todos-project-"));
  process.env[HOME] = home;
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(
    join(project, "src", "app.ts"),
    ["const a = 1;", "// TODO: wire this up", "/* FIXME broken */"].join("\n"),
  );
});

afterEach(async () => {
  if (was === undefined) delete process.env[HOME];
  else process.env[HOME] = was;
  await rm(home, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

it("lists the notes and then what the code says", async () => {
  await add(project, "Ask about the retry budget");
  await add(project, "Check the deploy");
  const [second, first] = await notes(project);
  const now = (second?.at ?? 0) + 2 * 60 * 60;

  expect(await list(project, now)).toBe(
    [
      "2 notes:",
      `  ${second?.id}  Check the deploy (2h ago)`,
      `  ${first?.id}  Ask about the retry budget (2h ago)`,
      "",
      "2 TODO or FIXME comments in the code:",
      "  src/app.ts:2  TODO wire this up",
      "  src/app.ts:3  FIXME broken",
    ].join("\n"),
  );
});

it("says when there are no notes and no comments", async () => {
  const empty = await mkdtemp(join(tmpdir(), "todos-empty-"));
  try {
    expect(await list(empty)).toBe(
      "No notes.\n\nNo TODO or FIXME comments in the code.",
    );
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

it("answers with the note it added", async () => {
  const said = await add(project, "Ask about the retry budget");
  const [note] = await notes(project);

  expect(said).toBe(`Added note ${note?.id}: Ask about the retry budget`);
  await expect(add(project, "  ")).rejects.toThrow(
    "add needs the text of a note",
  );
});

it("answers with the note it finished, and leaves it off the list", async () => {
  await add(project, "Ask about the retry budget");
  const [note] = await notes(project);
  const id = note?.id ?? "";

  expect(await finish(project, id)).toBe(
    `Finished note ${id}: Ask about the retry budget`,
  );
  expect(await list(project)).toContain("No notes.");
});

it("says when an id is not a note of the project's", async () => {
  await add(project, "Ask about the retry budget");

  expect(await finish(project, "beef1234")).toBe(
    "There is no note beef1234 in this project. The list tool says which ids there are.",
  );
  await expect(finish(project, "")).rejects.toThrow(
    "finish needs the id of a note",
  );
});
