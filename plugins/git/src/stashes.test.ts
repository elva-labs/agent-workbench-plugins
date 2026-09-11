import { afterEach, beforeEach, expect, it } from "vitest";
import {
  commit,
  file,
  isolate,
  remove,
  repository,
  run,
} from "./repo.test-helper.js";
import { ago, stashes } from "./stashes.js";

let project: string;
let restore: () => void;

beforeEach(async () => {
  restore = isolate();
  project = await repository("stashes");
});

afterEach(async () => {
  restore();
  await remove(project);
});

it("reads the stashes a project is keeping, newest first", async () => {
  await commit(project, "a.txt", "one\n", "first");
  await file(project, "a.txt", "two\n");
  await run(project, ["stash", "push", "-q", "-m", "the first thing"]);
  await file(project, "a.txt", "three\n");
  await run(project, ["stash", "push", "-q", "-m", "the second thing"]);

  const put = await stashes(project);

  expect(put.map((stash) => stash.ref)).toEqual(["stash@{0}", "stash@{1}"]);
  expect(put.map((stash) => stash.message)).toEqual([
    "On main: the second thing",
    "On main: the first thing",
  ]);
  expect(put.every((stash) => stash.at > 0)).toBe(true);
});

it("has nothing to say about a project keeping none", async () => {
  await commit(project, "a.txt", "one\n", "first");

  expect(await stashes(project)).toEqual([]);
});

it("says how long ago a stash was put away", () => {
  expect(ago(100, 130)).toBe("just now");
  expect(ago(100, 100 + 60 * 5)).toBe("5m ago");
  expect(ago(100, 100 + 60 * 60 * 3)).toBe("3h ago");
  expect(ago(100, 100 + 60 * 60 * 24 * 2)).toBe("2d ago");
});
