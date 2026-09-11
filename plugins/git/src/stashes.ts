/**
 * The stashes a project is keeping: what git calls each one, what it says
 * about itself, and when it was put away.
 */

import { output } from "./git.js";

/** One stash, as its row draws it. */
export interface Stash {
  /** What git calls it, `stash@{0}` and the rest. */
  ref: string;
  /** When it was put away, in seconds since the epoch. */
  at: number;
  /** What git says it is: the branch it came off and the message. */
  message: string;
}

/** Now, as a stash's time is kept. */
export function seconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** The project's stashes, newest first, which is the order git lists
    them in. */
export async function stashes(project: string): Promise<Stash[]> {
  return parse(
    await output(project, ["stash", "list", "--pretty=%gd%x09%ct%x09%gs"]),
  );
}

/** The lines `stash list` writes, one stash each. */
export function parse(text: string): Stash[] {
  const found: Stash[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const [ref, at, ...rest] = line.split("\t");
    if (ref === undefined || rest.length === 0) continue;
    found.push({
      ref,
      at: Number.parseInt(at ?? "", 10) || 0,
      message: rest.join("\t"),
    });
  }
  return found;
}

/** How long ago a stash was put away, as its row says it. */
export function ago(at: number, now: number = seconds()): string {
  const since = Math.max(0, now - at);
  if (since < 60) return "just now";
  if (since < 60 * 60) return `${Math.floor(since / 60)}m ago`;
  if (since < 24 * 60 * 60) return `${Math.floor(since / (60 * 60))}h ago`;
  return `${Math.floor(since / (24 * 60 * 60))}d ago`;
}
