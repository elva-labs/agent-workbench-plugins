/**
 * The git plugin: what the repository holds, as the Git section and the
 * Branches group under the tree, a page of the log in the changes pane,
 * and three tools for the agent. Everything it knows it asks `git` in the
 * project for.
 */

import { plugin } from "@elva-labs/workbench-plugin";
import { branches } from "./branches.js";
import { graph, show } from "./log.js";
import { page } from "./page.js";
import {
  BRANCH_ACTIONS,
  branchRows,
  STATUS_ACTIONS,
  statusDetail,
  statusRows,
} from "./rows.js";
import { name, status, type Status } from "./status.js";
import { seconds, stashes } from "./stashes.js";
import * as taken from "./taken.js";
import * as tools from "./tools.js";
import { pull, push } from "./work.js";

/** How long a tree that moved is left alone before the repository is
    read again. */
const SETTLE_MS = 400;

const p = plugin({ name: "git", version: "0.1.0", view: "full" });

/** The read a project has running, so one project is never read twice at
    once. */
const reading = new Map<string, Promise<Status>>();

function readOnce(project: string): Promise<Status> {
  const running = reading.get(project);
  if (running !== undefined) return running;
  const fresh = status(project).finally(() => reading.delete(project));
  reading.set(project, fresh);
  return fresh;
}

p.tool(
  "status",
  {
    description:
      "The branch the project is on, where it stands against its upstream, and every file that has changed.",
    inputSchema: { type: "object", properties: {} },
  },
  async (_arguments, { project }) => tools.statusText(await readOnce(project)),
);

p.tool(
  "commit",
  {
    description:
      "Commits what is staged, or everything in the working tree when all is true.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "What the commit says." },
        all: {
          type: "boolean",
          description: "Stage every change in the working tree first.",
        },
      },
      required: ["message"],
    },
  },
  async (given, { project }) => {
    const said = await tools.commit(project, given);
    await refresh(project);
    return said;
  },
);

p.tool(
  "log",
  {
    description: "The recent commits, one per line, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: `How many commits, ${tools.RECENT} by default and ${tools.MOST} at most.`,
        },
      },
    },
  },
  (given, { project }) => tools.log(project, given),
);

p.section("status", {
  title: "Git",
  actions: STATUS_ACTIONS,
  detail: async ({ project }) => statusDetail(await readOnce(project)),
  rows: async ({ project }) => {
    const [held, put] = await Promise.all([
      readOnce(project),
      stashes(project),
    ]);
    // The page says what the rows say, so it goes whenever they do.
    void send(project);
    return statusRows(held, put, seconds());
  },
});

p.section("branches", {
  title: "Branches",
  actions: BRANCH_ACTIONS,
  // A repository holds branches enough that the group is left closed
  // until it is asked for.
  folded: true,
  rows: async ({ project }) => branchRows(await branches(project)),
});

p.action("status", "open", ({ row, project }) => {
  const file = taken.opened(row);
  if (file !== null) p.diff(project, file);
});

p.action("status", "stage", ({ row, project }) => taken.stage(project, row));

p.action("status", "unstage", ({ row, project }) =>
  taken.unstage(project, row),
);

p.action("status", "discard", ({ row, input, project }) =>
  taken.discard(project, row, input),
);

p.action("status", "commit", ({ input, project }) =>
  taken.commit(project, input),
);

p.action("status", "pull", ({ project }) => pull(project));

p.action("status", "push", ({ project }) => push(project));

p.action("status", "stash", ({ input, project }) =>
  taken.stash(project, input),
);

// The rows go again when any action is done, which is the whole of what
// refreshing is.
p.action("status", "refresh", () => {});

p.action("status", "apply", ({ row, project }) => taken.apply(project, row));

p.action("status", "pop", ({ row, project }) => taken.pop(project, row));

p.action("status", "drop", ({ row, input, project }) =>
  taken.drop(project, row, input),
);

// The branch that changed is the whole of the Git section and the page
// too; the Branches section itself goes again once the action is done.
p.action("branches", "switch", async ({ row, project }) => {
  await taken.switchTo(project, row);
  await p.refresh("status", project);
});

p.action("branches", "new", async ({ input, project }) => {
  await taken.create(project, input);
  await p.refresh("status", project);
});

/** The page each project was last sent, so one that has not changed is
    not sent again: the page the user is reading stays where it was. */
const sent = new Map<string, string>();

/** The page for a project, as the graph stands now. A project whose log
    cannot be read has no page to show. */
async function send(project: string): Promise<void> {
  try {
    const [held, entries] = await Promise.all([
      readOnce(project),
      graph(project),
    ]);
    const html = page(name(held.head), entries);
    if (sent.get(project) === html) return;
    sent.set(project, html);
    p.view(project, { html });
  } catch {
    // A directory that is no repository of git's has nothing to draw.
  }
}

/** Everything the tree shows of a project, after something changed it. */
async function refresh(project: string): Promise<void> {
  await Promise.all([
    p.refresh("status", project),
    p.refresh("branches", project),
  ]);
}

p.on("view_message", async ({ project, payload }) => {
  const asked = payload as { commit?: unknown } | null;
  const sha = typeof asked?.commit === "string" ? asked.commit : "";
  try {
    p.viewData(project, { commit: sha, text: await show(project, sha) });
  } catch (error) {
    p.viewData(project, {
      commit: sha,
      text: error instanceof Error ? error.message : "that commit is gone",
    });
  }
});

/** A tree that moved is a file that changed, and the repository is read
    again once it has settled. */
const settling = new Map<string, ReturnType<typeof setTimeout>>();

p.on("tree", ({ project }) => {
  const waiting = settling.get(project);
  if (waiting !== undefined) clearTimeout(waiting);
  const timer = setTimeout(() => {
    settling.delete(project);
    void refresh(project);
  }, SETTLE_MS);
  timer.unref?.();
  settling.set(project, timer);
});

p.on("project", ({ event, path }) => {
  if (event === "opened") return;
  sent.delete(path);
  const waiting = settling.get(path);
  if (waiting === undefined) return;
  clearTimeout(waiting);
  settling.delete(path);
});

await p.run();

// The loop is over, and standard input is what holds the process up, so
// letting go of it is the plugin going when it was told to.
process.stdin.unref();
