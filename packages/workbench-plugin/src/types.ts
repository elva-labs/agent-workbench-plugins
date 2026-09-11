/**
 * The messages the app and a plugin send each other, one JSON object per
 * line, every one of them with a `type`.
 */

/** The state a row's dot is drawn in. */
export type RowState = "ok" | "busy" | "waiting" | "failed";

/** One of the named options a choice offers. */
export interface Choice {
  id: string;
  label: string;
}

/** What an action asks for before it runs: a line of text, or a choice. */
export interface Field {
  id: string;
  label: string;
  kind: "text" | "choice";
  options?: Choice[];
  placeholder?: string;
}

/**
 * Something the user can have the plugin do, on a row or on a section's
 * header. An action with fields is asked about first.
 */
export interface Action {
  id: string;
  label: string;
  input?: Field[];
}

/** A line of a section, as the tree draws it. */
export interface Row {
  id: string;
  label: string;
  detail?: string;
  state?: RowState;
  actions?: Action[];
  /** Which of the row's actions Enter runs. */
  default?: string;
}

/** A tool the agent called, with the session that called it. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  project: string;
  session: string | null;
}

/** An action the user took, with the row it was on and any input given. */
export interface ActionCall {
  id: string;
  section: string;
  action: string;
  /** The row's id, or null for an action on the section's header. */
  row: string | null;
  input: Record<string, string>;
  project: string;
}

/** The app's greeting: its version, and the projects open on the machine. */
export interface HelloEvent {
  type: "hello";
  app: string;
  projects: string[];
}

/** A project opened or closed on the machine. */
export interface ProjectEvent {
  type: "project";
  event: "opened" | "closed";
  path: string;
}

/** A session started, changed state or ended. */
export interface SessionEvent {
  type: "session";
  event: "started" | "ended" | "state";
  id: string;
  project: string;
  state?: string;
}

/** The tree of a project moved. */
export interface TreeEvent {
  type: "tree";
  project: string;
}

/** The app is asking the plugin to go. */
export interface StopEvent {
  type: "stop";
}

/** Something the plugin's page sent, for the project it is open on. */
export interface ViewMessageEvent {
  type: "view_message";
  project: string;
  payload: unknown;
}

/** Everything that arrives on standard input. */
export type AppMessage =
  | HelloEvent
  | ProjectEvent
  | SessionEvent
  | TreeEvent
  | StopEvent
  | ViewMessageEvent
  | ({ type: "tool" } & ToolCall)
  | ({ type: "action" } & ActionCall);

/** A tool as the greeting declares it. */
export interface DeclaredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** A section as the greeting declares it. */
export interface DeclaredSection {
  id: string;
  title: string;
  actions: Action[];
}

/** The view as the greeting declares it: the room the page asks for, the
    same word the manifest says. */
export interface DeclaredView {
  /** "wide" is the viewer beside the tree, "full" the whole pane. */
  width: "wide" | "full";
}

/** The plugin's greeting: its name, its version and what it offers. */
export interface Greeting {
  type: "hello";
  name: string;
  version: string;
  tools: DeclaredTool[];
  sections: DeclaredSection[];
  view: DeclaredView | null;
}

/** The answer to a tool call or an action, under the same id. */
export interface Result {
  type: "result";
  id: string;
  content?: string;
  error?: string;
}

/** A section's rows for one project. */
export interface SectionLine {
  type: "section";
  id: string;
  title: string;
  project: string;
  rows: Row[];
  actions: Action[];
}

/** A place to open in the viewer. */
export interface OpenLine {
  type: "open";
  project: string;
  path: string;
  from: number;
  to?: number;
  note?: string;
}

/** A file's diff, shown in the changes pane. */
export interface DiffLine {
  type: "diff";
  project: string;
  path: string;
  note?: string;
}

/** Media to present. */
export interface PresentLine {
  type: "present";
  project: string;
  files: string[];
  caption?: string;
}

/** A line for a session's row. */
export interface NotifyLine {
  type: "notify";
  project: string;
  text: string;
  session?: string;
}

/** The plugin's page for one project, written out or read from a file of
    the plugin's own directory. */
export interface ViewLine {
  type: "view";
  project: string;
  html?: string;
  path?: string;
  /** Whether the app shows the page now. */
  open?: boolean;
}

/** A message for the page the plugin has for a project, which reaches it
    while it is open and is kept nowhere. */
export interface ViewDataLine {
  type: "view_data";
  project: string;
  data: unknown;
}

/** Everything the plugin writes to standard output. */
export type PluginMessage =
  | Greeting
  | Result
  | SectionLine
  | OpenLine
  | DiffLine
  | PresentLine
  | NotifyLine
  | ViewLine
  | ViewDataLine;

/** Where to open, as the `open` helper takes it. */
export interface OpenOptions {
  path: string;
  from: number;
  to?: number;
  note?: string;
}

/** Which file to diff, as the `diff` helper takes it. */
export interface DiffOptions {
  path: string;
  note?: string;
}

/** What to present, as the `present` helper takes it. */
export interface PresentOptions {
  files: string[];
  caption?: string;
}

/** The page to send, as the `view` helper takes it: the html itself, or a
    file of the plugin's own directory to read it from. */
export interface ViewOptions {
  html?: string;
  path?: string;
  open?: boolean;
}
