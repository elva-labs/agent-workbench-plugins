import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { Row } from "@elva-labs/workbench-plugin";
import {
  commit,
  file,
  isolate,
  remove,
  repository,
  run,
} from "./repo.test-helper.js";
import { statusRows } from "./rows.js";
import { status } from "./status.js";
import { seconds, stashes } from "./stashes.js";
import * as taken from "./taken.js";

let project: string;
let restore: () => void;

beforeEach(async () => {
  restore = isolate();
  project = await repository("taken");
});

afterEach(async () => {
  restore();
  await remove(project);
});

/** The rows the section is drawing right now. */
async function rows(): Promise<Row[]> {
  return statusRows(await status(project), await stashes(project), seconds());
}

async function row(id: string): Promise<Row | null> {
  return (await rows()).find((found) => found.id === id) ?? null;
}

/** What the last commit is called. */
async function last(): Promise<string> {
  return (await run(project, ["log", "-n", "1", "--pretty=%s"])).trim();
}

it("commits what is staged when the action says staged only", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "two\n");
  await run(project, ["add", "--", "a.txt"]);
  await file(project, "b.txt", "three\n");

  await taken.commit(project, { message: "what was staged", stage: "staged" });

  expect(await last()).toBe("what was staged");
  expect((await status(project)).changes.map((change) => change.path)).toEqual([
    "b.txt",
  ]);
});

it("commits the whole working tree when the action says everything", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "two\n");
  await file(project, "b.txt", "three\n");

  await taken.commit(project, {
    message: "all of it",
    stage: "everything",
  });

  expect(await last()).toBe("all of it");
  expect(await status(project)).toMatchObject({ changes: [] });
});

it("says so when a commit is asked for with nothing staged", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "b.txt", "two\n");

  await expect(
    taken.commit(project, { message: "nothing here", stage: "staged" }),
  ).rejects.toThrow("there is nothing staged to commit");
  await expect(
    taken.commit(project, { message: "   ", stage: "everything" }),
  ).rejects.toThrow("a commit needs a message");
  expect(await last()).toBe("the first commit");
});

it("leaves a file alone when a discard is answered no", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "changed\n");
  await file(project, "new.txt", "untracked\n");

  await taken.discard(project, await row("file:a.txt"), { sure: "no" });
  await taken.discard(project, await row("file:new.txt"), {});

  expect(await readFile(join(project, "a.txt"), "utf8")).toBe("changed\n");
  expect(existsSync(join(project, "new.txt"))).toBe(true);
});

it("throws a change away once a discard is answered yes", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "changed\n");
  await file(project, "new.txt", "untracked\n");

  await taken.discard(project, await row("file:a.txt"), { sure: "yes" });
  await taken.discard(project, await row("file:new.txt"), { sure: "yes" });

  expect(await readFile(join(project, "a.txt"), "utf8")).toBe("one\n");
  expect(existsSync(join(project, "new.txt"))).toBe(false);
  expect(await status(project)).toMatchObject({ changes: [] });
});

it("stages a file and takes it back out of the index", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "changed\n");

  await taken.stage(project, await row("file:a.txt"));
  expect((await row("file:a.txt"))?.detail).toBe("staged, modified");

  await taken.unstage(project, await row("file:a.txt"));
  expect((await row("file:a.txt"))?.detail).toBe("modified");
});

it("keeps a stash until a drop is answered yes", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "changed\n");
  await run(project, ["stash", "push", "-q", "-m", "put away"]);

  await taken.drop(project, await row("stash:stash@{0}"), { sure: "no" });
  expect(await stashes(project)).toHaveLength(1);

  await taken.drop(project, await row("stash:stash@{0}"), { sure: "yes" });
  expect(await stashes(project)).toEqual([]);
});

it("puts a stash back where it came from", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "changed\n");
  await run(project, ["stash", "push", "-q", "-m", "put away"]);

  await taken.pop(project, await row("stash:stash@{0}"));

  expect(await readFile(join(project, "a.txt"), "utf8")).toBe("changed\n");
  expect(await stashes(project)).toEqual([]);
});

it("moves the head onto a branch, and says what git said when it cannot", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await run(project, ["branch", "topic"]);
  const topic: Row = { id: "branch:topic", label: "topic" };

  await taken.switchTo(project, topic);
  expect((await status(project)).head.branch).toBe("topic");

  await taken.create(project, { name: "another" });
  expect((await status(project)).head.branch).toBe("another");
  await expect(taken.create(project, { name: "  " })).rejects.toThrow(
    "a branch needs a name",
  );
});

it("points at the file a row stands for, with what changed under it", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "changed\n");

  expect(taken.opened(await row("file:a.txt"))).toEqual({
    path: "a.txt",
    note: "modified",
  });
  expect(taken.opened(await row("head"))).toBeNull();
});
