# Working in this repository

This repository holds plugins for Agent Workbench and the package they are
written against. A plugin is a program that speaks JSON lines on stdin and
stdout; the app runs one process per plugin on the machine the project is
on. The app's own `docs/plugins.md` says what a plugin may declare and what
the two sides say to each other.

## The rules

- **The manifest says what is true.** `workbench-plugins.toml` names every
  plugin here, with its directory, the command that runs it and what it
  declares. A plugin greets with the same tools and sections the manifest
  lists; CI starts each one and checks that it does.
- **A plugin owns no state of the app's.** It is told about the projects,
  the sessions and the tree, and finds out everything else itself.
- **Comments describe the present state.** What is true now, never what
  changed or why the diff exists. That belongs in the commit message.
- **Every change is verified before it is pushed.** The whole of what CI
  runs, below, passes locally first.

## Commits

- A conventional subject: `type: summary`, with the type one of feat, fix,
  docs, refactor, test, chore, ci, build or perf.
- No hard-wrapped body: one line per paragraph, blank lines between.
- No AI attribution of any kind, no `Co-Authored-By` trailers.

## Writing

- Write plainly. No punchlines, no rhetorical questions, no dashes standing
  in for a sentence break.
- A README says what the thing is and how it is used, in as few lines as
  that takes.

## Verifying

```
npm run format:check   # prettier over the repository
npm run check          # types, every workspace
npm test               # unit tests, every workspace
npm run build          # every workspace that builds
npm run check:plugins  # the manifest, and every plugin starts and greets
```

CI runs exactly those, in that order, on every push and pull request.

## Conventions

- A plugin lives in `plugins/<name>/` and is written against
  `@elva-labs/workbench-plugin` in `packages/`. It builds to `dist/` and the
  manifest's `run` names the built file.
- New behaviour in the package gets a test that drives the loop over
  in-memory streams rather than mocking its parts.
- A plugin's own tests fake what it shells out to, on PATH, and assert the
  lines it writes.
