/**
 * The branches a project has of its own, each with the commit it stands
 * on. Remote branches are the graph's business, not this section's.
 */

import { output } from "./git.js";

/** One local branch. */
export interface Branch {
  name: string;
  /** Whether the head is on it. */
  current: boolean;
  /** The short sha of the commit it stands on. */
  head: string;
  /** That commit's subject. */
  subject: string;
}

/** The format every field of a branch comes back in, tab between each. */
const FORMAT =
  "--format=%(refname:short)%09%(HEAD)%09%(objectname:short)%09%(contents:subject)";

/** The project's local branches, in the order git sorts them. */
export async function branches(project: string): Promise<Branch[]> {
  return parse(await output(project, ["for-each-ref", FORMAT, "refs/heads"]));
}

/** The lines `for-each-ref` writes under that format. */
export function parse(text: string): Branch[] {
  const found: Branch[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const [name, head, sha, ...rest] = line.split("\t");
    if (name === undefined || name === "") continue;
    found.push({
      name,
      current: (head ?? "").trim() === "*",
      head: sha ?? "",
      subject: rest.join("\t"),
    });
  }
  return found;
}
