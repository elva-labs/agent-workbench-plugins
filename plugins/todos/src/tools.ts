/**
 * What the agent is told by each of the three tools. A tool answers with
 * text, and says the id of every note so one of them can be finished.
 */

import {
  ago,
  add as keep,
  finish as mark,
  notes,
  seconds,
  type Note,
} from "./notes.js";
import { LIMIT, scan, type Hit } from "./scan.js";

/** The project's notes and the comments in its code, notes first. */
export async function list(
  project: string,
  now: number = seconds(),
): Promise<string> {
  const [kept, found] = await Promise.all([notes(project), scan(project)]);
  const open = kept.filter((note) => !note.done);
  const lines: string[] = [];
  lines.push(open.length === 0 ? "No notes." : `${many(open.length, "note")}:`);
  for (const note of open) {
    lines.push(`  ${note.id}  ${note.text} (${ago(note.at, now)})`);
  }
  lines.push("");
  lines.push(
    found.hits.length === 0
      ? "No TODO or FIXME comments in the code."
      : `${many(found.hits.length, "TODO or FIXME comment")} in the code:`,
  );
  for (const hit of found.hits) {
    lines.push(`  ${hit.path}:${hit.line}  ${said(hit)}`);
  }
  if (found.capped) lines.push(`  The scan stops at ${LIMIT} hits.`);
  return lines.join("\n");
}

/** Writes a note for the project. */
export async function add(project: string, text: unknown): Promise<string> {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("add needs the text of a note");
  }
  const note = await keep(project, text);
  return `Added note ${note.id}: ${note.text}`;
}

/** Marks one of the project's notes done. */
export async function finish(project: string, id: unknown): Promise<string> {
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error("finish needs the id of a note");
  }
  const note: Note | null = await mark(project, id.trim());
  if (note === null) {
    return `There is no note ${id.trim()} in this project. The list tool says which ids there are.`;
  }
  return `Finished note ${note.id}: ${note.text}`;
}

function said(hit: Hit): string {
  return `${hit.marker} ${hit.text}`.trim();
}

function many(count: number, what: string): string {
  return `${count} ${what}${count === 1 ? "" : "s"}`;
}
