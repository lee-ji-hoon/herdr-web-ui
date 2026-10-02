import { describe, expect, test } from "bun:test";
import { mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HerdrPane, SessionSnapshot } from "../shared/protocol.ts";
import { PanePurposes } from "./pane-purpose.ts";

function snapshot(...ids: string[]): SessionSnapshot {
  return {
    panes: ids.map((pane_id) => ({ pane_id, tab_id: "t1", agent_status: "idle", focused: false, revision: 0, terminal_id: `t-${pane_id}`, workspace_id: "w1" })),
  } as unknown as SessionSnapshot;
}

const purposeOf = (snap: SessionSnapshot, id: string) => (snap.panes.find((pane) => pane.pane_id === id) as HerdrPane | undefined)?.purpose;

describe("PanePurposes", () => {
  test("attaches each registered purpose to its pane", () => {
    const file = join(mkdtempSync(join(tmpdir(), "purpose-")), "pane-purpose.json");
    writeFileSync(file, JSON.stringify({ "w1:p1": " CI 속도 개선 ", "w1:p9": "gone pane", "w1:p2": 3 }));
    const result = new PanePurposes(file).apply(snapshot("w1:p1", "w1:p2"));
    expect(purposeOf(result, "w1:p1")).toBe("CI 속도 개선");
    expect(purposeOf(result, "w1:p2")).toBeUndefined();
  });

  test("a missing or broken registry leaves the snapshot as it was", () => {
    const dir = mkdtempSync(join(tmpdir(), "purpose-"));
    const original = snapshot("w1:p1");
    expect(new PanePurposes(join(dir, "missing.json")).apply(original)).toBe(original);
    const broken = join(dir, "pane-purpose.json");
    writeFileSync(broken, "{ not json");
    expect(new PanePurposes(broken).apply(original)).toBe(original);
  });

  test("tells when the registry is replaced by rename", async () => {
    const dir = mkdtempSync(join(tmpdir(), "purpose-"));
    const file = join(dir, "pane-purpose.json");
    const purposes = new PanePurposes(file);
    let calls = 0;
    purposes.start(() => { calls += 1; });
    try {
      writeFileSync(`${file}.tmp`, JSON.stringify({ "w1:p1": "new" }));
      renameSync(`${file}.tmp`, file);
      await Bun.sleep(800);
      expect(calls).toBe(1);
    } finally {
      purposes.stop();
    }
  });
});
