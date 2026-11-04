// Tests of the settings checker: it reports presence and shape, never a value.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { describe, report } from "./env_check.mjs";

const FAKE_PASSWORD = "fakepw" + "Zq81" + "-checker";
const FAKE_URL = `postgresql://probe:${FAKE_PASSWORD}@db.example.invalid:5432/postgres`;
const FAKE_KEY = "fakekey" + "-" + "Nn42chk0";
const root = mkdtempSync(join(tmpdir(), "envcheck-"));
mkdirSync(join(root, "apps", "backend"), { recursive: true });
writeFileSync(join(root, "apps", "backend", ".env"), `\uFEFFSUPABASE_DB_URL="${FAKE_URL}"\nEMPTY_ONE=\n`);
writeFileSync(join(root, ".env"), `OTHER_API_KEY=${FAKE_KEY}\n`);
after(() => rmSync(root, { recursive: true, force: true }));

function joined(args, env = {}) {
  return report(args, root, env).join("\n");
}

test("a setting in an env file with a byte-order mark is found, its value never shown", () => {
  const text = joined(["SUPABASE_DB_URL"]);
  assert.match(text, /SUPABASE_DB_URL: set \(\d+ characters\); postgresql address, with password, remote host in apps\/backend\/\.env/);
  assert.ok(!text.includes(FAKE_PASSWORD) && !text.includes("db.example.invalid"));
});

test("not set, empty, and the process environment are told apart", () => {
  assert.match(joined(["MISSING_NAME"]), /MISSING_NAME: not set/);
  assert.match(joined(["EMPTY_ONE"]), /EMPTY_ONE: empty in apps\/backend\/\.env/);
  const text = joined(["OTHER_API_KEY"], { OTHER_API_KEY: FAKE_KEY });
  assert.match(text, /in process environment/);
  assert.match(text, /in \.env/);
  assert.ok(!text.includes(FAKE_KEY));
});

test("names can be listed, values never", () => {
  const text = joined(["--names", "url"]);
  assert.match(text, /apps\/backend\/\.env: SUPABASE_DB_URL/);
  assert.ok(!text.includes(FAKE_PASSWORD));
  assert.match(joined(["--names"], { A: "1", B: "2" }), /process environment: 2 names \(give a filter/);
});

test("describe gives the shape of an address only", () => {
  assert.equal(describe(undefined), "not set");
  assert.equal(describe(""), "empty");
  assert.equal(describe("http://localhost:8000"), "set (21 characters); http address, no password, local host");
  assert.match(describe("not a url"), /^set \(9 characters\)$/);
});

test("run as a script, it prints the same and no value", () => {
  const script = fileURLToPath(new URL("./env_check.mjs", import.meta.url));
  const out = execFileSync(process.execPath, [script, "SUPABASE_DB_URL", "OTHER_API_KEY"], { cwd: root, env: {}, encoding: "utf8" });
  assert.match(out, /SUPABASE_DB_URL: set/);
  assert.ok(!out.includes(FAKE_PASSWORD) && !out.includes(FAKE_KEY));
});
