import { PassThrough, Writable } from "node:stream";
import { expect, it } from "vitest";
import { plugin } from "./plugin.js";
import type { ActionContext, Row } from "./index.js";

/**
 * A plugin's two streams, with the lines it wrote read back one at a time
 * and a wait for the ones it has not written yet.
 */
function streams() {
  const input = new PassThrough();
  const all: string[] = [];
  let rest = "";
  let waiting: Array<() => void> = [];
  const output = new Writable({
    write(chunk, _encoding, done) {
      rest += String(chunk);
      const parts = rest.split("\n");
      rest = parts.pop() ?? "";
      for (const part of parts) {
        if (part !== "") all.push(part);
      }
      const woken = waiting;
      waiting = [];
      for (const wake of woken) wake();
      done();
    },
  });
  return {
    input,
    output,
    all,
    send(message: unknown): void {
      input.write(`${JSON.stringify(message)}\n`);
    },
    async line(index: number): Promise<any> {
      while (all.length <= index) {
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      return JSON.parse(all[index]!);
    },
  };
}

const check: Row = {
  id: "lint",
  label: "lint",
  detail: "3 of 4",
  state: "ok",
  actions: [{ id: "open", label: "Open" }],
  default: "open",
};

it("greets with its tools and its sections before anything else", async () => {
  const { input, output, line } = streams();
  const p = plugin({ name: "github", version: "0.2.0" });
  p.tool("pr", { description: "The branch's pull request." }, () => "");
  p.tool(
    "checks",
    {
      description: "The branch's checks.",
      inputSchema: {
        type: "object",
        properties: { state: { type: "string" } },
      },
    },
    () => "",
  );
  p.section("pull-request", {
    title: "Pull request",
    actions: [{ id: "refresh", label: "Refresh" }],
    rows: () => [],
  });
  const running = p.run({ input, output });

  expect(await line(0)).toEqual({
    type: "hello",
    name: "github",
    version: "0.2.0",
    tools: [
      {
        name: "pr",
        description: "The branch's pull request.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "checks",
        description: "The branch's checks.",
        inputSchema: {
          type: "object",
          properties: { state: { type: "string" } },
        },
      },
    ],
    sections: [
      {
        id: "pull-request",
        title: "Pull request",
        actions: [{ id: "refresh", label: "Refresh" }],
      },
    ],
    view: null,
  });
  input.end();
  await running;
});

it("answers a tool call with what the handler returned", async () => {
  const { input, output, line, send } = streams();
  const seen: Array<[unknown, unknown]> = [];
  const p = plugin({ name: "github", version: "0.2.0" });
  p.tool("pr", { description: "The pull request." }, (args, context) => {
    seen.push([args, context]);
    return "#42 Retry with jitter";
  });
  p.tool("checks", { description: "The checks." }, () => ({ passed: 3 }));
  const running = p.run({ input, output });
  await line(0);

  send({
    type: "tool",
    id: "c1",
    name: "pr",
    arguments: { state: "open" },
    project: "/srv/orbit-api",
    session: "6f2a",
  });
  expect(await line(1)).toEqual({
    type: "result",
    id: "c1",
    content: "#42 Retry with jitter",
  });
  expect(seen).toEqual([
    [{ state: "open" }, { project: "/srv/orbit-api", session: "6f2a" }],
  ]);

  send({
    type: "tool",
    id: "c2",
    name: "checks",
    arguments: {},
    project: "/srv/orbit-api",
    session: null,
  });
  expect(await line(2)).toEqual({
    type: "result",
    id: "c2",
    content: '{"passed":3}',
  });
  input.end();
  await running;
});

it("answers a tool that threw with the error it threw", async () => {
  const { input, output, line, send } = streams();
  const p = plugin({ name: "github", version: "0.2.0" });
  p.tool("pr", { description: "The pull request." }, () => {
    throw new Error("gh is not logged in");
  });
  const running = p.run({ input, output });
  await line(0);

  send({
    type: "tool",
    id: "c1",
    name: "pr",
    arguments: {},
    project: "/srv/orbit-api",
    session: null,
  });
  expect(await line(1)).toEqual({
    type: "result",
    id: "c1",
    error: "gh is not logged in",
  });
  input.end();
  await running;
});

it("hands an action its row and its input, and sends the section again", async () => {
  const { input, output, line, send } = streams();
  const taken: ActionContext[] = [];
  let detail = "3 of 4";
  const p = plugin({ name: "github", version: "0.2.0" });
  p.section("pull-request", {
    title: "Pull request",
    rows: () => [{ ...check, detail }],
  });
  p.action("pull-request", "open", (call) => {
    taken.push(call);
    detail = "4 of 4";
  });
  const running = p.run({ input, output });
  await line(0);

  send({ type: "hello", app: "0.3.0", projects: ["/srv/orbit-api"] });
  expect(await line(1)).toEqual({
    type: "section",
    id: "pull-request",
    title: "Pull request",
    project: "/srv/orbit-api",
    rows: [{ ...check, detail: "3 of 4" }],
    actions: [],
  });

  send({
    type: "action",
    id: "a7",
    section: "pull-request",
    action: "open",
    row: "lint",
    input: { branch: "main" },
    project: "/srv/orbit-api",
  });
  expect(await line(2)).toEqual({ type: "result", id: "a7" });
  expect(taken).toEqual([
    {
      row: { ...check, detail: "3 of 4" },
      input: { branch: "main" },
      project: "/srv/orbit-api",
    },
  ]);
  expect(await line(3)).toEqual({
    type: "section",
    id: "pull-request",
    title: "Pull request",
    project: "/srv/orbit-api",
    rows: [{ ...check, detail: "4 of 4" }],
    actions: [],
  });
  input.end();
  await running;
});

it("answers an action that threw with the error it threw", async () => {
  const { input, output, line, send } = streams();
  const p = plugin({ name: "github", version: "0.2.0" });
  p.section("pull-request", { title: "Pull request", rows: () => [] });
  p.action("pull-request", "open", () => {
    throw new Error("gh is not logged in");
  });
  const running = p.run({ input, output });
  await line(0);

  send({
    type: "action",
    id: "a7",
    section: "pull-request",
    action: "open",
    row: null,
    input: {},
    project: "/srv/orbit-api",
  });
  expect(await line(1)).toEqual({
    type: "result",
    id: "a7",
    error: "gh is not logged in",
  });
  input.end();
  await running;
});

it("asks a header that is a function what it holds, each time the rows go", async () => {
  const { input, output, line, send } = streams();
  let done = false;
  const p = plugin({ name: "github", version: "0.2.0" });
  p.section("pull-request", {
    title: "Pull request",
    actions: ({ project }) =>
      done
        ? [{ id: "clear", label: `Clear ${project}` }]
        : [{ id: "refresh", label: "Refresh" }],
    rows: () => [],
  });
  const running = p.run({ input, output });
  // The greeting asks it too, with no project to speak of.
  const greeting = await line(0);
  expect(greeting.sections).toEqual([
    {
      id: "pull-request",
      title: "Pull request",
      actions: [{ id: "refresh", label: "Refresh" }],
    },
  ]);

  await p.refresh("pull-request", "/srv/orbit-api");
  expect((await line(1)).actions).toEqual([
    { id: "refresh", label: "Refresh" },
  ]);
  done = true;
  await p.refresh("pull-request", "/srv/orbit-api");
  expect((await line(2)).actions).toEqual([
    { id: "clear", label: "Clear /srv/orbit-api" },
  ]);
  input.end();
  await running;
});

it("sends every section when a project opens, and forgets it when it closes", async () => {
  const { input, output, line, send, all } = streams();
  const opened: string[] = [];
  const p = plugin({ name: "github", version: "0.2.0" });
  p.section("pull-request", { title: "Pull request", rows: () => [check] });
  p.section("releases", { title: "Releases", rows: () => [] });
  p.on("project", (event) => opened.push(`${event.event} ${event.path}`));
  const running = p.run({ input, output });
  await line(0);

  send({ type: "hello", app: "0.3.0", projects: [] });
  send({ type: "project", event: "opened", path: "/srv/orbit-api" });
  const first = await line(1);
  const second = await line(2);
  expect([first.id, second.id].sort()).toEqual(["pull-request", "releases"]);
  expect(first.project).toBe("/srv/orbit-api");
  expect(second.project).toBe("/srv/orbit-api");

  send({ type: "project", event: "closed", path: "/srv/orbit-api" });
  send({
    type: "tool",
    id: "c1",
    name: "nothing",
    arguments: {},
    project: "/srv/orbit-api",
    session: null,
  });
  await line(3);
  expect(all).toHaveLength(4);
  expect(opened).toEqual(["opened /srv/orbit-api", "closed /srv/orbit-api"]);
  input.end();
  await running;
});

it("sends the lines the open, diff, present and notify helpers stand for", async () => {
  const { input, output, line } = streams();
  const p = plugin({ name: "github", version: "0.2.0" });
  const running = p.run({ input, output });
  await line(0);

  p.open("/srv/orbit-api", {
    path: "src/main.rs",
    from: 3,
    to: 5,
    note: "here",
  });
  p.diff("/srv/orbit-api", { path: "src/main.rs" });
  p.present("/srv/orbit-api", { files: ["shot.png"], caption: "The graph" });
  p.notify("/srv/orbit-api", "needs a key", "6f2a");

  expect(await line(1)).toEqual({
    type: "open",
    project: "/srv/orbit-api",
    path: "src/main.rs",
    from: 3,
    to: 5,
    note: "here",
  });
  expect(await line(2)).toEqual({
    type: "diff",
    project: "/srv/orbit-api",
    path: "src/main.rs",
  });
  expect(await line(3)).toEqual({
    type: "present",
    project: "/srv/orbit-api",
    files: ["shot.png"],
    caption: "The graph",
  });
  expect(await line(4)).toEqual({
    type: "notify",
    project: "/srv/orbit-api",
    text: "needs a key",
    session: "6f2a",
  });
  input.end();
  await running;
});

it("ends the loop when it is told to stop", async () => {
  const { input, output, line, send } = streams();
  const stopped: string[] = [];
  const p = plugin({ name: "github", version: "0.2.0" });
  p.on("stop", () => stopped.push("stop"));
  const running = p.run({ input, output });
  await line(0);

  send({ type: "stop" });
  await running;
  expect(stopped).toEqual(["stop"]);
});

it("leaves a line it cannot read and a kind it does not know alone", async () => {
  const { input, output, line, send, all } = streams();
  const p = plugin({ name: "github", version: "0.2.0" });
  p.tool("pr", { description: "The pull request." }, () => "#42");
  const running = p.run({ input, output });
  await line(0);

  input.write("{not json at all\n");
  send({ type: "view", message: "hello" });
  send({
    type: "tool",
    id: "c1",
    name: "pr",
    arguments: {},
    project: "/srv/orbit-api",
    session: null,
  });
  expect(await line(1)).toEqual({ type: "result", id: "c1", content: "#42" });
  expect(all).toHaveLength(2);
  input.end();
  await running;
});

it("refuses a name that is not a plain identifier", () => {
  const p = plugin({ name: "github", version: "0.2.0" });
  expect(() => p.tool("Pull Request", { description: "" }, () => "")).toThrow(
    /lowercase/,
  );
  expect(() => p.section("2releases", { title: "", rows: () => [] })).toThrow(
    /lowercase/,
  );
  expect(() => p.action("pull-request", "open!", () => {})).toThrow(
    /lowercase/,
  );
  expect(() => plugin({ name: "", version: "0.2.0" })).toThrow(/lowercase/);
});
