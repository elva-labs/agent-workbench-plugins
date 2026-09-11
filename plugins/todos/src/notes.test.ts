import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  HOME,
  add,
  ago,
  clear,
  file,
  finish,
  notes,
  remove,
  seconds,
} from "./notes.js";

const ONE = "/srv/orbit-api";
const TWO = "/srv/orbit-web";

let home: string;
const was = process.env[HOME];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "todos-notes-"));
  process.env[HOME] = home;
});

afterEach(async () => {
  if (was === undefined) delete process.env[HOME];
  else process.env[HOME] = was;
  await rm(home, { recursive: true, force: true });
});

/** What the file holds, read as the app's own directory has it. */
async function kept(): Promise<Record<string, unknown[]>> {
  return JSON.parse(await readFile(file(), "utf8"));
}

it("keeps a note under the project's path in the app's own directory", async () => {
  const note = await add(ONE, "  Ask about the retry budget  ");

  expect(file()).toBe(
    join(home, ".agent-workbench", "plugins", "todos", "notes.json"),
  );
  expect(note.id).not.toBe("");
  expect(note.text).toBe("Ask about the retry budget");
  expect(note.done).toBe(false);
  expect(Math.abs(note.at - seconds())).toBeLessThan(5);
  expect(await notes(ONE)).toEqual([note]);
  expect(Object.keys(await kept())).toEqual([ONE]);
});

it("refuses a note with nothing in it", async () => {
  await expect(add(ONE, "   ")).rejects.toThrow("a note needs some text");
});

it("keeps the newest note first", async () => {
  const first = await add(ONE, "The first");
  const second = await add(ONE, "The second");

  expect((await notes(ONE)).map((note) => note.text)).toEqual([
    second.text,
    first.text,
  ]);
  expect(first.id).not.toBe(second.id);
});

it("marks a note done and leaves it where it is", async () => {
  const note = await add(ONE, "Ask about the retry budget");

  expect(await finish(ONE, note.id)).toMatchObject({ id: note.id, done: true });
  expect(await notes(ONE)).toEqual([{ ...note, done: true }]);
  expect(await finish(ONE, "nothing")).toBeNull();
});

it("takes a note away", async () => {
  const going = await add(ONE, "Going");
  const staying = await add(ONE, "Staying");

  expect(await remove(ONE, going.id)).toEqual(going);
  expect(await notes(ONE)).toEqual([staying]);
  expect(await remove(ONE, going.id)).toBeNull();
});

it("clears the notes that are done and says how many went", async () => {
  const first = await add(ONE, "The first");
  await add(ONE, "The second");
  const third = await add(ONE, "The third");
  await finish(ONE, first.id);
  await finish(ONE, third.id);

  expect(await clear(ONE)).toBe(2);
  expect((await notes(ONE)).map((note) => note.text)).toEqual(["The second"]);
  expect(await clear(ONE)).toBe(0);
});

it("keeps each project's notes through writes at the same time", async () => {
  await Promise.all([
    add(ONE, "One's first"),
    add(TWO, "Two's first"),
    add(ONE, "One's second"),
    add(TWO, "Two's second"),
    add(ONE, "One's third"),
  ]);

  expect((await notes(ONE)).map((note) => note.text).sort()).toEqual([
    "One's first",
    "One's second",
    "One's third",
  ]);
  expect((await notes(TWO)).map((note) => note.text).sort()).toEqual([
    "Two's first",
    "Two's second",
  ]);
  expect(Object.keys(await kept()).sort()).toEqual([ONE, TWO]);
});

it("leaves a project's notes alone while another project writes", async () => {
  const theirs = await add(TWO, "Two's own");

  await Promise.all([
    add(ONE, "One's own"),
    clear(ONE),
    remove(ONE, "nothing"),
  ]);

  expect(await notes(TWO)).toEqual([theirs]);
});

it("starts empty when the file is not there or holds something else", async () => {
  expect(await notes(ONE)).toEqual([]);

  await mkdir(dirname(file()), { recursive: true });
  await writeFile(file(), "not json at all");
  expect(await notes(ONE)).toEqual([]);

  await writeFile(file(), JSON.stringify({ [ONE]: [{ id: "" }, 7] }));
  expect(await notes(ONE)).toEqual([]);

  const note = await add(ONE, "After the mess");
  expect(await notes(ONE)).toEqual([note]);
});

it("says how long ago a note was written", () => {
  const now = 1_800_000_000;

  expect(ago(now, now)).toBe("just now");
  expect(ago(now - 59, now)).toBe("just now");
  expect(ago(now - 5 * 60, now)).toBe("5m ago");
  expect(ago(now - 2 * 60 * 60, now)).toBe("2h ago");
  expect(ago(now - 3 * 24 * 60 * 60, now)).toBe("3d ago");
});
