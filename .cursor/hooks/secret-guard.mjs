#!/usr/bin/env node
// Security plan, stage 5: stop the agent from printing secrets (a Cursor project hook).
//
// One script for every event in .cursor/hooks.json. Before an action it blocks the common direct
// ways to print a secret: reading .env files, dumping the environment, printing a variable named
// like a credential, code that prints the environment, CLI commands that reveal credentials, a
// connection string with a password for a remote host, and dashboard pages that show secrets.
// After an action, and on the user's prompt, it looks for known secret values and, on a match,
// says which setting to rotate, never the value. It cannot take back what was already shown.
//
// A blocked action is answered with the rule's name only; the command is never repeated.
// To check a setting safely: node scripts/env_check.mjs NAME

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SECRET_NAME = /(KEY|SECRET|PASSWORD|PASSWD|TOKEN|DB_URL|DATABASE_URL|DSN|COOKIE|CREDENTIAL)/i;
const TEMPLATE = /\.env\.(sample|example|template|dist)$/i;
const ENV_FILE_TOKEN = /(?:^|[\s'"`\\/=(,:])\.env(?:\.[\w-]+)*(?=$|[\s'"`)\],;|])/i;
const SENSITIVE_FILE = /^(\.env(\..+)?|\.netrc|\.git-credentials|\.pgpass|id_rsa|id_ed25519|.+\.pem)$/i;
const ENV_FILES = [".env", ".env.local", "apps/backend/.env", "apps/frontend/.env.local"];
const CHECKER = "node scripts/env_check.mjs NAME";

const READERS = new Set([
  "get-content", "gc", "cat", "type", "more", "less", "head", "tail", "select-string", "sls",
  "findstr", "grep", "rg", "sed", "awk", "format-hex", "copy-item", "cp", "copy", "xcopy",
  "robocopy", "move-item", "mv", "notepad", "code", "bat", "strings", "od", "xxd",
]);
const PRINTERS = new Set([
  "echo", "write-host", "write-output", "printf", "set-content", "out-file", "add-content", "tee",
  "tee-object", "print",
]);

const DASHBOARD = [
  /dashboard\.render\.com\/.*\/env(ironment)?\b/i,
  /vercel\.com\/.*\/settings\/environment-variables/i,
  /supabase\.com\/dashboard\/project\/[^/]+\/(settings\/(database|api)|database\/settings)/i,
];

// --- shell commands ------------------------------------------------------------------------

function segments(command) {
  return command.split(/\|\||&&|[;|&\n]/).map((s) => s.trim()).filter(Boolean);
}

function firstWord(segment) {
  const word = segment.replace(/^[@&(\s]+/, "").split(/[\s(]/)[0] || "";
  return word.toLowerCase().replace(/\.exe$/, "").replace(/^.*[\\/]/, "");
}

function mentionsEnvFile(text) {
  const tokens = text.match(new RegExp(ENV_FILE_TOKEN.source, "gi")) || [];
  return tokens.some((t) => !TEMPLATE.test(t.replace(/^[\s'"`\\/=(,:]+/, "")));
}

// Forms that only test whether a setting is present or how long it is, never its value.
const PRESENCE_ONLY = [
  /\[bool\]\s*\$env:\w+/gi, /\$env:\w+\.Length\b/gi, /isnullor(empty|whitespace)\s*\(\s*\$env:\w+\s*\)/gi,
  /-not\s+\$env:\w+/gi, /\$null\s*-(eq|ne)\s*\$env:\w+/gi, /\$env:\w+\s*-(eq|ne)\s*\$null/gi,
  /\b(bool|len)\s*\(\s*os\.(getenv|environ\.get)\s*\([^)]*\)\s*\)/g,
  /os\.(getenv|environ\.get)\s*\([^)]*\)\s+is\s+(not\s+)?None/g,
  /\b(bool|len)\s*\(\s*os\.environ\s*\[[^\]]*\]\s*\)/g,
];
const EXCLUDE_OPTION = /(\/xf|-exclude|--exclude(?:=|\s))\s*("[^"]*"|'[^']*'|[^\s;|]+(\s+[^\s/;|-][^\s;|]*)*)/gi;
// An environment listing that ends in a count or in names only.
const NAMES_ONLY_LISTING = /(get-childitem|gci|dir|ls)\s+env:[^;\n]*?(\)\s*\.(count|name|key)\b|measure-object|-expandproperty\s+(name|key)\b|select-object\s+(-property\s+)?(name|key)\b)/i;

function withoutPresenceChecks(segment) {
  return PRESENCE_ONLY.reduce((text, pattern) => text.replace(pattern, " "), segment);
}

const SHELL_RULES = [
  ["reading an .env file", (seg, word) =>
    (READERS.has(word) && mentionsEnvFile(seg.replace(EXCLUDE_OPTION, " "))) ||
    (/\[(system\.)?io\.file\]::(readall|open|copy)/i.test(seg) && mentionsEnvFile(seg)) ||
    (word === "git" && /\bgit\s+(show|diff|log|blame|cat-file|grep)\b/i.test(seg) && mentionsEnvFile(seg))],
  ["dumping the environment", (seg, word, namesOnly) =>
    word === "printenv" ||
    (word === "env" && /^env\s*$/i.test(seg)) ||
    (word === "set" && /^set\s*$/i.test(seg)) ||
    (word === "export" && /^export\s+-p\b/i.test(seg)) ||
    (!namesOnly && /\b(get-childitem|gci|dir|ls|get-item|gi)\s+env:\s*(\\\*|\*)?\s*$/i.test(seg)) ||
    /\[(system\.)?environment\]::getenvironmentvariables\s*\([^)]*\)(?!\s*\.\s*keys\b)/i.test(seg) ||
    /\bcmd(\.exe)?\s+\/c\s+set\s*("|'|$)/i.test(seg)],
  ["printing a credential variable", (raw, word) => {
    const seg = withoutPresenceChecks(raw);
    const ps = [...seg.matchAll(/\$env:([A-Za-z_][\w]*)/gi)].map((m) => m[1]);
    const sh = [...seg.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g)].map((m) => m[1]);
    const secret = [...ps, ...sh].some((n) => SECRET_NAME.test(n) && !/^NEXT_PUBLIC_/i.test(n));
    if (/\b(get-item|gi|get-childitem|gci|dir|ls)\s+env:([\w]+)/i.test(seg)) {
      const name = seg.match(/env:([\w]+)/i)[1];
      if (SECRET_NAME.test(name)) return true;
    }
    if (!secret) return false;
    if (PRINTERS.has(word)) return true;
    return /^\$env:[\w]+\s*$/i.test(seg) || /^\$\{?[A-Z_][A-Z0-9_]*\}?\s*$/.test(seg);
  }],
  ["code that prints the environment", (raw) => {
    const seg = withoutPresenceChecks(raw);
    return /print\s*\(\s*(dict\s*\(\s*)?os\.environ\b(?!\s*\.\s*keys)/.test(seg) ||
    /os\.environ\.items\s*\(\s*\)/.test(seg) ||
    /print\s*\(.*os\.(getenv|environ\.get)\s*\(\s*['"][^'"]*(KEY|SECRET|PASSWORD|TOKEN|DB_URL|DATABASE_URL|DSN)/i.test(seg) ||
    /print\s*\(.*os\.environ\s*\[\s*['"][^'"]*(KEY|SECRET|PASSWORD|TOKEN|DB_URL|DATABASE_URL|DSN)/i.test(seg) ||
    /print\s*\(\s*dotenv_values\s*\((?![^)]*\)\s*\.keys)/.test(seg) ||
    /console\.(log|info|error|dir|table)\s*\(\s*process\.env\s*[,)]/.test(seg) ||
    /console\.(log|info|error|dir)\s*\([^)]*process\.env\.[A-Z0-9_]*(KEY|SECRET|PASSWORD|TOKEN|DB_URL|DATABASE_URL|DSN)/i.test(seg) ||
    /JSON\.stringify\s*\(\s*process\.env\s*[,)]/.test(seg);
  }],
  ["a command that reveals credentials", (seg) =>
    /\bgh\s+auth\s+token\b/i.test(seg) ||
    /\bgh\s+auth\s+status\b.*(\s-t\b|--show-token)/i.test(seg) ||
    /\bgh\s+secret\s+(set|delete|remove)\b/i.test(seg) ||
    /\bvercel\s+env\s+(pull|ls|list)\b/i.test(seg) ||
    /api\.render\.com\/[^\s'"]*env-vars/i.test(seg) ||
    /\bgit\s+credential\s+fill\b/i.test(seg) ||
    /\bdocker\s+(inspect|compose\s+config)\b/i.test(seg)],
  ["a connection string with a password for a remote host", (seg) => {
    for (const m of seg.matchAll(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/'"]+:[^\s@'"]+@([^\s/:'"?]+)/gi)) {
      const host = m[1].toLowerCase();
      if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && !/\.(invalid|test|example|localhost)$/.test(host)
          && !/(^|\.)example\.(com|org|net)$/.test(host)) return true;
    }
    return false;
  }],
];

export function checkShell(command) {
  const namesOnly = NAMES_ONLY_LISTING.test(command || "");
  for (const seg of segments(command || "")) {
    const word = firstWord(seg);
    for (const [rule, test] of SHELL_RULES) {
      if (test(seg, word, namesOnly)) return rule;
    }
  }
  return null;
}

// --- file tools -----------------------------------------------------------------------------

export function sensitivePath(path) {
  if (!path) return false;
  const name = basename(String(path).replace(/\\/g, "/"));
  return SENSITIVE_FILE.test(name) && !TEMPLATE.test(name);
}

function toolPath(input) {
  return input?.path ?? input?.file_path ?? input?.target_file ?? input?.target_directory ?? "";
}

const SKIPPED_FOLDERS = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".next"]);
const FOLDER_SCAN_LIMIT = 5000;

// Grep honours .gitignore inside the workspace, which ignores .env files; elsewhere it does not.
function folderHoldsSecrets(folder) {
  const queue = [folder];
  let seen = 0;
  while (queue.length) {
    let entries;
    try {
      entries = readdirSync(queue.shift(), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++seen > FOLDER_SCAN_LIMIT) return true;
      if (entry.isDirectory()) {
        if (!SKIPPED_FOLDERS.has(entry.name)) queue.push(join(entry.parentPath ?? entry.path, entry.name));
      } else if (sensitivePath(entry.name)) {
        return true;
      }
    }
  }
  return false;
}

function inside(path, root) {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function checkTool(toolName, input, root = process.cwd()) {
  const tool = String(toolName || "");
  if (tool === "Read" && sensitivePath(toolPath(input))) return "reading a credentials file";
  if (tool === "Grep") {
    const mode = String(input?.output_mode ?? "content");
    const glob = String(input?.glob ?? "");
    const target = toolPath(input);
    if (mode !== "content") return null;
    if (sensitivePath(target) || /(^|[\\/*{,])\.env(\b|\*|$)/i.test(glob) || sensitivePath(glob)) {
      return "searching inside an .env file";
    }
    const narrowed = input?.type || /\*\.[\w{},]+$/.test(glob);
    const folder = resolve(root, target || ".");
    let isFolder = false;
    try {
      isFolder = statSync(folder).isDirectory();
    } catch {
      isFolder = false;
    }
    if (!narrowed && isFolder && !inside(folder, root) && folderHoldsSecrets(folder)) {
      return "searching a folder outside the workspace that may hold an .env file";
    }
  }
  return null;
}

export function checkUrl(url) {
  return DASHBOARD.some((p) => p.test(String(url || ""))) ? "a dashboard page that shows secrets" : null;
}

// --- known secret values --------------------------------------------------------------------

function parseEnvFile(path) {
  const values = {};
  let text;
  try {
    text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return values;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function secretParts(name, value) {
  const parts = [];
  if (!value || value.length < 8) return parts;
  const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  if (SECRET_NAME.test(name) || isUrl) {
    if (!isUrl || SECRET_NAME.test(name)) parts.push(value);
    if (isUrl) {
      try {
        const url = new URL(value);
        if (url.password) {
          parts.push(value);
          parts.push(url.password);
          parts.push(decodeURIComponent(url.password));
        }
      } catch {
        // not a parseable URL: the whole value is kept above when its name is secret
      }
    }
  }
  return parts.filter((p) => p && p.length >= 8);
}

export function knownSecrets(root = process.cwd(), env = process.env) {
  const found = new Map(); // value -> setting name
  const add = (name, value) => {
    if (/^NEXT_PUBLIC_/i.test(name)) return; // public by design
    for (const part of secretParts(name, value)) if (!found.has(part)) found.set(part, name);
  };
  for (const rel of ENV_FILES) {
    const path = join(root, rel);
    if (existsSync(path)) for (const [name, value] of Object.entries(parseEnvFile(path))) add(name, value);
  }
  for (const [name, value] of Object.entries(env)) if (SECRET_NAME.test(name)) add(name, value);
  return found;
}

export function leakedNames(text, secrets) {
  const names = new Set();
  if (!text) return names;
  for (const [value, name] of secrets) if (text.includes(value)) names.add(name);
  return names;
}

// --- events ---------------------------------------------------------------------------------

function denied(rule, extra = {}) {
  const advice = `Blocked by the project's secret guard (security plan, stage 5): ${rule}. ` +
    `Do not try another way to show it. To check whether a setting is present, use: ${CHECKER}`;
  return { permission: "deny", user_message: advice, agent_message: advice, ...extra };
}

function leakNotice(names) {
  const list = [...names].sort().join(", ");
  return `STOP: the previous output contained the value of ${list}. Do not repeat, quote or ` +
    `summarise it. Tell the user plainly that ${list} was exposed in this chat and should be ` +
    `rotated, and continue without it.`;
}

export function handle(event, root = process.cwd(), env = process.env) {
  const name = event?.hook_event_name ?? "";
  switch (name) {
    case "beforeShellExecution": {
      const rule = checkShell(event.command);
      return rule ? denied(rule) : { permission: "allow" };
    }
    case "preToolUse": {
      const rule = checkTool(event.tool_name, event.tool_input, root);
      return rule ? denied(rule) : { permission: "allow" };
    }
    case "beforeReadFile": {
      if (sensitivePath(event.file_path)) return { permission: "deny", user_message: denied("reading a credentials file").user_message };
      const leaks = leakedNames(event.content, knownSecrets(root, env));
      if (leaks.size) return { permission: "deny", user_message: denied(`a file holding the value of ${[...leaks].sort().join(", ")}`).user_message };
      return { permission: "allow" };
    }
    case "beforeMCPExecution": {
      let input = event.tool_input;
      if (typeof input === "string") {
        try { input = JSON.parse(input); } catch { input = {}; }
      }
      const rule = checkUrl(input?.url);
      return rule ? denied(rule) : { permission: "allow" };
    }
    case "postToolUse": {
      const output = typeof event.tool_output === "string" ? event.tool_output : JSON.stringify(event.tool_output ?? "");
      const leaks = leakedNames(output, knownSecrets(root, env));
      return leaks.size ? { additional_context: leakNotice(leaks) } : {};
    }
    case "beforeSubmitPrompt": {
      const leaks = leakedNames(event.prompt, knownSecrets(root, env));
      if (leaks.size) {
        return { continue: false, user_message: `Not sent: your message contains the value of ${[...leaks].sort().join(", ")}. Remove it; consider rotating it.` };
      }
      return { continue: true };
    }
    default:
      return {};
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const event = raw.trim() ? JSON.parse(raw) : {};
  const root = event.workspace_roots?.[0] || process.cwd();
  process.stdout.write(JSON.stringify(handle(event, root)));
}

const self = (p) => resolve(p).toLowerCase();
if (process.argv[1] && self(fileURLToPath(import.meta.url)) === self(process.argv[1])) {
  main().catch(() => process.exit(1));
}
