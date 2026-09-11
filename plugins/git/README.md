# git

What the repository under a project holds: the branch and where it stands,
every file that has changed, the stashes, the branches, and a graph of the
log. Two sections under the file tree, a page in the changes pane, and
three tools for the agent.

## Sections

**Git** is the branch first, with its upstream and how far ahead or behind
it is, and Enter pushes while there is something to push. Then a row per
changed file: the path, what happened to it in words, and a dot that is ok
for what is staged whole, waiting for what is not, and failed for a file
both sides of a merge have touched. Enter opens that file's diff in the
viewer, and its row stages it, takes it back out of the index, or throws
the change away. Then a row per stash, with how long ago it was put away,
to apply, pop or drop. The header commits, pulls, pushes, stashes and reads
the repository again. Discarding a change and dropping a stash ask first,
because neither can be undone.

**Branches** is a row per local branch, the current one marked, each with
the commit it stands on. Enter switches to it, which git refuses while the
working tree holds changes it would write over, and says so. The header
makes a branch from the one the head is on and switches to it.

## The view

The whole of the changes pane, from the button on the Git header: the graph
of the branches and their remotes as git draws it, a row per commit with
its short sha, what points at it, the author, the date and the subject. A
click on a row shows what that commit changed beside the graph. The page
goes again whenever the rows do.

## Tools

- `git_status` gives the branch, where it stands against its upstream, and
  every file that has changed.
- `git_commit` commits what is staged, or everything in the working tree
  when `all` is true, and answers with the short sha and the subject.
- `git_log` gives the recent commits, one per line.

Nothing here rewrites history and nothing here pushes.

## What it runs

`git`, in the project's directory, and nothing else. Every call is an
argument list rather than a line for a shell, and an argument that starts
with a dash and is not one of the options the plugin passes itself is
refused, so a branch name or a path is never read as an option. A commit
message goes in on standard input, never as an argument.
