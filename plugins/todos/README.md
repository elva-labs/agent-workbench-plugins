# todos

What the code says it still owes, and what you want to remember about a
project yourself. Two sections under the file tree and three tools for the
agent.

## Sections

**Todos** is read from the project. Every TODO and FIXME comment is a row:
what the marker says, the file and the line under it, and Enter opens the
place in the viewer. The rows are read again when a project opens and a
short while after the tree moves. A git repository's tracked files are what
is read, and otherwise the directory without `node_modules`, `dist`,
`build`, `target` and the dot directories; files over half a megabyte and
files that are not text are left alone, and a scan stops at 500 hits and
says so on a last row.

**Notes** is kept by hand and the code knows nothing about it. Add a note
from the section's header, mark one done or take it away from its row, and
clear the ones that are done. The rows are the notes that are not done,
newest first, with how long ago each was written.

## Tools

- `todos_list` gives the project's notes, each with the id that finishes
  it, and then the TODO and FIXME comments in the code.
- `todos_add` writes a note for the project.
- `todos_finish` marks one of the notes done, by its id.

## Where the notes are

`~/.agent-workbench/plugins/todos/notes.json`, an object keyed by the
project's path. `WORKBENCH_TODOS_HOME` puts that directory under a home of
its own, which is what the tests use.
