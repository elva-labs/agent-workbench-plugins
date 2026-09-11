# @elva-labs/workbench-plugin

Agent Workbench runs a plugin as one process that speaks JSON lines over
its standard input and output. This package holds the types for those
lines and the loop that reads and writes them, so a plugin is a handler
per name rather than a switch over a stream.

```
npm install @elva-labs/workbench-plugin
```

## Writing a plugin

A plugin declares what it offers, registers a handler for each name, and
runs. The loop greets the app with the tools and the sections, answers
every call under the id it came with, and keeps going until the app asks
it to stop.

```js
import { plugin } from "@elva-labs/workbench-plugin";

const p = plugin({ name: "github", version: "0.2.0" });

p.tool(
  "pr",
  { description: "The branch's pull request, its checks and its comments." },
  ({ state }, { project }) => summarise(project, state),
);

p.section("pull-request", {
  title: "Pull request",
  actions: [{ id: "refresh", label: "Refresh" }],
  rows: async ({ project }) =>
    (await checks(project)).map((check) => ({
      id: check.name,
      label: check.name,
      state: check.conclusion === "success" ? "ok" : "failed",
      actions: [{ id: "open", label: "Open" }],
      default: "open",
    })),
});

p.action("pull-request", "open", ({ row, project }) =>
  p.open(project, { path: `.github/workflows/${row.id}.yml`, from: 1 }),
);

p.on("tree", ({ project }) => p.refresh("pull-request", project));

p.run();
```

## What the builder offers

- `tool(name, { description, inputSchema }, handler)` registers a tool the
  agent can call. What the handler returns is the call's content, a string
  as it is and anything else as JSON. What it throws is the error the agent
  reads.
- `section(id, { title, actions, rows })` registers a section under the
  tree. The rows are computed for one project at a time, on every project
  that is open when the app greets the plugin, on every project that opens
  after that, and whenever `refresh(id, project)` is called.
- `action(section, action, handler)` registers what one of a section's
  actions does. The handler is given the row it was taken on and the input
  the app asked for, and the section is sent again once it is done.
- `on(event, handler)` listens for a project opening or closing, a session
  starting, changing state or ending, a tree that moved, a message from the
  plugin's page, or the request to stop.
- `open`, `diff`, `present` and `notify` show a place in the viewer, a
  file's diff, media, or a line on a session's row, the same means the
  agent has.
- `view(project, { html, path, open })` sends the plugin's page for a
  project, written out or read from a file of the plugin's own directory,
  and `viewData(project, data)` sends that page a message while it is open.
  What the page sends back arrives at `on("view_message", handler)`. A
  plugin with a page says how much room it asks for when it is made,
  `plugin({ name, version, view: "full" })`, the same word its manifest
  says.
- `run()` reads standard input and writes standard output, and resolves
  when the app asks the plugin to stop or the input ends. Calls are handled
  as they arrive, a handler that fails answers with its error and nothing
  more, and a line the plugin does not know is left alone.

Every name a plugin registers is a plain identifier: a lowercase letter
first, then lowercase letters, digits, dashes and underscores. A name that
is not is refused where it is registered.

Node 20 or newer. The package has no dependencies of its own.
