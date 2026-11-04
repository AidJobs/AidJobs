// Tests of the secret guard (security plan, stage 5). Fake secrets are built at runtime so the
// secret scanner has nothing to match. Run: node --test .cursor/hooks
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { pathToFileURL } from "node:url";

import { checkShell, checkTool, checkUrl, handle, knownSecrets, leakedNames, workspaceRoot } from "./secret-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "secret-guard.mjs");
const FAKE_PASSWORD = "fakepw" + "Tq77" + "-guardtest";
const FAKE_URL = `postgresql://probe:${FAKE_PASSWORD}@db.example.invalid:5432/postgres`;
const FAKE_KEY = "fakekey" + "-" + "Vv93guard0";
const FAKE_TOKEN = "faketok" + "en" + "-Kk11guard";

const root = mkdtempSync(join(tmpdir(), "guard-"));
mkdirSync(join(root, "apps", "backend"), { recursive: true });
mkdirSync(join(root, "apps", "frontend"), { recursive: true });
writeFileSync(join(root, "apps", "backend", ".env"), `\uFEFFSUPABASE_DB_URL=${FAKE_URL}\n`);
writeFileSync(join(root, "apps", "frontend", ".env.local"), "NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key-123456\n");
writeFileSync(join(root, ".env"), `SERVICE_API_KEY="${FAKE_KEY}"\n`);
const ENV = { SOME_TOKEN: FAKE_TOKEN, PATH: "/usr/bin", TEMP: "/tmp" };
after(() => rmSync(root, { recursive: true, force: true }));

const BLOCKED = [
  // reading .env files
  ["Get-Content apps\\backend\\.env", "reading an .env file"],
  ["gc .env", "reading an .env file"],
  ["cat apps/backend/.env", "reading an .env file"],
  ["type .env.local", "reading an .env file"],
  ["more .env", "reading an .env file"],
  ["head -n 5 .env", "reading an .env file"],
  ["Select-String -Path apps\\backend\\.env -Pattern URL", "reading an .env file"],
  ["findstr URL apps\\backend\\.env", "reading an .env file"],
  ["grep DB .env", "reading an .env file"],
  ["rg KEY apps/frontend/.env.local", "reading an .env file"],
  ["sed -n 1p .env", "reading an .env file"],
  ["awk -F= '{print $2}' .env", "reading an .env file"],
  ["Format-Hex .env", "reading an .env file"],
  ["[IO.File]::ReadAllText('apps\\backend\\.env')", "reading an .env file"],
  ["Copy-Item apps\\backend\\.env $env:TEMP\\x.txt", "reading an .env file"],
  ["cp .env /tmp/leak", "reading an .env file"],
  ["git show HEAD:.env", "reading an .env file"],
  ["git diff -- apps/backend/.env", "reading an .env file"],
  ["git log -p -- .env", "reading an .env file"],
  ["cd apps/backend; Get-Content .env", "reading an .env file"],
  ["Get-Content \"C:\\Users\\DELL\\Documents\\AidJobs App\\AidJobsGit\\apps\\backend\\.env\"", "reading an .env file"],
  ["git status && cat .env", "reading an .env file"],
  // dumping the environment
  ["printenv", "dumping the environment"],
  ["env", "dumping the environment"],
  ["set", "dumping the environment"],
  ["export -p", "dumping the environment"],
  ["Get-ChildItem Env:", "dumping the environment"],
  ["gci env:", "dumping the environment"],
  ["dir env:", "dumping the environment"],
  ["ls Env:*", "dumping the environment"],
  ["[Environment]::GetEnvironmentVariables()", "dumping the environment"],
  ["cmd /c set", "dumping the environment"],
  ["Get-ChildItem Env: | Format-Table", "dumping the environment"],
  // printing a credential variable
  ["echo $env:SUPABASE_DB_URL", "printing a credential variable"],
  ["Write-Host $env:OPENROUTER_API_KEY", "printing a credential variable"],
  ["Write-Output \"url=$env:DATABASE_URL\"", "printing a credential variable"],
  ["$env:VERCEL_AUTOMATION_BYPASS_SECRET", "printing a credential variable"],
  ["echo $SUPABASE_DB_URL", "printing a credential variable"],
  ["printf '%s' \"$GITHUB_TOKEN\"", "printing a credential variable"],
  ["Get-Item Env:NVIDIA_API_KEY", "printing a credential variable"],
  ["(Get-Item Env:COOKIE_SECRET).Value", "printing a credential variable"],
  ["$env:ADMIN_PASSWORD | Set-Content x.txt", "printing a credential variable"],
  // code that prints the environment
  ["python -c \"import os; print(os.environ)\"", "code that prints the environment"],
  ["python -c \"import os; print(dict(os.environ))\"", "code that prints the environment"],
  ["python -c \"import os; [print(k, v) for k, v in os.environ.items()]\"", "code that prints the environment"],
  ["python -c \"import os; print(os.getenv('SUPABASE_DB_URL'))\"", "code that prints the environment"],
  ["python -c \"import os; print(os.environ['OPENROUTER_API_KEY'])\"", "code that prints the environment"],
  ["python -c \"from dotenv import dotenv_values; print(dotenv_values('apps/backend/.env'))\"", "reading an .env file"],
  ["python -c \"from dotenv import dotenv_values; print(dotenv_values())\"", "code that prints the environment"],
  ["node -e \"console.log(process.env)\"", "code that prints the environment"],
  ["node -e \"console.log(process.env.VERCEL_TOKEN)\"", "code that prints the environment"],
  ["node -e \"console.log(JSON.stringify(process.env, null, 2))\"", "code that prints the environment"],
  // commands that reveal credentials
  ["gh auth token", "a command that reveals credentials"],
  ["gh auth status --show-token", "a command that reveals credentials"],
  ["gh auth status -t", "a command that reveals credentials"],
  ["gh secret set DB_URL --body x", "a command that reveals credentials"],
  ["vercel env pull .env.local", "a command that reveals credentials"],
  ["vercel env ls", "a command that reveals credentials"],
  ["curl https://api.render.com/v1/services/srv-1/env-vars", "a command that reveals credentials"],
  ["echo url=https://github.com | git credential fill", "a command that reveals credentials"],
  ["docker inspect db", "a command that reveals credentials"],
  ["docker compose config", "a command that reveals credentials"],
  // a remote connection string with a password
  [`psql "postgresql://user:${"hunter" + "2xyz"}@aws-1-ap.pooler.supabase.com:5432/postgres"`, "a connection string with a password for a remote host"],
  [`python check.py --db postgres://u:${"p4ss" + "w0rd"}@db.internal.company.net/x`, "a connection string with a password for a remote host"],
  // from the code review of 4 November 2026
  ["gci env: | Select-Object Name, Value", "dumping the environment"],
  ["Get-ChildItem Env: | Select-Object Name,Value | Format-Table", "dumping the environment"],
  ["(gci env:).Count; gci env:", "dumping the environment"],
  ["cmd /c type .env", "reading an .env file"],
  ["pwsh -c 'Get-Content .env'", "reading an .env file"],
  ["powershell -NoProfile -Command \"Get-Content apps\\backend\\.env\"", "reading an .env file"],
  ["bash -c 'echo $SUPABASE_DB_URL'", "printing a credential variable"],
  ["echo (gc .env)", "reading an .env file"],
  ["Write-Output (Get-Content .env)", "reading an .env file"],
  ["$(Get-Content .env)", "reading an .env file"],
  ["ConvertFrom-StringData (Get-Content .env -Raw)", "reading an .env file"],
  ["python -c \"print(open('.env').read())\"", "reading an .env file"],
  ["node -e \"console.log(require('fs').readFileSync('.env','utf8'))\"", "reading an .env file"],
  ["node -p \"require('fs').readFileSync('apps/backend/.env','utf8')\"", "reading an .env file"],
  ["node -p process.env", "code that prints the environment"],
  ["node -p \"process.env.SUPABASE_DB_URL\"", "code that prints the environment"],
  ["gci env:*KEY*", "dumping the environment"],
  ["Get-ChildItem Env:\\SUPABASE_DB_URL", "printing a credential variable"],
  ["dir Env:\\", "dumping the environment"],
  ["Get-Item -Path Env:ADMIN_PASSWORD", "printing a credential variable"],
  ["(gci env:).Value", "dumping the environment"],
  ["[Environment]::GetEnvironmentVariable('SUPABASE_DB_URL')", "printing a credential variable"],
  ["\"$env:SUPABASE_DB_URL\"", "printing a credential variable"],
  ["echo ${env:OPENROUTER_API_KEY}", "printing a credential variable"],
  ["cmd /c echo %SUPABASE_DB_URL%", "printing a credential variable"],
  ["cmd /c set SUPA", "dumping the environment"],
  ["cmd /c \"set\"", "dumping the environment"],
  ["cat ~/.git-credentials", "reading a credentials file"],
  ["Get-Content ~/.netrc", "reading a credentials file"],
  ["type %APPDATA%\\postgresql\\.pgpass", "reading a credentials file"],
  // from the re-review of 4 November 2026
  ["\"db: $env:SUPABASE_DB_URL\"", "printing a credential variable"],
  ["(\"url=${env:DATABASE_URL}\")", "printing a credential variable"],
  ["git commit -m \"x $(Get-Content .env)\"", "reading an .env file"],
  [`${"cmd /c ".repeat(5)}type .env`, "a shell nested too deeply to check"],
  ["gci env: | Tee-Object x.txt | Select-Object Name", "dumping the environment"],
  ["gci env: | Out-Host | Select-Object Name", "dumping the environment"],
  ["git -C apps/backend show HEAD:.env", "reading an .env file"],
  ["git grep -n URL -- apps/backend/.env", "reading an .env file"],
  ["rg -n URL apps/backend/.env", "reading an .env file"],
  ["Select-String URL -Path apps\\backend\\.env", "reading an .env file"],
];

const ALLOWED = [
  "git status",
  "git check-ignore -v .env",
  "git ls-files .env.sample",
  "Test-Path apps\\backend\\.env",
  "Get-Content .env.sample",
  "cat .env.example",
  "npm run test --workspace=@aidjobs/frontend",
  "python -m pytest tests/test_log_safety.py -q",
  "node scripts/env_check.mjs SUPABASE_DB_URL",
  "node scripts/env_check.mjs --names",
  "& \".\\.venv311\\Scripts\\python.exe\" \"$env:TEMP\\aj-p3\\crawl_idle_check.py\"",
  "python -c \"from pathlib import Path; t=Path(r'apps/backend/.env').read_text(encoding='utf-8-sig'); print(len(t) > 0)\"",
  "python scripts/x.py apps/backend/.env",
  "$env:SUPABASE_DB_URL='postgresql://probe:fakepw@db.example.invalid:5432/x'; python -m pytest",
  "$env:TEST_DATABASE_URL = 'postgresql://postgres@localhost:54329/aidjobs_test'",
  "[bool]$env:SUPABASE_DB_URL",
  "$env:SUPABASE_DB_URL.Length",
  "[string]::IsNullOrEmpty($env:OPENROUTER_API_KEY)",
  "Remove-Item Env:SUPABASE_DB_URL -ErrorAction SilentlyContinue",
  "curl.exe -H \"x-vercel-protection-bypass: $env:VERCEL_AUTOMATION_BYPASS_SECRET\" https://example.vercel.app/api",
  "Write-Host $env:TEMP",
  "echo $env:PATH",
  "Get-ChildItem Env:TEMP",
  "gh secret list",
  "gh pr view 101 --repo AidJobs/AidJobs",
  "gh auth status",
  "python -c \"import os; print(sorted(os.environ.keys()))\"",
  "node -e \"console.log(process.env.NODE_ENV)\"",
  "Get-Content docs\\architecture\\progress-ledger.md",
  "cat README.md",
  "Select-String -Path apps\\backend\\main.py -Pattern environ",
  "git diff --stat",
  "Get-ChildItem tools\\survey\\raw",
  "psql postgresql://postgres@localhost:54329/aidjobs_test",
  "echo hello; Get-Date",
  "docker ps",
  "Set-Content -Path x.txt -Value hello",
  "python -c \"print('environment check')\"",
  // from the replay of past commands: presence checks, exclusions and name-only listings
  "robocopy . $dst /E /XD .venv node_modules /XF .env /NFL /NDL",
  "Copy-Item -Recurse . $dst -Exclude .env",
  "python -c \"import os; print('password_set', bool(os.getenv('ADMIN_PASSWORD')))\"",
  "python -c \"import os; print(len(os.environ.get('SUPABASE_DB_URL', '')))\"",
  "python -c \"import os; print(os.getenv('OPENROUTER_API_KEY') is not None)\"",
  "Write-Host \"RENDER_API_KEY present: $([bool]$env:RENDER_API_KEY)\"",
  "Write-Output (\"ADMIN_PASSWORD_ENV=\" + [bool]$env:ADMIN_PASSWORD)",
  "Write-Host ($env:SUPABASE_DB_URL.Length)",
  "\"left: \" + ((Get-ChildItem Env: | Where-Object { $_.Name -match 'DB' }).Count)",
  "Get-ChildItem Env: | Select-Object -ExpandProperty Name",
  "\"left: \" + ((Get-ChildItem Env: | Where-Object { $_.Name -in 'A_KEY','B_URL' }).Name -join ',')",
  "[Environment]::GetEnvironmentVariables('User').Keys | Sort-Object",
  // from the code review of 4 November 2026: ordinary work that must not be refused
  "git ls-files | findstr .env",
  "git ls-files | Select-String -Pattern '\\.env'",
  "Select-String -Path docs\\*.md -Pattern '\\.env'",
  "Copy-Item .env.sample .env",
  "cp .env.example .env.local",
  "Get-Content apps\\frontend\\.env.local.example",
  "Test-Path Env:SUPABASE_DB_URL",
  "$x = [Environment]::GetEnvironmentVariable('SUPABASE_DB_URL'); python run.py",
  "[bool][Environment]::GetEnvironmentVariable('SUPABASE_DB_URL')",
  "python -c \"from dotenv import load_dotenv; load_dotenv('apps/backend/.env'); import os; print(bool(os.getenv('SUPABASE_DB_URL')))\"",
  "node -p \"Object.keys(process.env).length\"",
  "node -p \"process.env.NODE_ENV\"",
  "cat ~/.ssh/id_rsa.pub",
  "rg -n token_utils apps/backend",
  "Get-Content apps\\backend\\app\\secret_scan.py",
  "cmd /c npm run build",
  "pwsh -c 'git status'",
  "bash -c 'echo $HOME'",
  // from the re-review of 4 November 2026
  "git commit -m \"docs (type of .env check)\"",
  "git commit -m \"guard (code that reads .env)\"",
  "gh pr create --title \"stage 5 (head of .env rules)\" --body-file body.md",
  "git commit -m \"Refuses reads of .env {cat, type}\"",
  "Write-Host \"(more) .env\"",
  "'db: $env:SUPABASE_DB_URL'",
  "\"RENDER_API_KEY present: $([bool]$env:RENDER_API_KEY)\"",
  "rg -n \".env\" docs",
  "grep -rn \".env\" docs/",
  "git grep -n \".env\" -- docs",
  "findstr /s /i \".env\" *.md",
  "cmd /c cmd /c npm test",
];

test("still blocked after the replay fixes", () => {
  for (const command of [
    "Get-ChildItem Env: | Format-Table",
    "Get-ChildItem Env: | Where-Object { $_.Name -match 'DB' } | Select-Object Value",
    "[Environment]::GetEnvironmentVariables('User')",
    "robocopy apps\\backend $env:TEMP\\x .env",
    "Write-Host \"$([bool]$env:A_KEY) $env:B_KEY\"",
    "python -c \"import os; print(bool(1), os.getenv('B_TOKEN'))\"",
  ]) {
    assert.ok(checkShell(command), command);
  }
});

for (const [command, rule] of BLOCKED) {
  test(`blocks: ${command}`, () => assert.equal(checkShell(command), rule));
}
for (const command of ALLOWED) {
  test(`allows: ${command}`, () => assert.equal(checkShell(command), null));
}

test("file tools: credentials files are not read, env files not searched by content", () => {
  for (const path of [".env", "apps/backend/.env", "C:\\x\\apps\\frontend\\.env.local", "/home/u/.netrc",
    ".git-credentials", ".pgpass", "id_rsa", "id_ed25519", "certs/server.pem"]) {
    assert.equal(checkTool("Read", { path }), "reading a credentials file", path);
  }
  for (const path of [".env.sample", ".env.example", "README.md", "apps/backend/main.py", ".envrc.md"]) {
    assert.equal(checkTool("Read", { path }), null, path);
  }
  assert.equal(checkTool("Grep", { pattern: "^[A-Z]+=", path: "apps/backend/.env" }), "searching inside an .env file");
  assert.equal(checkTool("Grep", { pattern: "x", path: "apps", glob: "**/.env*" }), "searching inside an .env file");
  assert.equal(checkTool("Grep", { pattern: "x", path: "apps/backend/.env", output_mode: "files_with_matches" }), null);
  assert.equal(checkTool("Grep", { pattern: "x", path: "apps/backend" }), null);
  assert.equal(checkTool("Glob", { glob_pattern: "**/.env" }), null);
});

test("file tools: a content search of an outside folder holding an .env file is refused", () => {
  const workspace = join(root, "apps");
  const outside = join(root, "outside");
  const clean = join(root, "clean");
  mkdirSync(join(outside, "nested"), { recursive: true });
  mkdirSync(clean, { recursive: true });
  writeFileSync(join(outside, "nested", ".env"), "X=1\n");
  writeFileSync(join(clean, "notes.txt"), "x\n");
  const refused = "searching a folder outside the workspace that may hold an .env file";
  assert.equal(checkTool("Grep", { pattern: "x", path: outside }, workspace), refused);
  assert.equal(checkTool("Grep", { pattern: "x", path: outside, output_mode: "content" }, workspace), refused);
  assert.equal(checkTool("Grep", { pattern: "x", path: outside, output_mode: "files_with_matches" }, workspace), null);
  assert.equal(checkTool("Grep", { pattern: "x", path: outside, glob: "*.py" }, workspace), null);
  assert.equal(checkTool("Grep", { pattern: "x", path: outside, type: "py" }, workspace), null);
  assert.equal(checkTool("Grep", { pattern: "x", path: clean }, workspace), null);
  assert.equal(checkTool("Grep", { pattern: "x", path: join(root, "apps", "backend") }, workspace), null);
});

test("the workspace root is read in the forms Cursor sends", () => {
  assert.equal(workspaceRoot("/" + root.replace(/\\/g, "/")), resolve(root));
  assert.equal(workspaceRoot(pathToFileURL(root).href), resolve(root));
  assert.equal(workspaceRoot(root), resolve(root));
  assert.equal(workspaceRoot(join(root, "no-such-folder")), process.cwd());
  assert.equal(workspaceRoot(undefined), process.cwd());
});

test("file tools: relative and Cursor-style paths are judged from the workspace", () => {
  const workspace = join(root, "ws");
  const outside = join(root, "outside2");
  mkdirSync(join(workspace, "apps"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(workspace, ".env"), "X=1\n");
  writeFileSync(join(outside, ".env"), "X=1\n");
  const refused = "searching a folder outside the workspace that may hold an .env file";
  assert.equal(checkTool("Grep", { pattern: "x", path: "../outside2" }, workspace), refused);
  assert.equal(checkTool("Grep", { pattern: "x", path: "/" + outside.replace(/\\/g, "/") }, workspace), refused);
  assert.equal(checkTool("Grep", { pattern: "x", path: workspace }, workspace), null);
  assert.equal(checkTool("Grep", { pattern: "x", path: "apps" }, workspace), null);
  assert.equal(checkTool("Grep", { pattern: "x", path: outside, glob: "*.{py,env}" }, workspace), refused);
});

test("browser: the guard also answers preToolUse for browser tools", () => {
  assert.equal(checkTool("MCP:browser_navigate", { url: "https://dashboard.render.com/env-groups/evg-1" }), "a dashboard page that shows secrets");
  assert.equal(checkTool("MCP:browser_navigate", JSON.stringify({ url: "https://vercel.com/t/a/settings/environment-variables" })), "a dashboard page that shows secrets");
  assert.equal(checkTool("MCP:browser_navigate", { url: "https://aid-jobs-frontend.vercel.app/v2" }), null);
  assert.equal(checkTool("MCP:browser_snapshot", {}), null);
});

test("short and local passwords are not treated as known secrets", () => {
  const secrets = knownSecrets(join(root, "no-such-folder"), {
    TEST_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/aidjobs_test",
    SHORT_KEY: "abc12345",
  });
  assert.equal(leakedNames("image: postgres:16, start the postgres container, abc12345", secrets).size, 0);
});

test("a multi-line quoted value is one value, and its lines are not names", () => {
  const dir = join(root, "multi");
  mkdirSync(join(dir, "apps", "backend"), { recursive: true });
  const tail = "fakeTail" + "Line0Zq9==";
  writeFileSync(join(dir, "apps", "backend", ".env"), `PRIVATE_KEY="-----BEGIN FAKE-----\nAAAA${FAKE_KEY}\n${tail}\n-----END FAKE-----"\nNEXT_ONE=1\n`);
  const secrets = knownSecrets(dir, {});
  assert.equal(leakedNames(`line ${tail}`, secrets).size, 0);
  assert.ok([...secrets.keys()].some((v) => v.includes(tail)));
});

test("long commands are checked quickly", () => {
  for (const command of ["print(".repeat(40000), "console.log(".repeat(50000), "a".repeat(1000000), "gci env: | ".repeat(20000)]) {
    const start = Date.now();
    checkShell(command);
    assert.ok(Date.now() - start < 2000, `${command.slice(0, 12)}… took ${Date.now() - start} ms`);
  }
});

test("unexpected input types do not throw", () => {
  for (const event of [
    { hook_event_name: "beforeShellExecution", command: 5 },
    { hook_event_name: "beforeShellExecution" },
    { hook_event_name: "preToolUse", tool_name: "Grep", tool_input: null },
    { hook_event_name: "preToolUse", tool_name: "Grep", tool_input: { path: 3 } },
    { hook_event_name: "preToolUse", tool_name: "Read", tool_input: "not json" },
    { hook_event_name: "beforeReadFile", file_path: 7, content: { a: 1 } },
    { hook_event_name: "beforeMCPExecution", tool_input: "{" },
    { hook_event_name: "postToolUse", tool_output: { stdout: 1 } },
    { hook_event_name: "beforeSubmitPrompt", prompt: 7 },
    null,
  ]) {
    assert.doesNotThrow(() => handle(event, root, ENV), JSON.stringify(event));
  }
});

test("the repository ignores the env files, so workspace searches skip them", () => {
  const repo = join(HERE, "..", "..");
  const files = [".env", ".env.local", "apps/backend/.env", "apps/frontend/.env.local"];
  const ignored = execFileSync("git", ["check-ignore", "--no-index", ...files], { cwd: repo, encoding: "utf8" });
  assert.deepEqual(ignored.trim().split(/\r?\n/).sort(), [...files].sort());
});

test("browser: dashboard pages that show secrets are refused, others allowed", () => {
  for (const url of ["https://dashboard.render.com/web/srv-123/env", "https://dashboard.render.com/web/srv-1/environment",
    "https://vercel.com/team/app/settings/environment-variables", "https://supabase.com/dashboard/project/abc/settings/database",
    "https://supabase.com/dashboard/project/abc/settings/api"]) {
    assert.equal(checkUrl(url), "a dashboard page that shows secrets", url);
  }
  for (const url of ["https://dashboard.render.com/web/srv-123/events", "https://dashboard.render.com/web/srv-1/logs",
    "https://vercel.com/team/app", "https://aid-jobs-frontend.vercel.app/admin"]) {
    assert.equal(checkUrl(url), null, url);
  }
});

test("known secrets come from the env files and secret-named variables, public ones skipped", () => {
  const secrets = knownSecrets(root, ENV);
  const values = [...secrets.keys()];
  assert.ok(values.includes(FAKE_URL) && values.includes(FAKE_PASSWORD) && values.includes(FAKE_KEY) && values.includes(FAKE_TOKEN));
  assert.ok(!values.some((v) => v.includes("public-anon-key")));
  assert.equal(secrets.get(FAKE_PASSWORD), "SUPABASE_DB_URL");
});

function runHook(event) {
  const out = execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify(event), cwd: root, env: ENV, encoding: "utf8" });
  return { text: out, json: JSON.parse(out) };
}

test("the script finds the env files from Cursor's workspace root, whatever its own folder", () => {
  const event = {
    hook_event_name: "postToolUse", tool_name: "Shell", workspace_roots: ["/" + root.replace(/\\/g, "/")],
    tool_output: JSON.stringify({ stdout: `x ${FAKE_KEY} y` }),
  };
  const out = execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify(event), cwd: tmpdir(), env: { SystemRoot: process.env.SystemRoot ?? "" }, encoding: "utf8" });
  assert.match(JSON.parse(out).additional_context, /SERVICE_API_KEY/);
  assert.ok(!out.includes(FAKE_KEY));
});

test("the script answers each event in its schema, and never repeats a secret", () => {
  const cases = [
    [{ hook_event_name: "beforeShellExecution", command: `echo $env:SUPABASE_DB_URL; psql "${FAKE_URL.replace("db.example.invalid", "remote.host.net")}"` }, (j) => j.permission === "deny"],
    [{ hook_event_name: "beforeShellExecution", command: "git status" }, (j) => j.permission === "allow"],
    [{ hook_event_name: "preToolUse", tool_name: "Read", tool_input: { path: join(root, "apps", "backend", ".env") } }, (j) => j.permission === "deny"],
    [{ hook_event_name: "preToolUse", tool_name: "Grep", tool_input: { pattern: "x", path: "apps/backend/.env" } }, (j) => j.permission === "deny"],
    [{ hook_event_name: "preToolUse", tool_name: "Read", tool_input: { path: "README.md" } }, (j) => j.permission === "allow"],
    [{ hook_event_name: "beforeReadFile", file_path: join(root, "notes.txt"), content: `copied: ${FAKE_KEY}` }, (j) => j.permission === "deny"],
    [{ hook_event_name: "beforeReadFile", file_path: join(root, "notes.txt"), content: "nothing here" }, (j) => j.permission === "allow"],
    [{ hook_event_name: "beforeMCPExecution", tool_name: "browser_navigate", tool_input: JSON.stringify({ url: "https://vercel.com/t/a/settings/environment-variables" }) }, (j) => j.permission === "deny"],
    [{ hook_event_name: "beforeMCPExecution", tool_name: "browser_snapshot", tool_input: "{}" }, (j) => j.permission === "allow"],
    [{ hook_event_name: "postToolUse", tool_name: "Shell", tool_output: JSON.stringify({ stdout: `x ${FAKE_PASSWORD} y` }) }, (j) => /SUPABASE_DB_URL/.test(j.additional_context) && /rotated/.test(j.additional_context)],
    [{ hook_event_name: "postToolUse", tool_name: "Read", tool_output: "harmless" }, (j) => Object.keys(j).length === 0],
    [{ hook_event_name: "beforeSubmitPrompt", prompt: `here is my key ${FAKE_TOKEN}` }, (j) => j.continue === false && /SOME_TOKEN/.test(j.user_message)],
    [{ hook_event_name: "beforeSubmitPrompt", prompt: "what is next" }, (j) => j.continue === true],
  ];
  for (const [event, ok] of cases) {
    const { text, json } = runHook(event);
    assert.ok(ok(json), `${event.hook_event_name}: ${text.slice(0, 200)}`);
    for (const secret of [FAKE_PASSWORD, FAKE_KEY, FAKE_TOKEN, FAKE_URL]) {
      assert.ok(!text.includes(secret), `${event.hook_event_name} repeated a secret`);
    }
  }
});

test("a denial never repeats the command", () => {
  const { text } = runHook({ hook_event_name: "beforeShellExecution", command: "echo $env:SUPABASE_DB_URL # marker-xyz" });
  assert.ok(!text.includes("marker-xyz") && !text.includes("echo $env"));
  assert.match(text, /node scripts\/env_check\.mjs NAME/);
});

test("hooks.json registers the guard on every event it handles, with existing paths", () => {
  const config = JSON.parse(readFileSync(join(HERE, "..", "hooks.json"), "utf8"));
  assert.equal(config.version, 1);
  const expected = ["beforeShellExecution", "preToolUse", "beforeReadFile", "beforeMCPExecution", "postToolUse", "beforeSubmitPrompt"];
  for (const event of expected) {
    const entries = config.hooks[event];
    assert.ok(Array.isArray(entries) && entries.length, `${event} registered`);
    for (const entry of entries) {
      assert.match(entry.command, /^node \.cursor\/hooks\/secret-guard\.mjs$/);
      assert.ok(existsSync(join(HERE, "..", "..", entry.command.split(" ")[1])), `${entry.command} exists`);
    }
  }
  for (const event of ["beforeShellExecution", "preToolUse", "beforeReadFile", "beforeMCPExecution"]) {
    assert.equal(config.hooks[event][0].failClosed, true, `${event} refuses when the guard cannot run`);
  }
  assert.equal(config.hooks.preToolUse[0].matcher, "Read|Grep|MCP:");
  assert.equal(config.hooks.postToolUse[0].matcher, "Shell|Read|Grep");
  assert.equal(handle({ hook_event_name: "somethingElse" }).permission, undefined);
});
