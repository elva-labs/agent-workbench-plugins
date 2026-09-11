/**
 * What the repository holds right now: the branch it is on, where that
 * branch stands against its upstream, and every file git says has
 * changed. It is one `git status --porcelain=v1 --branch`, read line by
 * line, with the short sha asked for only when there is no branch to name.
 */

import type { RowState } from "@elva-labs/workbench-plugin";
import { git, output } from "./git.js";

/** One file git says has changed. */
export interface Change {
  /** The path as it stands now, relative to the project. */
  path: string;
  /** The index letter and the worktree letter, as git wrote them. */
  index: string;
  work: string;
  /** Where a rename came from, when the change is one. */
  from: string | null;
}

/** Where the repository's head is. */
export interface Head {
  /** The branch, or null when the head is detached. */
  branch: string | null;
  /** The short sha the head is at. Empty in a repository with no commits
      yet. */
  head: string;
  upstream: string | null;
  ahead: number;
  behind: number;
}

/** The head and the changed files, as one read gives them. */
export interface Status {
  head: Head;
  changes: Change[];
}

/** The pairs of letters that stand for a file both sides have touched. */
const CONFLICTS = new Map([
  ["DD", "both deleted"],
  ["AU", "added by us"],
  ["UD", "deleted by them"],
  ["UA", "added by them"],
  ["DU", "deleted by us"],
  ["AA", "both added"],
  ["UU", "both modified"],
]);

/** What each letter git writes says in words. */
const WORDS = new Map([
  ["M", "modified"],
  ["A", "new"],
  ["D", "deleted"],
  ["R", "renamed"],
  ["C", "copied"],
  ["T", "type changed"],
]);

/** The project's head and changed files. */
export async function status(project: string): Promise<Status> {
  const said = await output(project, [
    "status",
    "--porcelain=v1",
    "--branch",
    "--untracked-files=normal",
  ]);
  const read = parse(said);
  if (read.head.branch !== null || read.head.head !== "") return read;
  const run = await git(project, ["rev-parse", "--short", "--verify", "HEAD"]);
  const head = run.code === 0 ? run.stdout.trim() : "";
  return { head: { ...read.head, head }, changes: read.changes };
}

/** The head and the changes one porcelain read holds. */
export function parse(text: string): Status {
  let head: Head = {
    branch: null,
    head: "",
    upstream: null,
    ahead: 0,
    behind: 0,
  };
  const changes: Change[] = [];
  for (const line of text.split("\n")) {
    if (line === "") continue;
    if (line.startsWith("## ")) {
      head = branchLine(line.slice(3));
      continue;
    }
    const change = changeLine(line);
    if (change !== null) changes.push(change);
  }
  return { head, changes };
}

/** The `## main...origin/main [ahead 2, behind 1]` line, in its every
    shape: a branch alone, a head with no branch, and a branch with no
    commits on it yet. */
function branchLine(said: string): Head {
  const head: Head = {
    branch: null,
    head: "",
    upstream: null,
    ahead: 0,
    behind: 0,
  };
  if (said.startsWith("HEAD (no branch)")) return head;
  const yet = /^No commits yet on (.+)$/.exec(said);
  if (yet !== null) {
    head.branch = (yet[1] ?? "").trim();
    return head;
  }
  const counted = /\s\[(.+)\]$/.exec(said);
  const names = counted === null ? said : said.slice(0, counted.index);
  const at = names.indexOf("...");
  head.branch = at === -1 ? names.trim() : names.slice(0, at).trim();
  if (at !== -1) head.upstream = names.slice(at + 3).trim();
  const counts = counted?.[1] ?? "";
  head.ahead = count(counts, "ahead");
  head.behind = count(counts, "behind");
  return head;
}

function count(counts: string, which: string): number {
  const found = new RegExp(`${which} (\\d+)`).exec(counts);
  return found === null ? 0 : Number(found[1]);
}

/** One `XY path` line, with the arrow a rename writes. */
function changeLine(line: string): Change | null {
  if (line.length < 4) return null;
  const index = line[0] ?? " ";
  const work = line[1] ?? " ";
  const rest = line.slice(3);
  const arrow = rest.indexOf(" -> ");
  if (index === "R" || index === "C") {
    if (arrow !== -1) {
      return {
        path: unquote(rest.slice(arrow + 4)),
        index,
        work,
        from: unquote(rest.slice(0, arrow)),
      };
    }
  }
  return { path: unquote(rest), index, work, from: null };
}

/**
 * A path as git wrote it. Anything with a space, a quote or a byte that
 * is not plain text in it comes back in double quotes, with the C escapes
 * git writes.
 */
export function unquote(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"') || path.length < 2) {
    return path;
  }
  const inside = path.slice(1, -1);
  const bytes: number[] = [];
  for (let at = 0; at < inside.length; at += 1) {
    const char = inside[at] ?? "";
    if (char !== "\\") {
      for (const byte of Buffer.from(char, "utf8")) bytes.push(byte);
      continue;
    }
    const next = inside[at + 1] ?? "";
    at += 1;
    const escape = ESCAPES.get(next);
    if (escape !== undefined) {
      bytes.push(escape);
      continue;
    }
    const octal = inside.slice(at, at + 3);
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      at += 2;
      continue;
    }
    for (const byte of Buffer.from(next, "utf8")) bytes.push(byte);
  }
  return Buffer.from(bytes).toString("utf8");
}

const ESCAPES = new Map([
  ['"', 0x22],
  ["\\", 0x5c],
  ["a", 0x07],
  ["b", 0x08],
  ["f", 0x0c],
  ["n", 0x0a],
  ["r", 0x0d],
  ["t", 0x09],
  ["v", 0x0b],
]);

/** Whether both sides have touched a file. */
export function conflicted(change: Change): boolean {
  return CONFLICTS.has(`${change.index}${change.work}`);
}

/** Whether git has never been told about a file. */
export function untracked(change: Change): boolean {
  return change.index === "?" && change.work === "?";
}

/** What a change's dot says: a conflict is failed, anything the index has
    not been told about is waiting, and what is staged whole is ok. */
export function state(change: Change): RowState {
  if (conflicted(change)) return "failed";
  if (change.work !== " ") return "waiting";
  return "ok";
}

/** What a change reads as under its row. */
export function words(change: Change): string {
  if (untracked(change)) return "untracked";
  const conflict = CONFLICTS.get(`${change.index}${change.work}`);
  if (conflict !== undefined) return `conflict, ${conflict}`;
  const said: string[] = [];
  if (change.index !== " ") {
    said.push(
      change.index === "R" && change.from !== null
        ? `renamed from ${change.from}`
        : `staged, ${word(change.index)}`,
    );
  }
  if (change.work !== " ") said.push(word(change.work));
  return said.join(", then ");
}

function word(letter: string): string {
  return WORDS.get(letter) ?? "changed";
}

/** Where the branch stands, as the first row says it. */
export function standing(head: Head): string {
  if (head.upstream === null) return "no upstream";
  const counts: string[] = [];
  if (head.ahead > 0) counts.push(`${head.ahead} ahead`);
  if (head.behind > 0) counts.push(`${head.behind} behind`);
  if (counts.length === 0) counts.push("up to date");
  return [head.upstream, ...counts].join(", ");
}

/** What the branch row calls the head. */
export function name(head: Head): string {
  if (head.branch !== null) return head.branch;
  return head.head === "" ? "detached" : `detached at ${head.head}`;
}
