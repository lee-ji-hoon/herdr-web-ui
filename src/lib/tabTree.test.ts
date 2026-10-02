import { describe, expect, test } from "bun:test";

import type { PaneInfo } from "../../shared/protocol.ts";
import { tabTree } from "./tabTree.ts";

function pane(pane_id: string, tab_id: string, agent: string | null): PaneInfo {
  return { pane_id, tab_id, agent, agent_status: "idle", focused: false, revision: 0, terminal_id: `t-${pane_id}`, workspace_id: "w1" };
}

const shape = (panes: PaneInfo[]) => tabTree(panes).map(({ pane, depth, last }) => `${depth ? (last ? "└" : "├") : ""}${pane.pane_id}`);

describe("tabTree", () => {
  test("a tab's first agent pane heads the other panes of the tab", () => {
    expect(shape([pane("p1", "t1", "claude"), pane("p2", "t1", "claude"), pane("p3", "t1", "codex")])).toEqual(["p1", "├p2", "└p3"]);
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
