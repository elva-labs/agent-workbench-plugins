/**
 * What each of the sections' actions does once it is taken: the row read
 * for what it stands for, the input read for what was answered, and the
 * git that follows. An action that cannot be undone does nothing until it
 * is answered yes.
 */

import type { DiffOptions, Row } from "@elva-labs/workbench-plugin";
import { branchOf, fileOf, stashOf, sure } from "./rows.js";
import { status, untracked } from "./status.js";
import * as work from "./work.js";

/** The answers an action was given, by the field they were asked for. */
type Input = Record<string, string>;

/** The file's diff a row points at, or null for a row that is no file. */
export function opened(row: Row | null): DiffOptions | null {
  const path = fileOf(row);
  if (path === null) return null;
  const note = row?.detail ?? "";
  return { path, ...(note === "" ? {} : { note }) };
}

/** Stages what a row stands for. */
export async function stage(project: string, row: Row | null): Promise<void> {
  const path = fileOf(row);
  if (path !== null) await work.stage(project, path);
}

/** Takes what a row stands for back out of the index. */
export async function unstage(project: string, row: Row | null): Promise<void> {
  const path = fileOf(row);
  if (path !== null) await work.unstage(project, path);
}

/** Throws away what a row stands for, once that was answered yes. */
export async function discard(
  project: string,
  row: Row | null,
  input: Input,
): Promise<void> {
  const path = fileOf(row);
  if (path === null || !sure(input)) return;
  const change = (await status(project)).changes.find(
    (candidate) => candidate.path === path,
  );
  await work.discard(project, path, change !== undefined && untracked(change));
}

/** Commits, with what the header asked for. */
export async function commit(project: string, input: Input): Promise<void> {
  await work.commit(project, input.message ?? "", input.stage === "everything");
}

/** Puts the working tree away, under the message the header asked for. */
export async function stash(project: string, input: Input): Promise<void> {
  await work.stash(project, input.message ?? "");
}

/** Puts a stash back and keeps it. */
export async function apply(project: string, row: Row | null): Promise<void> {
  const ref = stashOf(row);
  if (ref !== null) await work.apply(project, ref);
}

/** Puts a stash back and takes it off the list. */
export async function pop(project: string, row: Row | null): Promise<void> {
  const ref = stashOf(row);
  if (ref !== null) await work.pop(project, ref);
}

/** Takes a stash off the list, once that was answered yes. */
export async function drop(
  project: string,
  row: Row | null,
  input: Input,
): Promise<void> {
  const ref = stashOf(row);
  if (ref !== null && sure(input)) await work.drop(project, ref);
}

/** Moves the head onto the branch a row stands for. */
export async function switchTo(
  project: string,
  row: Row | null,
): Promise<void> {
  const branch = branchOf(row);
  if (branch !== null) await work.switchTo(project, branch);
}

/** Makes a branch under the name the header asked for. */
export async function create(project: string, input: Input): Promise<void> {
  await work.create(project, input.name ?? "");
}
