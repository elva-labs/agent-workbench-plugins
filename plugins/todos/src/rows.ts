/**
 * The rows the two sections put under the tree, and the actions each row
 * carries. A row's id is what an action is given back, so a todo's id says
 * which place to open and a note's is the note's own.
 */

import type { Action, Row } from "@elva-labs/workbench-plugin";
import { ago, type Note } from "./notes.js";
import { LIMIT, says, type Hit, type Scan } from "./scan.js";

/** The row a hit stands on, which is the file and the line it is at. */
export function hitId(hit: Hit): string {
  return `${hit.path}:${hit.line}`;
}

/** The id of the row that says a scan stopped at the cap. It holds no
    colon, so no hit's row is ever called the same. */
export const CAP = "cap";

const OPEN: Action[] = [{ id: "open", label: "Open" }];

const KEEPING: Action[] = [
  { id: "done", label: "Done" },
  { id: "remove", label: "Remove" },
];

/** One row per comment, and a last row when there were more than the scan
    reads. */
export function todoRows(scan: Scan): Row[] {
  const rows: Row[] = scan.hits.map((hit) => ({
    id: hitId(hit),
    label: says(hit),
    detail: hitId(hit),
    actions: OPEN,
    default: "open",
  }));
  if (scan.capped) {
    rows.push({
      id: CAP,
      label: `Stopped at ${LIMIT} hits`,
      detail: "there are more in the project",
    });
  }
  return rows;
}

/** One row per note that is not done, newest first. */
export function noteRows(notes: Note[], now: number): Row[] {
  return notes
    .filter((note) => !note.done)
    .map((note) => ({
      id: note.id,
      label: note.text,
      detail: ago(note.at, now),
      actions: KEEPING,
      default: "done",
    }));
}
