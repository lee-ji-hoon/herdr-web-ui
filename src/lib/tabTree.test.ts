import { describe, expect, test } from "bun:test";

import type { HerdrPane, PaneInfo } from "../../shared/protocol.ts";
import { tabTree } from "./tabTree.ts";

function pane(pane_id: string, tab_id: string, agent: string | null): PaneInfo {
  return { pane_id, tab_id, agent, agent_status: "idle", focused: false, revision: 0, terminal_id: `t-${pane_id}`, workspace_id: "w1" };
}

const shape = (panes: HerdrPane[]) => tabTree(panes).map(({ pane, depth, last }) => `${depth ? (last ? "└" : "├") : ""}${pane.pane_id}`);

describe("tabTree", () => {
  test("explicit worktree and shared-tab origins retain the exact parent and continuous nested branches", () => {
    const main = pane("main", "t1", "codex"), aep = pane("aep", "t2", "codex");
    const worker: HerdrPane = { ...pane("worker", "wt:t1", "codex"), workspace_id: "wt", parent_pane_id: "aep" };
    const shared: HerdrPane = { ...pane("shared", "t3", "codex"), parent_pane_id: "main" };
    const peer = { ...pane("peer", "wt:t1", "codex"), workspace_id: "wt" };
    const input = [main, aep, worker, shared, peer], before = structuredClone(input);
    expect(tabTree(input).map(({ pane, depth, root, last, continuations }) => [pane.pane_id, depth, root.pane_id, last, continuations]))
      .toEqual([["main", 0, "main", false, []], ["shared", 1, "main", true, []], ["aep", 0, "aep", false, []], ["worker", 1, "aep", true, []], ["peer", 2, "aep", true, [false]]]);
    expect(input).toEqual(before);
  });
  test("explicit same-tab ancestry wins when the child arrives before its parent", () => {
    const parent = pane("parent", "t1", "codex");
    const child: HerdrPane = { ...pane("child", "t1", "codex"), parent_pane_id: "parent" };
    expect(shape([child, parent])).toEqual(["parent", "└child"]);
    const a = pane("A", "tA", "codex"), b = pane("B", "tB", "codex");
    const underA: HerdrPane = { ...pane("a", "tB", "codex"), parent_pane_id: "A" };
    const underB: HerdrPane = { ...pane("b", "tA", "codex"), parent_pane_id: "B" };
    expect(shape([underB, a, underA, b])).toEqual(["A", "└a", "B", "└b"]);
    const shared: HerdrPane = { ...pane("D", "tB", "codex"), parent_pane_id: "A" };
    expect(tabTree([a, b, shared]).map(row => [row.pane.pane_id, row.parent?.pane_id, row.depth])).toEqual([["A", undefined, 0], ["D", "A", 1], ["B", undefined, 0]]);
  });
  test("missing owners and cyclic origins preserve every pane as a visible root", () => {
    const a: HerdrPane = { ...pane("a", "t1", "codex"), parent_pane_id: "b" };
    const b: HerdrPane = { ...pane("b", "t2", "codex"), parent_pane_id: "a" };
    expect(shape([a, b])).toEqual(["a", "b"]);
    expect(shape([{ ...a, parent_pane_id: "gone" }])).toEqual(["a"]);
  });
  test("a tab's first agent pane heads the other panes of the tab", () => {
    const panes = [pane("p1", "t1", "claude"), pane("p2", "t1", "claude"), pane("p3", "t1", "codex")];
    expect(shape(panes)).toEqual(["p1", "├p2", "└p3"]);
    expect(tabTree(panes).map(row => row.parent?.pane_id)).toEqual([undefined, "p1", "p1"]);
  });

  test("a shell before the first agent goes under that agent", () => {
    expect(shape([pane("s", "t1", null), pane("a", "t1", "claude")])).toEqual(["a", "└s"]);
  });

  test("a tab without an agent stays flat", () => {
    expect(shape([pane("s1", "t1", null), pane("s2", "t1", null)])).toEqual(["s1", "s2"]);
  });

  test("tabs keep their order and do not share heads", () => {
    expect(shape([pane("a1", "t1", "claude"), pane("b1", "t2", "codex"), pane("a2", "t1", "claude"), pane("b2", "t2", null)])).toEqual(["a1", "└a2", "b1", "└b2"]);
  });
});
