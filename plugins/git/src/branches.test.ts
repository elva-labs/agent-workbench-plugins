import { afterEach, beforeEach, expect, it } from "vitest";
import { branches } from "./branches.js";
import {
  commit,
  isolate,
  remove,
  repository,
  run,
} from "./repo.test-helper.js";

let project: string;
let restore: () => void;

beforeEach(async () => {
  restore = isolate();
  project = await repository("branches");
});

afterEach(async () => {
  restore();
  await remove(project);
});

it("reads every local branch, the one the head is on among them", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await run(project, ["switch", "-q", "-c", "topic"]);
  await commit(project, "b.txt", "two\n", "the topic's commit");
  await run(project, ["switch", "-q", "main"]);

  const found = await branches(project);
  const head = (await run(project, ["rev-parse", "--short", "HEAD"])).trim();

  expect(found).toEqual([
    {
      name: "main",
      current: true,
      head,
      subject: "the first commit",
    },
    {
      name: "topic",
      current: false,
      head: expect.stringMatching(/^[0-9a-f]+$/),
      subject: "the topic's commit",
    },
  ]);
});

it("has nothing to say about a repository with no commits yet", async () => {
  expect(await branches(project)).toEqual([]);
});
