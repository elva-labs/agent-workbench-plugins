/**
 * What the agent is told by each of the three tools. A tool answers with
 * text, and what git refused to do is what the agent reads back.
 */

import { recent } from "./log.js";
import { name, standing, words, type Status } from "./status.js";
import { commit as make } from "./work.js";

/** How many commits the log tool answers with when it is not told. */
export const RECENT = 20;

/** The most it answers with however it is asked. */
export const MOST = 200;

/** The branch, where it stands, and every file that has changed. */
export function statusText(status: Status): string {
  const lines = [`${name(status.head)} (${standing(status.head)})`, ""];
  if (status.changes.length === 0) {
    lines.push("Nothing has changed.");
    return lines.join("\n");
  }
  lines.push(
    `${status.changes.length} changed file${status.changes.length === 1 ? "" : "s"}:`,
  );
  for (const change of status.changes) {
    lines.push(`  ${change.path}  (${words(change)})`);
  }
  return lines.join("\n");
}

/** Commits, and answers with what the commit is called. */
export async function commit(
  project: string,
  given: Record<string, unknown>,
): Promise<string> {
  const message = given.message;
  if (typeof message !== "string" || message.trim() === "") {
    throw new Error("commit needs a message");
  }
  const all = given.all === true;
  return `Committed ${await make(project, message, all)}`;
}

/** The recent commits, one per line. */
export async function log(
  project: string,
  given: Record<string, unknown>,
): Promise<string> {
  const lines = await recent(project, limit(given.limit));
  return lines.length === 0 ? "No commits yet." : lines.join("\n");
}

/** How many commits were asked for, within what the tool answers with. */
function limit(given: unknown): number {
  const asked = typeof given === "number" ? Math.floor(given) : RECENT;
  if (!Number.isFinite(asked) || asked < 1) return RECENT;
  return Math.min(asked, MOST);
}
