/**
 * The page the changes pane shows: the graph of the branches on one side
 * and what one commit changed on the other. It is one page with its own
 * style and its own script and nothing from anywhere else, because the
 * frame it is shown in reaches nothing.
 *
 * A click on a row asks the plugin for that commit, over the bridge the
 * app puts in front of the page, and what comes back fills the panel.
 */

import type { Entry } from "./log.js";

/** The page for a project, as the plugin sends it. */
export function page(branch: string, entries: Entry[]): string {
  return `<style>${STYLE}</style>
<div class="wrap">
  <div class="log" id="log">
    <div class="head">${escape(branch)} <span class="count">${entries.length} commits</span></div>
    ${entries.length === 0 ? '<p class="empty">No commits yet.</p>' : table(entries)}
  </div>
  <div class="panel">
    <div class="head">Commit</div>
    <div class="detail" id="detail"><p class="empty">Pick a commit to see what it changed.</p></div>
  </div>
</div>
<script>${SCRIPT}</script>`;
}

function table(entries: Entry[]): string {
  const rows = entries.map(row).join("\n");
  return `<table><tbody>\n${rows}\n</tbody></table>`;
}

function row(entry: Entry): string {
  const sha = /^[0-9a-f]{4,40}$/.test(entry.sha) ? entry.sha : "";
  const open = sha === "" ? "<tr>" : `<tr data-sha="${sha}" tabindex="0">`;
  return `${open}<td class="graph">${escape(entry.graph)}</td><td class="sha">${escape(entry.sha)}</td><td class="refs">${refs(entry.refs)}</td><td class="subject">${escape(entry.subject)}</td><td class="who">${escape(entry.author)}</td><td class="when">${escape(entry.date)}</td></tr>`;
}

function refs(said: string): string {
  if (said === "") return "";
  return said
    .split(",")
    .map((ref) => ref.trim())
    .filter((ref) => ref !== "")
    .map((ref) => `<span class="ref">${escape(ref)}</span>`)
    .join(" ");
}

/** Text as the page may hold it. */
export function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The page's own look: light on white, and the same page read the other
    way around where that is what the machine is set to. The frame is told
    no theme, so both are written out here. A row is one line however long
    its parts are: the subject gives way first, then the refs and the
    author, and the table never grows past the column it is in, so the
    panel beside it is never drawn over. */
const STYLE = `
:root {
  --ink: #1b1b1f;
  --dim: #6b6b76;
  --paper: #ffffff;
  --line: #e3e3e8;
  --pick: #eef3fd;
  --mark: #2f6feb;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ink: #e6e6ea;
    --dim: #9a9aa4;
    --paper: #16171a;
    --line: #2c2d33;
    --pick: #22262f;
    --mark: #7aa2f7;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.wrap { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px; align-items: flex-start; }
.log { flex: 3 1 460px; min-width: 0; overflow: hidden; }
.panel { flex: 2 1 280px; min-width: 0; }
.head {
  color: var(--dim);
  padding: 0 0 6px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.count { color: var(--dim); opacity: 0.7; }
.log table { border-collapse: collapse; table-layout: fixed; width: 100%; max-width: 100%; }
.log tbody { display: block; max-height: 440px; overflow: auto; }
.log tr { display: flex; gap: 8px; width: 100%; min-width: 0; align-items: baseline; }
.log tr[data-sha] { cursor: pointer; }
.log tr[data-sha]:hover, .log tr[data-sha]:focus { background: var(--pick); outline: none; }
.log tr.on { background: var(--pick); }
.log td { padding: 1px 0; }
.graph { white-space: pre; flex: 0 0 auto; color: var(--mark); }
.sha { flex: 0 0 auto; color: var(--mark); }
.refs { flex: 0 1 auto; min-width: 0; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ref {
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 0 4px;
  color: var(--dim);
}
.subject { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who { flex: 0 1 auto; min-width: 0; max-width: 14em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dim); }
.when { flex: 0 0 auto; color: var(--dim); }
.detail { max-height: 440px; overflow: auto; }
.detail pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
.empty { color: var(--dim); margin: 0; }
`;

/** The page's own script: a click asks the plugin for a commit, and what
    the plugin sends back is what the panel holds. */
const SCRIPT = `
(function () {
  var log = document.getElementById("log");
  var detail = document.getElementById("detail");
  var picked = null;
  function put(node) {
    while (detail.firstChild) detail.removeChild(detail.firstChild);
    detail.appendChild(node);
  }
  function note(text) {
    var line = document.createElement("p");
    line.className = "empty";
    line.textContent = text;
    return line;
  }
  function ask(row) {
    var sha = row.getAttribute("data-sha");
    if (!sha) return;
    if (picked) picked.classList.remove("on");
    picked = row;
    row.classList.add("on");
    put(note("Reading " + sha));
    if (window.workbench && window.workbench.send) {
      window.workbench.send({ commit: sha });
    }
  }
  log.addEventListener("click", function (event) {
    var row = event.target.closest("tr[data-sha]");
    if (row) ask(row);
  });
  log.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var row = event.target.closest("tr[data-sha]");
    if (!row) return;
    event.preventDefault();
    ask(row);
  });
  if (window.workbench && window.workbench.onData) {
    window.workbench.onData(function (data) {
      if (!data || typeof data.text !== "string") return;
      var pre = document.createElement("pre");
      pre.textContent = data.text;
      put(pre);
    });
  }
})();
`;
