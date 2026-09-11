import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  commit as made,
  file,
  isolate,
  remove,
  repository,
  run,
  temporary,
} from "./repo.test-helper.js";
import { status } from "./status.js";
import { commit, log, RECENT, statusText } from "./tools.js";

let project: string;
let elsewhere: string[] = [];
let restore: () => void;

beforeEach(async () => {
  restore = isolate();
  project = await repository("tools");
});

afterEach(async () => {
  restore();
  await remove(project);
  for (const dir of elsewhere) await remove(dir);
  elsewhere = [];
});

it("tells the agent the branch, where it stands and what has changed", async () => {
  const origin = await temporary("origin");
  elsewhere.push(origin);
  await run(origin, ["init", "--bare", "-q", "-b", "main", origin]);
  await made(project, "a.txt", "one\n", "the first commit");
  await run(project, ["remote", "add", "origin", origin]);
  await run(project, ["push", "-q", "-u", "origin", "main"]);
  await made(project, "b.txt", "two\n", "the second commit");
  await file(project, "a.txt", "changed\n");
  await run(project, ["add", "--", "a.txt"]);
  await rm(join(project, "b.txt"));

  expect(statusText(await status(project))).toBe(
    [
      "main (origin/main, 1 ahead)",
      "",
      "2 changed files:",
      "  a.txt  (staged, modified)",
      "  b.txt  (deleted)",
    ].join("\n"),
  );
});

it("tells the agent when nothing has changed", async () => {
  await made(project, "a.txt", "one\n", "the first commit");

  expect(statusText(await status(project))).toBe(
    ["main (no upstream)", "", "Nothing has changed."].join("\n"),
  );
});

it("commits through the tool and answers with the sha and the subject", async () => {
  await made(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "two\n");
  await run(project, ["add", "--", "a.txt"]);

  const said = await commit(project, { message: "through the tool" });

  expect(said).toMatch(/^Committed [0-9a-f]+ through the tool$/);
  expect(await status(project)).toMatchObject({ changes: [] });
});

it("commits everything in the tree through the tool when it is told to", async () => {
  await made(project, "a.txt", "one\n", "the first commit");
  await file(project, "a.txt", "two\n");
  await file(project, "new.txt", "three\n");

  const said = await commit(project, { message: "all of it", all: true });

  expect(said).toMatch(/^Committed [0-9a-f]+ all of it$/);
  expect(await status(project)).toMatchObject({ changes: [] });
});

it("refuses a commit through the tool with nothing staged or nothing said", async () => {
  await made(project, "a.txt", "one\n", "the first commit");
  await file(project, "new.txt", "two\n");

  await expect(commit(project, { message: "nothing here" })).rejects.toThrow(
    "there is nothing staged to commit",
  );
  await expect(commit(project, {})).rejects.toThrow("commit needs a message");
  await expect(commit(project, { message: 7 })).rejects.toThrow(
    "commit needs a message",
  );
});

it("gives the agent the recent commits, as many as it asked for", async () => {
  await made(project, "a.txt", "one\n", "the first commit");
  await made(project, "a.txt", "two\n", "the second commit");
  await made(project, "a.txt", "three\n", "the third commit");

  const all = (await log(project, {})).split("\n");
  const some = (await log(project, { limit: 2 })).split("\n");

  expect(all).toHaveLength(3);
  expect(all[0]).toContain("the third commit");
  expect(some).toHaveLength(2);
  expect(some[1]).toContain("the second commit");
  expect(RECENT).toBeGreaterThan(0);
});

it("tells the agent there is nothing to log yet", async () => {
  expect(await log(project, {})).toBe("No commits yet.");
});
