/**
 * A repository of git's own, made for one test and thrown away after it.
 * Every call runs with a configuration of its own, so what the machine
 * running the tests has in its own is nothing to them.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** The environment every git in a test runs under. */
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: join(tmpdir(), "workbench-git-tests-none"),
  GIT_CONFIG_SYSTEM: join(tmpdir(), "workbench-git-tests-none"),
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

/** Puts the tests' own configuration in front of every git the plugin
    runs too, and gives back what it was. */
export function isolate(): () => void {
  const had = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(ENV)) {
    if (!key.startsWith("GIT_")) continue;
    had.set(key, process.env[key]);
    process.env[key] = value as string;
  }
  return () => {
    for (const [key, value] of had) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/** A directory that is gone when the test is. */
export async function temporary(what: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `workbench-git-${what}-`));
}

export async function remove(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Runs one git in a directory, and throws what it said when it refused. */
export async function run(dir: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd: dir, env: ENV });
  return stdout;
}

/** A repository with one commit in it, on a branch called main. */
export async function repository(what = "repo"): Promise<string> {
  const dir = await temporary(what);
  await run(dir, ["init", "-b", "main", "-q", dir]);
  await run(dir, ["config", "user.name", "Test"]);
  await run(dir, ["config", "user.email", "test@example.com"]);
  await run(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
}

/** Writes a file in the repository, with the directories above it. */
export async function file(
  dir: string,
  at: string,
  text: string,
): Promise<void> {
  const full = join(dir, at);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, text);
}

/** Writes a file, stages it and commits it. */
export async function commit(
  dir: string,
  at: string,
  text: string,
  message: string,
): Promise<void> {
  await file(dir, at, text);
  await run(dir, ["add", "--", at]);
  await run(dir, ["commit", "-q", "-m", message]);
}
