import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  commit,
  file,
  isolate,
  remove,
  repository,
  run,
  temporary,
} from "./repo.test-helper.js";
import { name, standing, state, status, unquote, words } from "./status.js";

let project: string;
let elsewhere: string[] = [];
let restore: () => void;

beforeEach(async () => {
  restore = isolate();
  project = await repository("status");
});

afterEach(async () => {
  restore();
  await remove(project);
  for (const dir of elsewhere) await remove(dir);
  elsewhere = [];
});

it("reads what is staged, what is not, what git has never seen, and what is gone", async () => {
  await commit(project, "kept.txt", "one\n", "first");
  await commit(project, "gone.txt", "two\n", "second");
  await commit(project, "moved.txt", "three\n", "third");
  await commit(project, "both.txt", "four\n", "fourth");

  await file(project, "kept.txt", "one and more\n");
  await run(project, ["add", "--", "kept.txt"]);
  await file(project, "both.txt", "four and more\n");
  await run(project, ["add", "--", "both.txt"]);
  await file(project, "both.txt", "four and more again\n");
  await rm(join(project, "gone.txt"));
  await run(project, ["mv", "moved.txt", "elsewhere.txt"]);
  await file(project, "new.txt", "five\n");
  await file(project, "with a space.txt", "six\n");

  const read = await status(project);

  expect(read.head).toEqual({
    branch: "main",
    head: "",
    upstream: null,
    ahead: 0,
    behind: 0,
  });
  expect(
    read.changes.map((change) => [
      change.path,
      `${change.index}${change.work}`,
      words(change),
      state(change),
    ]),
  ).toEqual([
    ["both.txt", "MM", "staged, modified, then modified", "waiting"],
    ["elsewhere.txt", "R ", "renamed from moved.txt", "ok"],
    ["gone.txt", " D", "deleted", "waiting"],
    ["kept.txt", "M ", "staged, modified", "ok"],
    ["new.txt", "??", "untracked", "waiting"],
    ["with a space.txt", "??", "untracked", "waiting"],
  ]);
});

it("reads a file both sides of a merge have touched as a conflict", async () => {
  await commit(project, "shared.txt", "one\n", "first");
  await run(project, ["switch", "-q", "-c", "other"]);
  await commit(project, "shared.txt", "theirs\n", "theirs");
  await run(project, ["switch", "-q", "main"]);
  await commit(project, "shared.txt", "ours\n", "ours");
  const merge = await run(project, ["merge", "other"]).catch(() => "");
  expect(merge).toBe("");

  const read = await status(project);

  expect(
    read.changes.map((change) => [
      change.path,
      `${change.index}${change.work}`,
      words(change),
      state(change),
    ]),
  ).toEqual([["shared.txt", "UU", "conflict, both modified", "failed"]]);
});

it("counts how far the branch stands from its upstream", async () => {
  const origin = await temporary("origin");
  elsewhere.push(origin);
  await run(origin, ["init", "--bare", "-q", "-b", "main", origin]);
  await commit(project, "a.txt", "one\n", "first");
  await run(project, ["remote", "add", "origin", origin]);
  await run(project, ["push", "-q", "-u", "origin", "main"]);

  expect(standing((await status(project)).head)).toBe(
    "origin/main, up to date",
  );

  await commit(project, "a.txt", "two\n", "second");
  await commit(project, "a.txt", "three\n", "third");
  await run(project, ["push", "-q"]);
  await run(project, ["reset", "-q", "--hard", "HEAD~1"]);
  await commit(project, "a.txt", "mine\n", "mine");
  await commit(project, "a.txt", "mine again\n", "mine again");

  const read = await status(project);

  expect(read.head).toEqual({
    branch: "main",
    head: "",
    upstream: "origin/main",
    ahead: 2,
    behind: 1,
  });
  expect(standing(read.head)).toBe("origin/main, 2 ahead, 1 behind");
  expect(name(read.head)).toBe("main");
});

it("says the branch has no upstream when it has none", async () => {
  await commit(project, "a.txt", "one\n", "first");

  expect(standing((await status(project)).head)).toBe("no upstream");
});

it("names the head by its sha while it is detached", async () => {
  await commit(project, "a.txt", "one\n", "first");
  await commit(project, "a.txt", "two\n", "second");
  await run(project, ["checkout", "-q", "HEAD~1"]);

  const read = await status(project);
  const sha = (await run(project, ["rev-parse", "--short", "HEAD"])).trim();

  expect(read.head.branch).toBeNull();
  expect(read.head.head).toBe(sha);
  expect(name(read.head)).toBe(`detached at ${sha}`);
});

it("names the branch of a repository with nothing committed to it yet", async () => {
  const read = await status(project);

  expect(read.head).toEqual({
    branch: "main",
    head: "",
    upstream: null,
    ahead: 0,
    behind: 0,
  });
});

it("reads a path back out of the quotes git wrote it in", () => {
  expect(unquote('"with a space.txt"')).toBe("with a space.txt");
  expect(unquote('"say \\"so\\".txt"')).toBe('say "so".txt');
  expect(unquote('"uni\\303\\251.txt"')).toBe("unié.txt");
  expect(unquote("plain.txt")).toBe("plain.txt");
});
