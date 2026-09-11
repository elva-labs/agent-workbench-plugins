import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { Action, Row } from "@elva-labs/workbench-plugin";
import { branches } from "./branches.js";
import {
  BRANCH_ACTIONS,
  branchRows,
  fileOf,
  stashOf,
  STATUS_ACTIONS,
  statusRows,
  sure,
} from "./rows.js";
import {
  commit,
  file,
  isolate,
  remove,
  repository,
  run,
  temporary,
} from "./repo.test-helper.js";
import { status } from "./status.js";
import { seconds, stashes } from "./stashes.js";

let project: string;
let elsewhere: string[] = [];
let restore: () => void;

beforeEach(async () => {
  restore = isolate();
  project = await repository("rows");
});

afterEach(async () => {
  restore();
  await remove(project);
  for (const dir of elsewhere) await remove(dir);
  elsewhere = [];
});

/** The states the app draws a row's dot in, and nothing else. */
const STATES = ["ok", "busy", "waiting", "failed"];

/** What the app keeps of a row: an id and a label of its own, a state it
    knows, and a default naming one of the row's own actions. */
function sound(rows: Row[]): void {
  for (const row of rows) {
    expect(row.id).not.toBe("");
    expect(row.label).not.toBe("");
    if (row.state !== undefined) expect(STATES).toContain(row.state);
    for (const action of row.actions ?? []) held(action);
    if (row.default !== undefined) {
      expect((row.actions ?? []).map((action) => action.id)).toContain(
        row.default,
      );
    }
  }
  expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
}

/** What the app keeps of an action: an id, a label, and fields it can
    ask for. */
function held(action: Action): void {
  expect(action.id).not.toBe("");
  expect(action.label).not.toBe("");
  for (const field of action.input ?? []) {
    expect(field.id).not.toBe("");
    expect(["text", "choice"]).toContain(field.kind);
    if (field.kind === "choice") {
      expect(field.options ?? []).not.toHaveLength(0);
    }
  }
}

/** A repository with a branch that is ahead, a file of every kind, two
    stashes and a second branch. */
async function busy(): Promise<void> {
  const origin = await temporary("origin");
  elsewhere.push(origin);
  await run(origin, ["init", "--bare", "-q", "-b", "main", origin]);
  await commit(project, "kept.txt", "one\n", "the first commit");
  await run(project, ["remote", "add", "origin", origin]);
  await run(project, ["push", "-q", "-u", "origin", "main"]);
  await commit(project, "gone.txt", "two\n", "the second commit");

  await file(project, "put.txt", "away\n");
  await run(project, ["add", "--", "put.txt"]);
  await run(project, ["stash", "push", "-q", "-u", "-m", "the stashed thing"]);
  await run(project, ["switch", "-q", "-c", "topic"]);
  await run(project, ["switch", "-q", "main"]);

  await file(project, "kept.txt", "one and more\n");
  await run(project, ["add", "--", "kept.txt"]);
  await rm(join(project, "gone.txt"));
  await file(project, "new.txt", "three\n");
}

it("draws the branch, every changed file and every stash", async () => {
  await busy();

  const rows = statusRows(
    await status(project),
    await stashes(project),
    seconds(),
  );

  expect(
    rows.map((row) => [row.id, row.label, row.detail, row.state ?? null]),
  ).toEqual([
    ["head", "main", "origin/main, 1 ahead", null],
    ["file:gone.txt", "gone.txt", "deleted", "waiting"],
    ["file:kept.txt", "kept.txt", "staged, modified", "ok"],
    ["file:new.txt", "new.txt", "untracked", "waiting"],
    [
      "stash:stash@{0}",
      "stash@{0}: On main: the stashed thing",
      "just now",
      null,
    ],
  ]);
  expect(rows[0]!.default).toBe("push");
  expect(rows[2]!.default).toBe("open");
  expect(rows[4]!.default).toBeUndefined();
  expect(rows[4]!.actions?.map((action) => action.id)).toEqual([
    "apply",
    "pop",
    "drop",
  ]);
  sound(rows);
});

it("leaves the branch row without a default when there is nothing to push", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");

  const rows = statusRows(await status(project), [], seconds());

  expect(rows[0]).toEqual({
    id: "head",
    label: "main",
    detail: "no upstream",
  });
  sound(rows);
});

it("offers what can be done to a file and nothing else", async () => {
  await busy();

  const rows = statusRows(await status(project), [], seconds());
  const actions = (id: string) =>
    rows
      .find((row) => row.id === id)
      ?.actions?.map((action) => action.id)
      .join(" ");

  expect(actions("file:kept.txt")).toBe("open unstage");
  expect(actions("file:gone.txt")).toBe("open stage unstage discard");
  expect(actions("file:new.txt")).toBe("open stage discard");
});

it("draws every branch, with the current one marked", async () => {
  await busy();

  const rows = branchRows(await branches(project));

  expect(rows.map((row) => [row.id, row.label, row.state ?? null])).toEqual([
    ["branch:main", "main", "ok"],
    ["branch:topic", "topic", null],
  ]);
  expect(rows[0]!.detail).toBe("current");
  expect(rows[1]!.detail).toMatch(/^[0-9a-f]+ the second commit$/);
  expect(rows.map((row) => row.default)).toEqual(["switch", "switch"]);
  sound(rows);
});

it("asks before it does what cannot be undone", async () => {
  await busy();

  const rows = statusRows(
    await status(project),
    await stashes(project),
    seconds(),
  );
  const discard = rows
    .find((row) => row.id === "file:new.txt")
    ?.actions?.find((action) => action.id === "discard");
  const drop = rows
    .find((row) => row.id === "stash:stash@{0}")
    ?.actions?.find((action) => action.id === "drop");

  for (const action of [discard, drop]) {
    expect(action?.input?.[0]?.id).toBe("sure");
    // No is what the app offers first, so an action taken by accident
    // does nothing.
    expect(action?.input?.[0]?.options?.map((option) => option.id)).toEqual([
      "no",
      "yes",
    ]);
  }
  expect(sure({ sure: "yes" })).toBe(true);
  expect(sure({ sure: "no" })).toBe(false);
  expect(sure({})).toBe(false);
});

it("holds what each header can do, fields and all", () => {
  for (const action of [...STATUS_ACTIONS, ...BRANCH_ACTIONS]) held(action);

  expect(STATUS_ACTIONS.map((action) => action.id)).toEqual([
    "commit",
    "pull",
    "push",
    "stash",
    "refresh",
  ]);
  const commit = STATUS_ACTIONS[0]!;
  expect(commit.input?.map((field) => field.id)).toEqual(["message", "stage"]);
  expect(commit.input?.[0]?.placeholder).toBe("Message");
  expect(commit.input?.[1]?.options?.map((option) => option.id)).toEqual([
    "staged",
    "everything",
  ]);
  expect(BRANCH_ACTIONS[0]?.input?.[0]?.id).toBe("name");
});

it("says what a row stands for, and nothing for a row of another kind", () => {
  const head: Row = { id: "head", label: "main" };
  const one: Row = { id: "file:src/main.ts", label: "src/main.ts" };
  const put: Row = { id: "stash:stash@{2}", label: "stash@{2}: on main" };

  expect(fileOf(one)).toBe("src/main.ts");
  expect(fileOf(head)).toBeNull();
  expect(fileOf(null)).toBeNull();
  expect(stashOf(put)).toBe("stash@{2}");
  expect(stashOf(one)).toBeNull();
});
