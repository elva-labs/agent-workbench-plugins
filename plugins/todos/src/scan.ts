/**
 * What the code says: the TODO and FIXME comments in a project's files.
 * Which files those are is what git tracks, when the project is a
 * repository, and otherwise a walk of the directory.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** One comment a scan found, where it is and what it says. */
export interface Hit {
  /** The file, relative to the project. */
  path: string;
  /** The line it is on, counted from one. */
  line: number;
  marker: "TODO" | "FIXME";
  /** What follows the marker, cut to a row's width. Empty when the marker
      stands on its own. */
  text: string;
}

/** What a scan found, and whether it stopped at the cap. */
export interface Scan {
  hits: Hit[];
  capped: boolean;
}

/** How many hits a scan reports before it stops. */
export const LIMIT = 500;

/** How much of a marker's text a row holds. */
export const WIDTH = 80;

/** Files larger than this are left alone. */
const BIG = 512 * 1024;

/** How much of a file is looked at for the NUL byte that says it is not
    text. */
const SNIFF = 8 * 1024;

/** Directories a walk never goes into, on top of every dot directory. */
const SKIP = new Set(["node_modules", ".git", "dist", "build", "target"]);

const MARKER = /\b(TODO|FIXME)\b/;

/** What a hit reads as: what its marker says, or the marker itself when it
    says nothing. */
export function says(hit: Hit): string {
  return hit.text === "" ? hit.marker : hit.text;
}

/** The project's TODO and FIXME comments, in the order the files are read
    and the lines come. */
export async function scan(project: string): Promise<Scan> {
  const hits: Hit[] = [];
  for (const path of await files(project)) {
    if (hits.length >= LIMIT) return { hits, capped: true };
    const text = await contents(join(project, path));
    if (text === null) continue;
    for (const hit of marked(path, text)) {
      if (hits.length >= LIMIT) return { hits, capped: true };
      hits.push(hit);
    }
  }
  return { hits, capped: false };
}

/** The files to read, sorted, so the rows stand in the same order twice. */
async function files(project: string): Promise<string[]> {
  if (existsSync(join(project, ".git"))) {
    const tracked = await listed(project);
    if (tracked !== null) return tracked;
  }
  const found: string[] = [];
  await walk(project, "", found);
  return found;
}

/** What git tracks in the project, or null when git had nothing to say. */
async function listed(project: string): Promise<string[] | null> {
  try {
    const { stdout } = await run("git", ["ls-files", "-z"], {
      cwd: project,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout
      .split("\0")
      .filter((path) => path !== "")
      .sort();
  } catch {
    return null;
  }
}

async function walk(root: string, at: string, found: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(join(root, at), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = at === "" ? entry.name : `${at}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
      await walk(root, path, found);
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
}

/** A file's text, or null when it is too big, not text, or unreadable. */
async function contents(path: string): Promise<string | null> {
  try {
    const about = await stat(path);
    if (!about.isFile() || about.size > BIG) return null;
    const bytes = await readFile(path);
    if (bytes.subarray(0, SNIFF).includes(0)) return null;
    return bytes.toString("utf8");
  } catch {
    return null;
  }
}

function* marked(path: string, text: string): Generator<Hit> {
  const lines = text.split("\n");
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    const found = MARKER.exec(line);
    if (found === null) continue;
    const marker = found[1] === "FIXME" ? "FIXME" : "TODO";
    yield {
      path,
      line: at + 1,
      marker,
      text: cut(rest(line.slice(found.index + marker.length))),
    };
  }
}

/** What a marker says: the rest of its line, without the punctuation that
    joins it to the marker or the comment that closes around it. */
function rest(after: string): string {
  return after
    .replace(/^[\s:,;.\-]+/, "")
    .replace(/(\*\/|-->|--}|\*\))\s*$/, "")
    .trim();
}

function cut(text: string): string {
  if (text.length <= WIDTH) return text;
  return `${text.slice(0, WIDTH - 1).trimEnd()}…`;
}
