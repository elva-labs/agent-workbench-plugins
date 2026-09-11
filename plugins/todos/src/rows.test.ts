import { expect, it } from "vitest";
import type { Action, Row } from "@elva-labs/workbench-plugin";
import type { Note } from "./notes.js";
import { CAP, noteRows, todoRows } from "./rows.js";
import { LIMIT, type Hit } from "./scan.js";

const HITS: Hit[] = [
  { path: "src/app.ts", line: 2, marker: "TODO", text: "wire this up" },
  { path: "src/app.ts", line: 9, marker: "FIXME", text: "" },
];

const NOW = 1_800_000_000;

const KEPT: Note[] = [
  { id: "a1b2c3d4", text: "Check the deploy", done: false, at: NOW - 5 * 60 },
  {
    id: "e5f6a7b8",
    text: "Ask about the retry budget",
    done: false,
    at: NOW - 3 * 24 * 60 * 60,
  },
  { id: "c9d0e1f2", text: "Already done", done: true, at: NOW - 60 * 60 },
];

/** What the app keeps of a row: an id, a label, one of the four states if
    any, and a default that names one of the row's own actions. */
const STATES = ["ok", "busy", "waiting", "failed"];

function sound(row: Row): boolean {
  const actions = row.actions ?? [];
  return (
    row.id !== "" &&
    row.label !== "" &&
    (row.state === undefined || STATES.includes(row.state)) &&
    actions.every(whole) &&
    (row.default === undefined ||
      actions.some((action) => action.id === row.default))
  );
}

function whole(action: Action): boolean {
  return (
    action.id !== "" &&
    action.label !== "" &&
    (action.input ?? []).every(
      (field) => field.id !== "" && ["text", "choice"].includes(field.kind),
    )
  );
}

it("draws a row per comment, opening the place it names", () => {
  expect(todoRows({ hits: HITS, capped: false })).toEqual([
    {
      id: "src/app.ts:2",
      label: "wire this up",
      detail: "src/app.ts:2",
      actions: [{ id: "open", label: "Open" }],
      default: "open",
    },
    {
      id: "src/app.ts:9",
      label: "FIXME",
      detail: "src/app.ts:9",
      actions: [{ id: "open", label: "Open" }],
      default: "open",
    },
  ]);
});

it("says on a last row that the scan stopped at the cap", () => {
  const rows = todoRows({ hits: HITS, capped: true });

  expect(rows).toHaveLength(HITS.length + 1);
  expect(rows[rows.length - 1]).toEqual({
    id: CAP,
    label: `Stopped at ${LIMIT} hits`,
    detail: "there are more in the project",
  });
});

it("draws a row per note that is not done, with how long ago it was written", () => {
  expect(noteRows(KEPT, NOW)).toEqual([
    {
      id: "a1b2c3d4",
      label: "Check the deploy",
      detail: "5m ago",
      actions: [
        { id: "done", label: "Done" },
        { id: "remove", label: "Remove" },
      ],
      default: "done",
    },
    {
      id: "e5f6a7b8",
      label: "Ask about the retry budget",
      detail: "3d ago",
      actions: [
        { id: "done", label: "Done" },
        { id: "remove", label: "Remove" },
      ],
      default: "done",
    },
  ]);
});

it("draws rows the app keeps", () => {
  const rows = [
    ...todoRows({ hits: HITS, capped: true }),
    ...noteRows(KEPT, NOW),
  ];

  expect(rows).not.toHaveLength(0);
  for (const row of rows) expect(sound(row)).toBe(true);
});

it("names every row by what an action needs to find it again", () => {
  expect(noteRows(KEPT, NOW).map((row) => row.id)).toEqual([
    "a1b2c3d4",
    "e5f6a7b8",
  ]);
  expect(todoRows({ hits: HITS, capped: false }).map((row) => row.id)).toEqual([
    "src/app.ts:2",
    "src/app.ts:9",
  ]);
});
