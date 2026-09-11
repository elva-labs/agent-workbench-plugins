import { afterEach, beforeEach, expect, it } from "vitest";
import { graph } from "./log.js";
import { page } from "./page.js";
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
  project = await repository("page");
});

afterEach(async () => {
  restore();
  await remove(project);
});

it("draws a row per commit, with the graph and the fields beside it", async () => {
  await commit(project, "a.txt", "one\n", "the first commit");
  await run(project, ["switch", "-q", "-c", "topic"]);
  await commit(project, "b.txt", "two\n", "the branch commit");
  await run(project, ["switch", "-q", "main"]);
  const entries = await graph(project);

  const html = page("main", entries);

  expect(html).toContain("the first commit");
  expect(html).toContain("the branch commit");
  expect(html).toContain('<td class="graph">*</td>');
  expect(html).toContain('<span class="ref">HEAD -&gt; main</span>');
  expect(html).toContain("2 commits");
  for (const entry of entries) {
    expect(html).toContain(`data-sha="${entry.sha}"`);
  }
});

it("says so when there is nothing to draw", () => {
  const html = page("main", []);

  expect(html).toContain("No commits yet.");
  expect(html).not.toContain('data-sha="');
});

it("holds its own style and its own script and nothing from anywhere else", () => {
  const html = page("main", [
    {
      graph: "*",
      sha: "1a2b3c4",
      refs: "HEAD -> main",
      author: "Someone",
      date: "2026-01-02",
      subject: "a commit",
    },
  ]);

  expect(html.match(/<style>/g)).toHaveLength(1);
  expect(html).not.toMatch(/src=|href=|@import|https?:/);
  expect(html).toContain("window.workbench.send({ commit: sha })");
  expect(html).toContain("window.workbench.onData");
  expect(html).toContain("prefers-color-scheme: dark");
});

it("writes a commit's own words as words, not as markup", () => {
  const html = page("main", [
    {
      graph: "*",
      sha: "1a2b3c4",
      refs: "",
      author: "<script>",
      date: "2026-01-02",
      subject: '<img onerror="go()"> & "quoted"',
    },
  ]);

  expect(html).toContain(
    "&lt;img onerror=&quot;go()&quot;&gt; &amp; &quot;quoted&quot;",
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<img");
});

it("holds no row that can be asked about for a line that is graph alone", () => {
  const html = page("main", [
    {
      graph: "|/",
      sha: "",
      refs: "",
      author: "",
      date: "",
      subject: "",
    },
  ]);

  expect(html).toContain('<td class="graph">|/</td>');
  expect(html).not.toContain('data-sha="');
});
