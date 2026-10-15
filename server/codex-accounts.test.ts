import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAccountService, codexSlots } from "./codex-accounts.ts";
import { USAGE_PROVIDERS } from "./usage.ts";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "herdr-accounts-")); roots.push(home);
  const root = join(home, ".codex", "accounts"); mkdirSync(root, { recursive: true });
  const plugin = join(home, ".claude/plugins/cache/local/account/3.0.3"); mkdirSync(plugin, { recursive: true }); writeFileSync(join(plugin, "account_manager.py"), "");
  const jwt = (email: string, account: string) => `header.${Buffer.from(JSON.stringify({ exp: 9999999999, "https://api.openai.com/profile": { email }, "https://api.openai.com/auth": { chatgpt_account_id: account } })).toString("base64url")}.sig`;
  const auth = (id: string) => ({ tokens: { account_id: id, access_token: jwt(`${id}@test.invalid`, id) } });
  writeFileSync(join(root, "index.json"), JSON.stringify({ accounts: [{ id: "one", name: "One", account_id: "up-one" }, { id: "two", name: "Two", account_id: "up-two" }, { id: "wrong", account_id: "up-wrong" }, { id: "../outside", account_id: "bad" }] }));
  writeFileSync(join(root, "auth_one.json"), JSON.stringify(auth("up-one"))); writeFileSync(join(root, "auth_two.json"), JSON.stringify(auth("up-two"))); writeFileSync(join(root, "auth_wrong.json"), JSON.stringify(auth("other")));
  writeFileSync(join(home, ".codex/auth.json"), JSON.stringify(auth("up-one")));
  return { home, auth };
}
test("saved slots appear in usage and listing without credentials; invalid ownership is excluded", async () => {
  const { home } = fixture();
  expect(codexSlots(home).map((slot) => slot.id)).toEqual(["one", "two"]);
  const service = new CodexAccountService(home);
  const response = await service.handle(new Request("http://localhost/api/codex-accounts"));
  const result = await response.json();
  expect(result.accounts).toEqual([{ id: "one", label: "One", active: true }, { id: "two", label: "Two", active: false }]);
  expect(JSON.stringify(result)).not.toContain("access_token");
  const provider = USAGE_PROVIDERS.find((provider) => provider.id === "codex")!;
  const found = await provider.signIns({ home, env: {}, platform: "darwin", now: Date.now, fetch, run: async () => null, keychain: async () => ({ status: "missing" }) });
  expect(found.some((item) => item.source.endsWith("auth_two.json"))).toBe(true);
});
test("switch uses argv and requires matching manager receipt plus active auth readback", async () => {
  const { home, auth } = fixture();
  let calls = 0;
  const service = new CodexAccountService(home, async (argv) => {
    calls++; expect(argv.slice(2)).toEqual(["switch-provider", "codex", "two", "--json"]);
    return JSON.stringify({ ok: true, provider: "codex", requestedAccountID: "two", activeAccountID: "two", restartRequired: true });
  });
  const request = () => new Request("http://localhost/api/codex-accounts", { method: "POST", body: JSON.stringify({ id: "two" }) });
  expect((await service.handle(request())).status).toBe(502);
  writeFileSync(join(home, ".codex/auth.json"), JSON.stringify(auth("up-two")));
  expect(await (await service.handle(request())).json()).toEqual({ ok: true, activeAccountID: "two", restartRequired: true });
  expect(calls).toBe(2);
  expect((await service.handle(new Request("http://localhost/api/codex-accounts", { method: "POST", body: '{"id":"../x"}' }))).status).toBe(400);
  expect(calls).toBe(2);
});
test("concurrent switch is rejected and unconfirmed output is never retried", async () => {
  const { home } = fixture(); let resolve!: (value: string | null) => void; let calls = 0;
  const service = new CodexAccountService(home, async () => { calls++; return await new Promise<string | null>((done) => { resolve = done; }); });
  const request = () => new Request("http://localhost/api/codex-accounts", { method: "POST", body: '{"id":"two"}' });
  const first = service.handle(request()); await Bun.sleep(1);
  expect((await service.handle(request())).status).toBe(409);
  resolve(null); expect((await first).status).toBe(502); expect(calls).toBe(1);
});
