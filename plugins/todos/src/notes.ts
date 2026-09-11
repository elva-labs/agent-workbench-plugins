/**
 * The notes a project's user keeps, which the code knows nothing about.
 * They live in one JSON file under the app's own directory in the home
 * directory, an object keyed by the project's path, and every change is a
 * read, a change and a write taken one at a time so two projects never
 * write over each other.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** A note to self, as it is kept and as a row draws it. */
export interface Note {
  id: string;
  text: string;
  done: boolean;
  /** When it was written, in seconds since the epoch. */
  at: number;
}

/** Every project's notes, by the project's path. */
type Kept = Record<string, Note[]>;

/** The environment variable that moves the notes somewhere other than the
    home directory. */
export const HOME = "WORKBENCH_TODOS_HOME";

/** Where the notes are kept. */
export function file(): string {
  const said = process.env[HOME];
  const home = said !== undefined && said !== "" ? said : homedir();
  return join(home, ".agent-workbench", "plugins", "todos", "notes.json");
}

/** Now, as a note's `at` is kept. */
export function seconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** How long ago a note was written, as its row says it. */
export function ago(at: number, now: number = seconds()): string {
  const since = Math.max(0, now - at);
  if (since < 60) return "just now";
  if (since < 60 * 60) return `${Math.floor(since / 60)}m ago`;
  if (since < 24 * 60 * 60) return `${Math.floor(since / (60 * 60))}h ago`;
  return `${Math.floor(since / (24 * 60 * 60))}d ago`;
}

/** A project's notes, newest first, the ones that are done among them. */
export async function notes(project: string): Promise<Note[]> {
  return inOrder(async () => ordered((await read())[project] ?? []));
}

/** Writes a note for a project and answers with it. */
export async function add(project: string, text: string): Promise<Note> {
  const said = text.trim();
  if (said === "") throw new Error("a note needs some text");
  return inOrder(async () => {
    const kept = await read();
    const had = kept[project] ?? [];
    const note: Note = {
      id: fresh(had),
      text: said,
      done: false,
      at: seconds(),
    };
    kept[project] = [note, ...had];
    await write(kept);
    return note;
  });
}

/** Marks a note done and answers with it, or null when the project has no
    note of that id. */
export async function finish(
  project: string,
  id: string,
): Promise<Note | null> {
  return inOrder(async () => {
    const kept = await read();
    const had = kept[project] ?? [];
    const note = had.find((note) => note.id === id);
    if (note === undefined) return null;
    note.done = true;
    kept[project] = had;
    await write(kept);
    return note;
  });
}

/** Takes a note away and answers with it, or null when the project has no
    note of that id. */
export async function remove(
  project: string,
  id: string,
): Promise<Note | null> {
  return inOrder(async () => {
    const kept = await read();
    const had = kept[project] ?? [];
    const note = had.find((note) => note.id === id);
    if (note === undefined) return null;
    put(
      kept,
      project,
      had.filter((other) => other.id !== id),
    );
    await write(kept);
    return note;
  });
}

/** Takes away every note of a project's that is done and answers with how
    many went. */
export async function clear(project: string): Promise<number> {
  return inOrder(async () => {
    const kept = await read();
    const had = kept[project] ?? [];
    const left = had.filter((note) => !note.done);
    if (left.length === had.length) return 0;
    put(kept, project, left);
    await write(kept);
    return had.length - left.length;
  });
}

function put(kept: Kept, project: string, notes: Note[]): void {
  if (notes.length === 0) delete kept[project];
  else kept[project] = notes;
}

function ordered(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.at - a.at);
}

/** An id no other note of the project has. */
function fresh(notes: Note[]): string {
  for (;;) {
    const id = randomBytes(4).toString("hex");
    if (!notes.some((note) => note.id === id)) return id;
  }
}

/** One change at a time, so a read and the write that follows it never sit
    inside another's. */
let queue: Promise<unknown> = Promise.resolve();

function inOrder<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/** What the file holds, and nothing at all when it is missing or is not
    what it should be. */
async function read(): Promise<Kept> {
  let text: string;
  try {
    text = await readFile(file(), "utf8");
  } catch {
    return {};
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const kept: Kept = {};
  for (const [project, notes] of Object.entries(value)) {
    if (!Array.isArray(notes)) continue;
    const sound = notes.filter(isNote);
    if (sound.length > 0) kept[project] = sound;
  }
  return kept;
}

function isNote(value: unknown): value is Note {
  if (typeof value !== "object" || value === null) return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.id === "string" &&
    note.id !== "" &&
    typeof note.text === "string" &&
    note.text !== "" &&
    typeof note.done === "boolean" &&
    typeof note.at === "number"
  );
}

/** The whole file at once, written beside itself and moved into place, so
    a reader sees either what was there or all of what is now. */
async function write(kept: Kept): Promise<void> {
  const path = file();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, `${JSON.stringify(kept, null, 2)}\n`, "utf8");
  await rename(temp, path);
}
