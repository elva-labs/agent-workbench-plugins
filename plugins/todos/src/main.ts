/**
 * The todos plugin: what the code says and what its user wants to
 * remember, as the Todos section and the Notes group under the tree and
 * three tools for the agent.
 */

import { plugin, type Action } from "@elva-labs/workbench-plugin";
import * as store from "./notes.js";
import { hitId, noteRows, todoRows } from "./rows.js";
import { says, scan, type Hit, type Scan } from "./scan.js";
import * as tools from "./tools.js";

/** How long a tree that moved is left alone before the code is read
    again. */
const SETTLE_MS = 400;

const p = plugin({ name: "todos", version: "0.1.0" });

p.tool(
  "list",
  {
    description:
      "The project's notes to self, each with the id that finishes it, and the TODO and FIXME comments in its code.",
    inputSchema: { type: "object", properties: {} },
  },
  (_arguments, { project }) => tools.list(project),
);

p.tool(
  "add",
  {
    description: "Writes a note to self for the project.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "What the note says." },
      },
      required: ["text"],
    },
  },
  async (given, { project }) => {
    const said = await tools.add(project, given.text);
    await p.refresh("notes", project);
    return said;
  },
);

p.tool(
  "finish",
  {
    description: "Marks one of the project's notes done, by its id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The note's id, as list says it." },
      },
      required: ["id"],
    },
  },
  async (given, { project }) => {
    const said = await tools.finish(project, given.id);
    await p.refresh("notes", project);
    return said;
  },
);

/** What each project's last scan found, by row, so an action opens the
    place its row stands for. */
const found = new Map<string, Map<string, Hit>>();

/** The scan a project has running, so one project is never read twice at
    once. */
const scanning = new Map<string, Promise<Scan>>();

function scanOnce(project: string): Promise<Scan> {
  const running = scanning.get(project);
  if (running !== undefined) return running;
  const work = scan(project).finally(() => scanning.delete(project));
  scanning.set(project, work);
  return work;
}

p.section("todos", {
  title: "Todos",
  rows: async ({ project }) => {
    const result = await scanOnce(project);
    found.set(project, new Map(result.hits.map((hit) => [hitId(hit), hit])));
    return todoRows(result);
  },
});

p.action("todos", "open", ({ row, project }) => {
  const hit = row === null ? undefined : found.get(project)?.get(row.id);
  if (hit === undefined) return;
  p.open(project, {
    path: hit.path,
    from: hit.line,
    to: hit.line,
    note: says(hit),
  });
});

const ADD: Action = {
  id: "add",
  label: "Add",
  input: [
    { id: "text", label: "Note", kind: "text", placeholder: "Note to self" },
  ],
};

const CLEAR: Action = { id: "clear", label: "Clear done" };

/** What each project's notes held when they were last drawn, so the
    header carries clearing only while there is something to clear. */
const anyDone = new Map<string, boolean>();

p.section("notes", {
  title: "Notes",
  actions: ({ project }) =>
    anyDone.get(project) === true ? [ADD, CLEAR] : [ADD],
  rows: async ({ project }) => {
    const kept = await store.notes(project);
    anyDone.set(
      project,
      kept.some((note) => note.done),
    );
    return noteRows(kept, store.seconds());
  },
});

p.action("notes", "add", async ({ input, project }) => {
  await store.add(project, input.text ?? "");
});

p.action("notes", "clear", async ({ project }) => {
  await store.clear(project);
});

p.action("notes", "done", async ({ row, project }) => {
  if (row !== null) await store.finish(project, row.id);
});

p.action("notes", "remove", async ({ row, project }) => {
  if (row !== null) await store.remove(project, row.id);
});

/** A tree that moved is a file that changed, and the code is read again
    once it has settled. */
const settling = new Map<string, ReturnType<typeof setTimeout>>();

p.on("tree", ({ project }) => {
  const waiting = settling.get(project);
  if (waiting !== undefined) clearTimeout(waiting);
  const timer = setTimeout(() => {
    settling.delete(project);
    void p.refresh("todos", project);
  }, SETTLE_MS);
  timer.unref?.();
  settling.set(project, timer);
});

p.on("project", ({ event, path }) => {
  if (event === "opened") return;
  found.delete(path);
  const waiting = settling.get(path);
  if (waiting === undefined) return;
  clearTimeout(waiting);
  settling.delete(path);
});

await p.run();

// The loop is over, and standard input is what holds the process up, so
// letting go of it is the plugin going when it was told to.
process.stdin.unref();
