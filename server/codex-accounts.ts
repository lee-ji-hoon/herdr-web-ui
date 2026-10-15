import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CodexAccounts } from "../shared/codex-accounts.ts";
import { jsonResponse } from "./http.ts";
import { runCommand } from "./usage.ts";

const validID = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id);
function readObject(path: string): Record<string, any> {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 1024 * 1024) return {};
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function codexSlots(home: string): { id: string; label: string; upstream: string; path: string }[] {
  const root = join(home, ".codex", "accounts");
  const index = readObject(join(root, "index.json"));
  if (!Array.isArray(index.accounts)) return [];
  return index.accounts.flatMap((item) => {
    if (!item || !validID(item.id) || typeof item.account_id !== "string") return [];
    const path = join(root, `auth_${item.id}.json`);
    const auth = readObject(path);
    if (auth.tokens?.account_id !== item.account_id || typeof auth.tokens?.access_token !== "string") return [];
    return [{ id: item.id, label: String(item.name || item.email || item.id), upstream: item.account_id, path }];
  });
}
export function accountManager(home: string): string | null {
  const candidates: { version: number[]; path: string }[] = [];
  for (const owner of ["local", "lee-ji-hoon"]) {
    const root = join(home, ".claude", "plugins", "cache", owner, "account");
    try {
      for (const version of readdirSync(root)) {
        if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
        const path = join(root, version, "account_manager.py");
        if (lstatSync(path).isFile()) candidates.push({ version: version.split(".").map(Number), path });
      }
    } catch { /* absent plugin */ }
  }
  candidates.sort((a, b) => b.version[0]! - a.version[0]! || b.version[1]! - a.version[1]! || b.version[2]! - a.version[2]!);
  return candidates[0]?.path ?? null;
}
export class CodexAccountService {
  private switching = false;
  constructor(private home = homedir(), private run = runCommand) {}
  list(): CodexAccounts {
    const active = readObject(join(this.home, ".codex", "auth.json")).tokens?.account_id;
    return { accounts: codexSlots(this.home).map(({ id, label, upstream }) => ({ id, label, active: upstream === active })), switchAvailable: accountManager(this.home) !== null && !process.env["CODEX_HOME"] };
  }
  async handle(request: Request): Promise<Response> {
    if (request.method === "GET") return jsonResponse(this.list(), 200, { "cache-control": "no-store" });
    if (request.method !== "POST") return jsonResponse({ error: { code: "method_not_allowed", message: "Use GET or POST" } }, 405);
    if (this.switching) return jsonResponse({ error: { code: "switch_pending", message: "Account switch is already in progress" } }, 409);
    let body: unknown;
    try { body = await request.json(); } catch { return jsonResponse({ error: { code: "invalid_account", message: "Choose a saved account" } }, 400); }
    const id = (body as { id?: unknown } | null)?.id;
    if (!validID(id) || !this.list().accounts.some((account) => account.id === id)) return jsonResponse({ error: { code: "invalid_account", message: "Choose a saved account" } }, 400);
    const manager = accountManager(this.home);
    if (!manager || !this.list().switchAvailable) return jsonResponse({ error: { code: "switch_unavailable", message: "Install the account manager; custom CODEX_HOME cannot be switched here" } }, 503);
    this.switching = true;
    try {
      // The manager preserves rotated active credentials and validates the target before replacing auth.
      const output = await this.run(["python3", manager, "switch-provider", "codex", id, "--json"]);
      let result: any;
      try { result = JSON.parse(output ?? "null"); } catch { result = null; }
      const active = this.list().accounts.find((account) => account.id === id)?.active;
      if (result?.ok !== true || result.provider !== "codex" || result.requestedAccountID !== id || result.activeAccountID !== id || typeof result.restartRequired !== "boolean" || !active) return jsonResponse({ error: { code: "switch_unconfirmed", message: "Switch was not confirmed. Check the active account before retrying." } }, 502);
      return jsonResponse({ ok: true, activeAccountID: id, restartRequired: result.restartRequired }, 200, { "cache-control": "no-store" });
    } finally { this.switching = false; }
  }
}
