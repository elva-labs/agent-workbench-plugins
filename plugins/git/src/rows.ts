/**
 * The two sections as the tree draws them: the rows, what each row's
 * actions are, the actions on each header, and what the Git header says
 * beside its title. A row's id says what it stands for, so the action
 * taken on it knows which file, stash or branch it was given.
 */

import type { Action, Row } from "@elva-labs/workbench-plugin";
import type { Branch } from "./branches.js";
import { ago, type Stash } from "./stashes.js";
import {
  distance,
  name,
  state,
  untracked,
  words,
  type Change,
  type Status,
} from "./status.js";

const FILE = "file:";
const STASH = "stash:";
const BRANCH = "branch:";

/** What a row of files was made of, or null for any other row. */
export function fileOf(row: Row | null): string | null {
  return row !== null && row.id.startsWith(FILE)
    ? row.id.slice(FILE.length)
    : null;
}

/** What a row of stashes was made of, or null for any other row. */
export function stashOf(row: Row | null): string | null {
  return row !== null && row.id.startsWith(STASH)
    ? row.id.slice(STASH.length)
    : null;
}

/** What a row of branches was made of, or null for any other row. */
export function branchOf(row: Row | null): string | null {
  return row !== null && row.id.startsWith(BRANCH)
    ? row.id.slice(BRANCH.length)
    : null;
}

/** Whether an action that cannot be undone was answered yes. */
export function sure(input: Record<string, string>): boolean {
  return input.sure === "yes";
}

const OPEN: Action = { id: "open", label: "Open" };
const STAGE: Action = { id: "stage", label: "Stage" };
const UNSTAGE: Action = { id: "unstage", label: "Unstage" };

const DISCARD: Action = {
  id: "discard",
  label: "Discard",
  input: [
    {
      id: "sure",
      label: "Discard these changes for good?",
      kind: "choice",
      options: [
        { id: "no", label: "No" },
        { id: "yes", label: "Yes, discard them" },
      ],
    },
  ],
};

const APPLY: Action = { id: "apply", label: "Apply" };
const POP: Action = { id: "pop", label: "Pop" };

const DROP: Action = {
  id: "drop",
  label: "Drop",
  input: [
    {
      id: "sure",
      label: "Drop this stash for good?",
      kind: "choice",
      options: [
        { id: "no", label: "No" },
        { id: "yes", label: "Yes, drop it" },
      ],
    },
  ],
};

const SWITCH: Action = { id: "switch", label: "Switch" };

/** The actions on the Git header. */
export const STATUS_ACTIONS: Action[] = [
  {
    id: "commit",
    label: "Commit",
    input: [
      {
        id: "message",
        label: "Message",
        kind: "text",
        placeholder: "Message",
      },
      {
        id: "stage",
        label: "What to commit",
        kind: "choice",
        options: [
          { id: "staged", label: "Staged only" },
          { id: "everything", label: "Everything" },
        ],
      },
    ],
  },
  { id: "pull", label: "Pull" },
  { id: "push", label: "Push" },
  {
    id: "stash",
    label: "Stash",
    input: [
      {
        id: "message",
        label: "Message",
        kind: "text",
        placeholder: "Optional",
      },
    ],
  },
  { id: "refresh", label: "Refresh" },
];

/** The actions on the Branches header. */
export const BRANCH_ACTIONS: Action[] = [
  {
    id: "new",
    label: "New",
    input: [
      {
        id: "name",
        label: "Name",
        kind: "text",
        placeholder: "Branch name",
      },
    ],
  },
];

/** What the Git header says beside its title: the branch and how far it
    stands from its upstream. */
export function statusDetail(status: Status): string {
  return `${name(status.head)}, ${distance(status.head)}`;
}

/** The Git section: every changed file, then every stash. */
export function statusRows(
  status: Status,
  stashes: Stash[],
  now: number,
): Row[] {
  return [
    ...status.changes.map(fileRow),
    ...stashes.map((stash) => stashRow(stash, now)),
  ];
}

/** The Branches section: one row per local branch. */
export function branchRows(branches: Branch[]): Row[] {
  return branches.map((branch) => ({
    id: `${BRANCH}${branch.name}`,
    label: branch.name,
    detail: branch.current
      ? "current"
      : `${branch.head} ${branch.subject}`.trim(),
    state: branch.current ? ("ok" as const) : undefined,
    actions: [SWITCH],
    default: "switch",
  }));
}

function fileRow(change: Change): Row {
  return {
    id: `${FILE}${change.path}`,
    label: change.path,
    detail: words(change),
    state: state(change),
    actions: fileActions(change),
    default: "open",
  };
}

/** What can be done to a file: everything but unstaging what the index
    has never been told about. */
function fileActions(change: Change): Action[] {
  if (untracked(change)) return [OPEN, STAGE, DISCARD];
  if (change.work === " ") return [OPEN, UNSTAGE];
  return [OPEN, STAGE, UNSTAGE, DISCARD];
}

function stashRow(stash: Stash, now: number): Row {
  return {
    id: `${STASH}${stash.ref}`,
    label: `${stash.ref}: ${stash.message}`,
    detail: ago(stash.at, now),
    actions: [APPLY, POP, DROP],
  };
}
