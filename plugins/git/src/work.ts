/**
 * What the actions and the tools do to the repository. Each one is a git
 * of its own, and what git says when it refuses is what the caller is
 * given.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { git, output } from "./git.js";

/** Whether anything is staged for the next commit. */
export async function staged(project: string): Promise<boolean> {
  const run = await git(project, ["diff", "--cached", "--quiet"]);
  return run.code !== 0;
}

/** Stages a file, the whole of what has happened to it. */
export async function stage(project: string, path: string): Promise<void> {
  await output(project, ["add", "--", path]);
}

/** Takes a file back out of the index, leaving the file itself alone. */
export async function unstage(project: string, path: string): Promise<void> {
  await output(project, ["restore", "--staged", "--", path]);
}

/**
 * Throws away what a file holds: back to the commit for a file git knows,
 * off the disk for one it does not. Neither can be undone.
 */
export async function discard(
  project: string,
  path: string,
  isUntracked: boolean,
): Promise<void> {
  if (isUntracked) {
    await rm(join(project, path), { recursive: true, force: true });
    return;
  }
  await output(project, ["checkout", "--", path]);
}

/**
 * Commits what is staged, or everything in the working tree first. The
 * message goes in on standard input, so no message is ever an argument.
 */
export async function commit(
  project: string,
  message: string,
  all: boolean,
): Promise<string> {
  const said = message.trim();
  if (said === "") throw new Error("a commit needs a message");
  if (all) await output(project, ["add", "--all"]);
  else if (!(await staged(project))) {
    throw new Error("there is nothing staged to commit");
  }
  await output(project, ["commit", "--file=-"], `${said}\n`);
  return (await output(project, ["log", "-n", "1", "--pretty=%h%x09%s"]))
    .trim()
    .split("\t")
    .join(" ");
}

/** Brings in what the upstream has. */
export async function pull(project: string): Promise<void> {
  await output(project, ["pull"]);
}

/** Sends what the branch has. */
export async function push(project: string): Promise<void> {
  await output(project, ["push"]);
}

/** Puts the working tree away, under a message when there is one. */
export async function stash(project: string, message: string): Promise<void> {
  const said = message.trim();
  if (said.startsWith("-")) {
    throw new Error("a stash message cannot start with a dash");
  }
  await output(
    project,
    said === "" ? ["stash", "push"] : ["stash", "push", "-m", said],
  );
}

/** Puts a stash back, and keeps it. */
export async function apply(project: string, ref: string): Promise<void> {
  await output(project, ["stash", "apply", ref]);
}

/** Puts a stash back, and takes it off the list. */
export async function pop(project: string, ref: string): Promise<void> {
  await output(project, ["stash", "pop", ref]);
}

/** Takes a stash off the list without putting it back. */
export async function drop(project: string, ref: string): Promise<void> {
  await output(project, ["stash", "drop", ref]);
}

/** Moves the head onto a branch, which git refuses while the tree holds
    changes it would write over. */
export async function switchTo(project: string, name: string): Promise<void> {
  await output(project, ["switch", named(name)]);
}

/** Makes a branch from the one the head is on, and moves onto it. */
export async function create(project: string, name: string): Promise<void> {
  await output(project, ["switch", "-c", named(name)]);
}

/** A branch name as it was given, with the emptiness git would only
    answer with a longer complaint about. */
function named(name: string): string {
  const said = name.trim();
  if (said === "") throw new Error("a branch needs a name");
  return said;
}
