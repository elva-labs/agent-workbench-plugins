/**
 * The log, in the two shapes the plugin shows it: the graph the page
 * draws, and the plain lines the agent's tool reads. One commit is asked
 * about on its own when the page wants what it changed.
 */

import { git, output, trouble } from "./git.js";

/** One line of `log --graph`: the graph drawn to the left of it, and the
    commit's fields when the line stands on one. */
export interface Entry {
  /** The graph characters, as git drew them. */
  graph: string;
  /** The short sha, empty on a line that is graph alone. */
  sha: string;
  /** The branches and tags pointing here, without the parentheses. */
  refs: string;
  author: string;
  date: string;
  subject: string;
}

/** How many commits the graph holds. */
export const LIMIT = 200;

/** The characters git draws the graph out of. */
const DRAWN = /^[*|\\/_\-. ]*/;

/** The graph of the branches and what they came from, newest first. */
export async function graph(
  project: string,
  limit: number = LIMIT,
): Promise<Entry[]> {
  return parse(
    await output(project, [
      "log",
      "--graph",
      "--no-color",
      "--date=short",
      "--pretty=%h%x09%d%x09%an%x09%ad%x09%s",
      "-n",
      String(limit),
      "--branches",
      "--remotes",
    ]),
  );
}

/** The lines `log --graph` writes: the graph up to the commit, and the
    commit's fields after it. */
export function parse(text: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const drawn = DRAWN.exec(line)?.[0] ?? "";
    const rest = line.slice(drawn.length);
    const [sha, refs, author, date, ...subject] = rest.split("\t");
    entries.push({
      graph: drawn.trimEnd(),
      sha: sha ?? "",
      refs: (refs ?? "").trim().replace(/^\(|\)$/g, ""),
      author: author ?? "",
      date: date ?? "",
      subject: subject.join("\t"),
    });
  }
  return entries;
}

/** The recent commits, one line each, as the agent's tool answers. A
    branch with nothing on it yet has none of them. */
export async function recent(
  project: string,
  limit: number,
): Promise<string[]> {
  const run = await git(project, [
    "log",
    "--date=short",
    "--pretty=%h%x09%ad%x09%an%x09%s",
    "-n",
    String(limit),
  ]);
  if (run.code !== 0) {
    const head = await git(project, ["rev-parse", "--verify", "HEAD"]);
    if (head.code !== 0) return [];
    throw new Error(trouble(run));
  }
  return run.stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t").join("  "));
}

/** What one commit did, as the page shows it beside the graph. A sha the
    page sent is a sha and nothing else. */
export async function show(project: string, sha: string): Promise<string> {
  if (!/^[0-9a-f]{4,40}$/.test(sha)) {
    throw new Error(`${sha} is not a commit`);
  }
  return output(project, ["show", "--stat", "--date=short", sha]);
}
