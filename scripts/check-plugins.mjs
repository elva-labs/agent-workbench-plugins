/**
 * What CI checks about the plugins in this repository, beyond the types and
 * the tests: the manifest says what is true, and every plugin it names
 * starts, greets with what the manifest declares, and stops when told.
 *
 * The manifest's rules are the app's: a plain identifier for a name, a path
 * that stays under the source, a runtime on the PATH, a script in the
 * plugin's own directory, and a view of "wide" or "full".
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = "workbench-plugins.toml";
/** How long a plugin gets to greet before it is taken as broken. */
const GREET_MS = 10_000;

const problems = [];
const say = (text) => process.stdout.write(`${text}\n`);

/** The manifest's [[plugin]] tables, as the fields this check reads. A
    hand-rolled reader keeps the repository free of a TOML dependency for
    one file of three keys per entry. */
function entries(text) {
  const found = [];
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line === "[[plugin]]") {
      current = {};
      found.push(current);
      continue;
    }
    if (line.startsWith("[")) {
      current = null;
      continue;
    }
    if (current === null) continue;
    const at = line.indexOf("=");
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    current[key] = value.startsWith("[")
      ? value
          .slice(1, value.lastIndexOf("]"))
          .split(",")
          .map((part) => part.trim().replace(/^["']|["']$/g, ""))
          .filter((part) => part !== "")
      : value.replace(/^["']|["']$/g, "");
  }
  return found;
}

const plain = (name) => /^[a-z][a-z0-9_-]{0,39}$/.test(name);

/** Starts the plugin, reads its greeting, tells it to stop, and waits. */
function greets(plugin, dir) {
  return new Promise((done) => {
    const [program, ...args] = plugin.run;
    const child = spawn(program, args, {
      cwd: dir,
      stdio: ["pipe", "pipe", "inherit"],
    });
    const lines = createInterface({ input: child.stdout });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done(`${plugin.name}: said nothing within ${GREET_MS / 1000} seconds`);
    }, GREET_MS);
    let answered = false;

    child.on("error", (error) => {
      clearTimeout(timer);
      done(`${plugin.name}: could not start: ${error.message}`);
    });

    lines.on("line", (line) => {
      if (answered) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.type !== "hello") return;
      answered = true;
      clearTimeout(timer);
      const trouble = [];
      if (message.name !== plugin.name) {
        trouble.push(
          `greets as ${message.name}, the manifest says ${plugin.name}`,
        );
      }
      const declared = (plugin.tools ?? []).slice().sort();
      const greeted = (message.tools ?? []).map((tool) => tool.name).sort();
      if (declared.join(",") !== greeted.join(",")) {
        trouble.push(
          `the manifest says tools ${declared.join(", ") || "none"}, it greets with ${greeted.join(", ") || "none"}`,
        );
      }
      const sections = (message.sections ?? []).length;
      const said = (plugin.sections ?? []).length;
      if (sections !== said) {
        trouble.push(
          `the manifest says ${said} sections, it greets with ${sections}`,
        );
      }
      if (plugin.view !== undefined && message.view === null) {
        trouble.push(
          `the manifest declares a ${plugin.view} view, it greets with none`,
        );
      }
      child.stdin.write('{"type":"stop"}\n');
      const ending = setTimeout(() => child.kill("SIGKILL"), 5_000);
      child.on("exit", () => {
        clearTimeout(ending);
        done(
          trouble.length === 0 ? null : `${plugin.name}: ${trouble.join("; ")}`,
        );
      });
    });
  });
}

const manifest = join(root, MANIFEST);
if (!existsSync(manifest)) {
  say(`No ${MANIFEST} yet, so there is nothing to check.`);
  process.exit(0);
}

const declared = entries(readFileSync(manifest, "utf8"));
if (declared.length === 0) {
  problems.push(`${MANIFEST} names no plugins`);
}

const names = new Set();
for (const plugin of declared) {
  const name = plugin.name ?? "";
  if (!plain(name)) {
    problems.push(
      `${name || "a plugin"}: the name must be lowercase letters, digits, - and _`,
    );
    continue;
  }
  if (names.has(name)) problems.push(`${name}: the name is used twice`);
  names.add(name);

  const path = plugin.path ?? "";
  const dir = resolve(root, path);
  if (path === "" || isAbsolute(path) || relative(root, dir).startsWith("..")) {
    problems.push(`${name}: the path must stay under the repository`);
    continue;
  }
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    problems.push(`${name}: no directory at ${path}`);
    continue;
  }
  const run = plugin.run ?? [];
  if (run.length === 0) {
    problems.push(`${name}: run names no program`);
    continue;
  }
  if (
    run.length > 1 &&
    !run[1].startsWith("-") &&
    !existsSync(join(dir, run[1]))
  ) {
    problems.push(
      `${name}: ${run[1]} is not in its directory. Is the build run first?`,
    );
    continue;
  }
  for (const tool of plugin.tools ?? []) {
    if (!plain(tool))
      problems.push(`${name}: the tool ${tool} must be a plain identifier`);
  }
  if (
    plugin.view !== undefined &&
    plugin.view !== "wide" &&
    plugin.view !== "full"
  ) {
    problems.push(`${name}: view must be wide or full`);
  }

  const trouble = await greets(plugin, dir);
  if (trouble !== null) problems.push(trouble);
  else say(`${name}: starts, greets as the manifest says, and stops.`);
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.exit(1);
}
say(`${declared.length} plugin${declared.length === 1 ? "" : "s"} checked.`);
