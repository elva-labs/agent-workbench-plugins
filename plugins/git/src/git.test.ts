import { afterEach, beforeEach, expect, it } from "vitest";
import { git, output, trouble } from "./git.js";
import {
  commit,
  file,
  isolate,
  remove,
  repository,
} from "./repo.test-helper.js";

let project: string;
let restore: () => void;

beforeEach(async () => {
  restore = isolate();
  project = await repository("git");
});

afterEach(async () => {
  restore();
  await remove(project);
});

it("answers with what git wrote and how it ended", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");

  const run = await git(project, ["log", "-n", "1", "--pretty=%h%x09%s"]);

  expect(run.code).toBe(0);
  expect(run.stdout.trim().split("\t")[1]).toBe("the first commit");
  expect(run.stderr).toBe("");
});

it("answers a git that refused with its code, and throws its words", async () => {
  const run = await git(project, ["log", "-n", "1", "--pretty=%h%x09%s"]);

  expect(run.code).not.toBe(0);
  expect(trouble(run)).toContain("does not have any commits yet");
  await expect(
    output(project, ["log", "-n", "1", "--pretty=%h%x09%s"]),
  ).rejects.toThrow(/does not have any commits yet/);
});

it("refuses an option it did not put there itself", async () => {
  await expect(
    git(project, ["switch", "--upload-pack=whatever"]),
  ).rejects.toThrow(/never passes git --upload-pack=whatever/);
  await expect(git(project, ["log", "--all"])).resolves.toBeTruthy();
});

it("takes what it has to say on standard input", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await file(project, "b.txt", "two\n");
  await output(project, ["add", "--all"]);

  await output(project, ["commit", "--file=-"], "written on the way in\n");

  const said = await output(project, ["log", "-n", "1", "--pretty=%h%x09%s"]);
  expect(said.trim().split("\t")[1]).toBe("written on the way in");
});
