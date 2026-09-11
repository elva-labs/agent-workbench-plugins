import { afterEach, beforeEach, expect, it } from "vitest";
import { graph, recent, show } from "./log.js";
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
  project = await repository("log");
});

afterEach(async () => {
  restore();
  await remove(project);
});

/** A repository whose log forks and comes back together, so the graph has
    something to draw. */
async function forked(): Promise<void> {
  await commit(project, "a.txt", "one\n", "the first commit");
  await run(project, ["switch", "-q", "-c", "topic"]);
  await commit(project, "b.txt", "two\n", "the topic's commit");
  await run(project, ["switch", "-q", "main"]);
  await commit(project, "c.txt", "three\n", "the main line's commit");
  await run(project, ["merge", "-q", "--no-ff", "-m", "the merge", "topic"]);
}

it("reads a commit's fields and keeps the graph's own characters", async () => {
  await forked();

  const entries = await graph(project);

  expect(entries.map((entry) => entry.subject)).toEqual([
    "the merge",
    "",
    "the topic's commit",
    "the main line's commit",
    "",
    "the first commit",
  ]);
  const merge = entries[0]!;
  expect(merge.graph).toBe("*");
  expect(merge.sha).toMatch(/^[0-9a-f]{4,40}$/);
  expect(merge.refs).toBe("HEAD -> main");
  expect(merge.author).toBe("Test");
  expect(merge.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // The fork and what comes back together are drawn, not written.
  expect(entries.map((entry) => entry.graph)).toEqual([
    "*",
    "|\\",
    "| *",
    "* |",
    "|/",
    "*",
  ]);
  expect(entries[1]!.sha).toBe("");
  expect(entries[2]!.refs).toBe("topic");
});

it("holds no more of the log than it was asked for", async () => {
  await commit(project, "a.txt", "one\n", "first");
  await commit(project, "a.txt", "two\n", "second");
  await commit(project, "a.txt", "three\n", "third");

  const entries = await graph(project, 2);

  expect(entries.map((entry) => entry.subject)).toEqual(["third", "second"]);
});

it("gives the recent commits one line each", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await commit(project, "a.txt", "two\n", "the second commit");

  const lines = await recent(project, 20);

  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(
    /^[0-9a-f]+ {2}\d{4}-\d{2}-\d{2} {2}Test {2}the second commit$/,
  );
});

it("says what one commit changed, and refuses anything that is not one", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  const sha = (await run(project, ["rev-parse", "--short", "HEAD"])).trim();

  const said = await show(project, sha);

  expect(said).toContain("the first commit");
  expect(said).toContain("a.txt");
  await expect(show(project, "--upload-pack=hack")).rejects.toThrow(
    /is not a commit/,
  );
  await expect(show(project, "main")).rejects.toThrow(/is not a commit/);
});
