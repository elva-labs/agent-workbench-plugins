/**
 * Every git this plugin runs, and the only thing it runs at all. The
 * arguments are a list, never a line for a shell, and an argument that
 * starts with a dash is one of the options below or the call is refused:
 * a branch name, a path or a message is never read as an option.
 */

import { execFile } from "node:child_process";

/** What a call said and how it ended. */
export interface Run {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * The options the plugin passes, and the separator that ends them. The
 * list is the whole of what it ever asks git for.
 */
const OPTIONS = new Set([
  "--",
  "--all",
  "--branch",
  "--branches",
  "--cached",
  "--date=short",
  "--file=-",
  "--format=%(refname:short)%09%(HEAD)%09%(objectname:short)%09%(contents:subject)",
  "--graph",
  "--no-color",
  "--pretty=%h%x09%ad%x09%an%x09%s",
  "--pretty=%h%x09%d%x09%an%x09%ad%x09%s",
  "--pretty=%h%x09%s",
  "--pretty=%gd%x09%ct%x09%gs",
  "--quiet",
  "--remotes",
  "--short",
  "--porcelain=v1",
  "--staged",
  "--stat",
  "--untracked-files=normal",
  "--verify",
  // A branch to make, a message to commit under, and how many commits.
  "-c",
  "-m",
  "-n",
]);

/**
 * What every call runs under: no transport that runs whatever a URL
 * names, no colour in what is read back, no editor for anyone to answer,
 * and paths written as they are.
 */
const CONFIG = [
  "-c",
  "protocol.ext.allow=never",
  "-c",
  "color.ui=false",
  "-c",
  "core.quotePath=false",
  "-c",
  "core.editor=true",
];

/** How much a call may write before it is cut off. A log of two hundred
    commits and a diffstat sit far under this. */
const MAX = 8 * 1024 * 1024;

/** How much of what git said goes on one line of the app's. */
const SAID = 300;

/**
 * Runs git in the project and answers with what it wrote and how it
 * ended. Only being unable to run git at all throws.
 */
export function git(project: string, args: string[], input = ""): Promise<Run> {
  const option = args.find((arg) => arg.startsWith("-") && !OPTIONS.has(arg));
  if (option !== undefined) {
    return Promise.reject(
      new Error(`this plugin never passes git ${option}, so it will not now`),
    );
  }
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      [...CONFIG, ...args],
      { cwd: project, maxBuffer: MAX, windowsHide: true },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stdout, stderr, code: 0 });
          return;
        }
        const code = (error as { code?: unknown }).code;
        if (typeof code !== "number") {
          reject(new Error(`could not run git: ${error.message}`));
          return;
        }
        resolve({ stdout, stderr, code });
      },
    );
    // Nothing git runs ever waits for someone to type: what a call has to
    // say on standard input is all of it. A git that was gone before it
    // read any of it is a pipe that breaks, and the end of the call says
    // the rest.
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

/** Runs git and answers with what it wrote, or throws what it said went
    wrong. */
export async function output(
  project: string,
  args: string[],
  input = "",
): Promise<string> {
  const run = await git(project, args, input);
  if (run.code !== 0) throw new Error(trouble(run));
  return run.stdout;
}

/** What git said went wrong, as one line for the app to show. */
export function trouble(run: Run): string {
  const said = run.stderr.trim() === "" ? run.stdout : run.stderr;
  const text = said.split(/\s+/).filter(Boolean).join(" ");
  if (text === "") return "git failed and said nothing";
  return text.length > SAID ? `${text.slice(0, SAID).trimEnd()}...` : text;
}
