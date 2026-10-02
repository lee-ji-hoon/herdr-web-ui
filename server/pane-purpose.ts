import { readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import type { HerdrPane, SessionSnapshot } from "../shared/protocol.ts";

/**
 * Pane purposes: a `{ "<pane_id>": "<what this pane is for>" }` registry that agents write about
 * themselves (`herdr-purpose.py`), the same one herdr's radar sidebar shows. The web ui shows it
 * as the pane's name when the user did not name the pane.
 */
export function defaultPurposeFile(): string {
  return process.env["HERDR_PANE_PURPOSE_FILE"] || join(homedir(), ".local/state/herdr/pane-purpose.json");
}

export class PanePurposes {
  private cache: { mtimeMs: number; purposes: Map<string, string> } | null = null;
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file: string = defaultPurposeFile()) {}

  /** The registry as it is on disk now; missing or broken files read as empty. */
  read(): Map<string, string> {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(this.file).mtimeMs;
    } catch {
      this.cache = null;
      return new Map();
    }
    if (this.cache?.mtimeMs === mtimeMs) return this.cache.purposes;
    const purposes = new Map<string, string>();
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [paneId, value] of Object.entries(parsed)) {
          if (typeof value === "string" && value.trim()) purposes.set(paneId, value.trim());
        }
      }
    } catch { /* half-written or not JSON: show no purposes until the next write */ }
    this.cache = { mtimeMs, purposes };
    return purposes;
  }

  apply(snapshot: SessionSnapshot): SessionSnapshot {
    const purposes = this.read();
    if (purposes.size === 0) return snapshot;
    return {
      ...snapshot,
      panes: snapshot.panes.map((pane) => {
        const purpose = purposes.get(pane.pane_id);
        return purpose ? ({ ...pane, purpose } satisfies HerdrPane) : pane;
      }),
    };
  }

  /**
   * Calls `onChange` when the registry changes. Watches the directory, not the file: writers
   * replace the file by rename, which a watch on the old file never sees.
   */
  start(onChange: () => void): void {
    const name = basename(this.file);
    try {
      this.watcher = watch(dirname(this.file), (_event, changed) => {
        if (changed !== null && changed !== name) return;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          onChange();
        }, 300);
      });
    } catch { /* no state directory yet: purposes show on the next structure change */ }
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.watcher?.close();
    this.watcher = null;
  }
}
