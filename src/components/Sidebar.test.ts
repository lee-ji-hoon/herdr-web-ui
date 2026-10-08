import { expect, test } from "bun:test";
import type { HerdrPane } from "../../shared/protocol.ts";
import { displayPaneTitle } from "./Sidebar.tsx";

test("child rows hide only an exact folder suffix or a visibly truncated folder", () => {
  const pane: HerdrPane = { pane_id: "child", workspace_id: "worker", tab_id: "t1", terminal_id: "term", focused: false, revision: 1, agent: "codex", agent_status: "idle", cwd: "/work/reviewer" };
  for (const [title, expected] of [["Implement | review", "Implement | review"], ["Implement | reviewer", "Implement"], ["Implement | review…", "Implement"], ["Review | unrelated", "Review | unrelated"], ["/work/reviewer", "codex"]]) {
    expect(displayPaneTitle({ ...pane, terminal_title_stripped: title }, true)).toBe(expected!);
  }
  expect(displayPaneTitle({ ...pane, terminal_title_stripped: "Implement | reviewer" })).toBe("Implement | reviewer");
});
