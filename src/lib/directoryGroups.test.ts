import { describe, expect, it } from "bun:test";
import type { PaneInfo, WorkspaceInfo } from "../../shared/protocol.ts";
import { directoryPath, groupDirectories } from "./directoryGroups.ts";

const workspace = (id: string): WorkspaceInfo => ({ workspace_id: id, label: id, number: 1, active_tab_id: `${id}:t1`, agent_status: "idle", focused: false, pane_count: 1, tab_count: 1 });
const pane = (id: string, workspaceId: string, cwd?: string | null): PaneInfo => ({ pane_id: id, workspace_id: workspaceId, cwd, tab_id: `${workspaceId}:t1`, terminal_id: id, revision: 1, focused: false, agent_status: "idle" });

describe("groupDirectories", () => {
  it("keeps an explicit worktree child with its parent without changing its native workspace or cwd", () => {
    const main = { ...pane("main", "w1", "/project"), agent: "codex" };
    const child = { ...pane("child", "w2", "/project/.worktrees/task"), agent: "codex", parent_pane_id: "main" };
    const input = [main, child], before = structuredClone(input);
    const groups = groupDirectories([workspace("w1"), workspace("w2")], input);
    expect(groups.map((g) => [g.path, g.paneCount])).toEqual([["/project", 2]]);
    expect(groups[0]?.workspaces[0]?.panes.map((p) => p.pane_id)).toEqual(["main", "child"]);
    expect(input).toEqual(before);
    const unknownParent = { ...main, cwd: null };
    const unknownGroups = groupDirectories([workspace("w1"), workspace("w2")], [unknownParent, child]);
    expect(unknownGroups.map((g) => [g.key, g.paneCount])).toEqual([["workspace:w1", 2]]);
    expect(unknownGroups[0]?.workspaces[0]?.panes.map((p) => p.pane_id)).toEqual(["main", "child"]);
  });
  it("merges sessions from separate workspaces at the same full path", () => {
    const groups = groupDirectories([workspace("w1"), workspace("w2")], [pane("p1", "w1", "/project"), pane("p2", "w2", "/project/")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.paneCount).toBe(2);
    expect(groups[0]?.workspaces.map((entry) => entry.workspace.workspace_id)).toEqual(["w1", "w2"]);
  });

  it("keeps identical basenames and child directories separate", () => {
    const groups = groupDirectories([workspace("w1")], [pane("p1", "w1", "/a/project"), pane("p2", "w1", "/b/project"), pane("p3", "w1", "/a/project/src")]);
    expect(groups.map((group) => group.path)).toEqual(["/a/project", "/b/project", "/a/project/src"]);
    expect(groups.flatMap((group) => group.workspaces.flatMap((entry) => entry.panes.map((pane) => pane.pane_id)))).toEqual(["p1", "p2", "p3"]);
  });

  it("keeps unknown paths with their workspace instead of merging unrelated sessions", () => {
    const groups = groupDirectories([workspace("w1"), workspace("w2")], [pane("p1", "w1", null), pane("p2", "w1"), pane("p3", "w2", "")]);
    expect(groups.map((group) => [group.key, group.paneCount])).toEqual([["workspace:w1", 2], ["workspace:w2", 1]]);
  });

  it("follows workspace order and retains pane order without mutating inputs", () => {
    const workspaces = [workspace("w2"), workspace("w1"), workspace("empty")];
    const panes = [pane("p1", "w1", "/first"), pane("p2", "w2", "/second"), pane("p3", "w2", "/second")];
    const before = structuredClone({ workspaces, panes });
    const groups = groupDirectories(workspaces, panes);
    expect(groups.map((group) => group.path)).toEqual(["/second", "/first"]);
    expect(groups[0]?.workspaces[0]?.panes.map((pane) => pane.pane_id)).toEqual(["p2", "p3"]);
    expect({ workspaces, panes }).toEqual(before);
  });

  it("normalizes separators while preserving roots, case, and distinct PC calls", () => {
    expect(directoryPath("C:\\Projects\\app\\")).toBe("C:/Projects/app");
    expect(directoryPath("/")).toBe("/");
    expect(directoryPath("C:\\")).toBe("C:/");
    expect(directoryPath("/project\\name")).toBe("/project\\name");
    const groups = groupDirectories([workspace("w1")], [pane("p1", "w1", "C:\\Projects\\app"), pane("p2", "w1", "C:/Projects/app/"), pane("p3", "w1", "C:/Projects/App")]);
    expect(groups.map((group) => group.paneCount)).toEqual([2, 1]);
    expect(groupDirectories([workspace("w1")], [pane("remote", "w1", "C:/Projects/app")])[0]?.paneCount).toBe(1);
  });
});
