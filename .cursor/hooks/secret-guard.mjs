#!/usr/bin/env node
// Security plan, stage 5: stop the agent from printing secrets (a Cursor project hook).
//
// One script for every event in .cursor/hooks.json. Before an action it blocks the common direct
// ways to print a secret: reading .env or credentials files, dumping the environment, printing a
// variable named like a credential, code that prints the environment, CLI commands that reveal
// credentials, a connection string with a password for a remote host, and dashboard pages that
// show secrets. After an action, and on the user's prompt, it looks for known secret values and,
// on a match, says which setting to rotate, never the value. It cannot take back what was shown.
//
// A blocked action is answered with the rule's name only; the command is never repeated.
// To check a setting safely: node scripts/env_check.mjs NAME

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SECRET_NAME = /(KEY|SECRET|PASSWORD|PASSWD|TOKEN|DB_URL|DATABASE_URL|DSN|COOKIE|CREDENTIAL)/i;
const TEMPLATE = /\.env(\.[\w-]+)*\.(sample|example|template|dist)$/i;
const ENV_FILE_TOKEN = /(?:^|[\s'"`\\/=(,:])\.env(?:\.[\w-]+)*(?=$|[\s'"`)\],;|}])/gi;
const CREDENTIAL_FILE_TOKEN = /(?:^|[\s'"`\\/=(,:~])(?:\.netrc|_netrc|\.git-credentials|\.pgpass|id_rsa|id_ed25519|id_ecdsa|[\w.-]+\.pem)(?=$|[\s'"`)\],;|}])/gi;
const SENSITIVE_FILE = /^(\.env(\..+)?|\.netrc|_netrc|\.git-credentials|\.pgpass|id_rsa|id_ed25519|id_ecdsa|.+\.pem)$/i;
const ENV_FILES = [".env", ".env.local", "apps/backend/.env", "apps/frontend/.env.local"];
const CHECKER = "node scripts/env_check.mjs NAME";
const MIN_SECRET_LENGTH = 12;

const COPIERS = new Set(["copy-item", "cp", "copy", "xcopy", "robocopy", "move-item", "mv"]);
const FILTERS = new Set(["select-string", "sls", "findstr", "grep", "rg"]);
const READERS = new Set([
  "get-content", "gc", "cat", "type", "more", "less", "head", "tail", "sed", "awk", "format-hex", "notepad",
  "code", "bat", "strings", "od", "xxd", ...COPIERS, ...FILTERS,
]);
const PRINTERS = new Set([
  "echo", "write-host", "write-output", "printf", "set-content", "out-file", "add-content", "tee",
  "tee-object", "print",
]);

const DASHBOARD = [
  /dashboard\.render\.com\/\S*\/env(ironment)?\b/i,
  /dashboard\.render\.com\/(\S*\/)?env-groups?\b/i,
  /vercel\.com\/\S*\/settings\/environment-variables/i,
  /supabase\.com\/dashboard\/project\/[^/\s]+\/(settings\/(database|api)|database\/settings)/i,
];

// --- paths ----------------------------------------------------------------------------------

// Cursor gives Windows folders as "/c:/Users/..." (or a file: URL); Node needs "c:/Users/...".
export function nativePath(path) {
  let text = String(path ?? "");
  if (/^file:\/\//i.test(text)) {
    try {
      text = fileURLToPath(text);
    } catch {
      return "";
    }
  }
  return /^\/[a-z]:[\\/]/i.test(text) ? text.slice(1) : text;
}

export function workspaceRoot(given) {
  const path = nativePath(given);
  return path && existsSync(path) ? resolve(path) : process.cwd();
}

// --- shell commands -------------------------------------------------------------------------

function firstWord(segment) {
  const word = segment.replace(/^[@&(\s]+/, "").split(/[\s(]/)[0] || "";
  return word.toLowerCase().replace(/^["']|["']$/g, "").replace(/\.exe$/, "").replace(/^.*[\\/]/, "");
}

function mentions(text, token) {
  const found = text.match(token) || [];
  return found.some((t) => !TEMPLATE.test(t.replace(/^[\s'"`\\/=(,:~]+/, "")));
}

const mentionsEnvFile = (text) => mentions(text, ENV_FILE_TOKEN);
const mentionsCredentialFile = (text) => mentions(text, CREDENTIAL_FILE_TOKEN);

const ENV_REF = String.raw`(?:\$\{?env:\w+\}?|\[(?:system\.)?environment\]::getenvironmentvariable\s*\([^)]{0,200}\))`;
// Forms that only test whether a setting is present or how long it is, never its value.
const PRESENCE_ONLY = [
  new RegExp(String.raw`\[bool\]\s*${ENV_REF}`, "gi"),
  new RegExp(String.raw`${ENV_REF}\.Length\b`, "gi"),
  new RegExp(String.raw`isnullor(empty|whitespace)\s*\(\s*${ENV_REF}\s*\)`, "gi"),
  new RegExp(String.raw`-not\s+${ENV_REF}`, "gi"),
  new RegExp(String.raw`\$null\s*-(eq|ne)\s*${ENV_REF}`, "gi"),
  new RegExp(String.raw`${ENV_REF}\s*-(eq|ne)\s*\$null`, "gi"),
  /\b(bool|len)\s*\(\s*os\.(getenv|environ\.get)\s*\([^)]{0,200}\)\s*\)/g,
  /os\.(getenv|environ\.get)\s*\([^)]{0,200}\)\s+is\s+(not\s+)?None/g,
  /\b(bool|len)\s*\(\s*os\.environ\s*\[[^\]]{0,200}\]\s*\)/g,
];
const EXCLUDE_OPTION = /(\/xf|-exclude|--exclude(?:=|\s))\s*("[^"]*"|'[^']*'|[^\s;|]+(\s+[^\s/;|-][^\s;|]*)*)/gi;
const PATTERN_OPTION = /-pattern\s+("[^"]*"|'[^']*'|\S+)/gi;
// An environment listing that ends in a count or in names only (decided per statement).
const NAMES_ONLY_LISTING = /(get-childitem|gci|dir|ls)\s+env:[^;\n]{0,2000}?(\)\s*\.(count|name|key)\b|measure-object|-expandproperty\s+(name|key)\b|select-object\s+(-property\s+)?(name|key)\b)/i;
const SECRET_IN_TEXT = /(KEY|SECRET|PASSWORD|TOKEN|DB_URL|DATABASE_URL|DSN)/i;

function withoutPresenceChecks(segment) {
  return PRESENCE_ONLY.reduce((text, pattern) => text.replace(pattern, " "), segment);
}

function tokens(text) {
  return text.match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

// The files a copy or move reads: its sources, not its destination.
function copySources(segment, word) {
  const args = tokens(segment.replace(EXCLUDE_OPTION, " ")).slice(1);
  const named = [];
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (/^-(destination|dest)$/i.test(arg)) { i++; continue; }
    if (/^-(literal)?path$/i.test(arg)) { if (args[i + 1]) named.push(args[++i]); continue; }
    if (/^-/.test(arg) || (/^\/\w+(:.*)?$/i.test(arg) && ["robocopy", "xcopy", "copy"].includes(word))) continue;
    positional.push(arg);
  }
  if (word === "robocopy") positional.splice(1, 1);
  else if (!named.length && positional.length >= 2) positional.pop();
  else if (named.length) positional.length = 0;
  return " " + [...named, ...positional].join(" ");
}

function readsFile(seg, ctx, mentionsFile) {
  const { word, piped } = ctx;
  if (COPIERS.has(word)) {
    if (mentionsFile(copySources(seg, word))) return true;
  } else if (FILTERS.has(word)) {
    const hasPath = /\s-(literal)?path\b/i.test(seg);
    if ((!piped || hasPath) && mentionsFile(seg.replace(PATTERN_OPTION, " "))) return true;
  } else if (READERS.has(word) && mentionsFile(seg)) {
    return true;
  }
  for (const m of seg.matchAll(/(?:\$?\(|\{)\s*([\w-]+)/g)) {
    if (READERS.has(m[1].toLowerCase()) && !COPIERS.has(m[1].toLowerCase()) && mentionsFile(seg)) return true;
  }
  if (/\[(system\.)?io\.file\]::(readall|open|copy)/i.test(seg) && mentionsFile(seg)) return true;
  if (word === "git" && /\bgit\s+(show|diff|log|blame|cat-file|grep)\b/i.test(seg) && mentionsFile(seg)) return true;
  // code that reads the file and prints
  const opens = /(\bopen\s*\(|readFileSync|readFile\s*\(|read_text\s*\(|dotenv_values\s*\((?![^)]{0,200}\)\s*\.\s*keys))/.test(seg);
  const prints = /(print\s*\((?!\s*(len|bool)\s*\()|console\.\w+\s*\((?!\s*Boolean\s*\()|process\.stdout|sys\.stdout|\bnode(\.exe)?\s+(-p|--print)\b)/.test(seg);
  return opens && prints && mentionsFile(seg);
}

function variableNames(seg) {
  const names = [];
  for (const m of seg.matchAll(/\$\{?env:([A-Za-z_]\w*)\}?/gi)) names.push(m[1]);
  for (const m of seg.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g)) names.push(m[1]);
  for (const m of seg.matchAll(/%([A-Za-z_]\w*)%/g)) names.push(m[1]);
  for (const m of seg.matchAll(/\[(?:system\.)?environment\]::getenvironmentvariable\s*\(\s*['"]([^'"]+)['"]/gi)) names.push(m[1]);
  return names;
}

const isSecretName = (name) => SECRET_NAME.test(name) && !/^NEXT_PUBLIC_/i.test(name);

const SHELL_RULES = [
  ["reading an .env file", (seg, ctx) => readsFile(seg, ctx, mentionsEnvFile)],
  ["reading a credentials file", (seg, ctx) => readsFile(seg, ctx, mentionsCredentialFile)],
  ["dumping the environment", (seg, { word, namesOnly, cmd }) =>
    word === "printenv" ||
    (word === "env" && /^env\s*$/i.test(seg)) ||
    (word === "set" && /^set\s*$/i.test(seg)) ||
    (cmd && word === "set" && /^set(\s+[^\s=]+)?\s*$/i.test(seg)) ||
    (word === "export" && /^export\s+-p\b/i.test(seg)) ||
    (!namesOnly && /\b(get-childitem|gci|dir|ls|get-item|gi)\s+(-(literal)?path\s+)?["']?env:\\?\*?["']?\s*\)?\s*$/i.test(seg)) ||
    (!namesOnly && /\b(get-childitem|gci|dir|ls|get-item|gi)\s+(-(literal)?path\s+)?["']?env:\\?[^\s'"|)]*\*/i.test(seg)) ||
    /env:\\?\s*\)\s*\.\s*value\b/i.test(seg) ||
    /\[(system\.)?environment\]::getenvironmentvariables\s*\([^)]{0,200}\)(?!\s*\.\s*keys\b)/i.test(seg) ||
    /\bcmd(\.exe)?\s+\/c\s+set\s*("|'|$)/i.test(seg)],
  ["printing a credential variable", (raw, { word }) => {
    const seg = withoutPresenceChecks(raw);
    const item = seg.match(/\b(get-item|gi|get-childitem|gci|dir|ls|get-content|gc)\s+(-(literal)?path\s+)?["']?env:\\?(\w+)/i);
    if (item && isSecretName(item[4])) return true;
    if (!variableNames(seg).some(isSecretName)) return false;
    if (PRINTERS.has(word)) return true;
    return /^["'(\s]*(\$\{?env:\w+\}?|\$\{?[A-Z_][A-Z0-9_]*\}?|%\w+%|\[(system\.)?environment\]::getenvironmentvariable\s*\([^)]{0,200}\))["')\s]*$/i.test(seg);
  }],
  ["code that prints the environment", (raw) => {
    const seg = withoutPresenceChecks(raw);
    if (/\bnode(\.exe)?\s+(-p|--print)\b/i.test(seg)) {
      if (/process\.env\b(?!\s*(\.|\[))/.test(seg) && !/Object\.keys\s*\(\s*process\.env\s*\)/.test(seg)) return true;
      for (const m of seg.matchAll(/process\.env(?:\.([A-Za-z_]\w*)|\[\s*['"]([^'"]+)['"]\s*\])/g)) {
        if (isSecretName(m[1] || m[2])) return true;
      }
    }
    return /print\s*\(\s*(dict\s*\(\s*)?os\.environ\b(?!\s*\.\s*keys)/.test(seg) ||
      /os\.environ\.items\s*\(\s*\)/.test(seg) ||
      new RegExp(String.raw`print\s*\([^\n]{0,500}?os\.(getenv|environ\.get)\s*\(\s*['"][^'"]{0,200}${SECRET_IN_TEXT.source}`, "i").test(seg) ||
      new RegExp(String.raw`print\s*\([^\n]{0,500}?os\.environ\s*\[\s*['"][^'"]{0,200}${SECRET_IN_TEXT.source}`, "i").test(seg) ||
      /print\s*\(\s*dotenv_values\s*\((?![^)]{0,200}\)\s*\.keys)/.test(seg) ||
      /console\.(log|info|error|dir|table)\s*\(\s*process\.env\s*[,)]/.test(seg) ||
      new RegExp(String.raw`console\.(log|info|error|dir)\s*\([^)]{0,500}process\.env\.[A-Z0-9_]{0,200}${SECRET_IN_TEXT.source}`, "i").test(seg) ||
      /JSON\.stringify\s*\(\s*process\.env\s*[,)]/.test(seg);
  }],
  ["a command that reveals credentials", (seg) =>
    /\bgh\s+auth\s+token\b/i.test(seg) ||
    /\bgh\s+auth\s+status\b[^\n]{0,500}(\s-t\b|--show-token)/i.test(seg) ||
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

// The command text a nested shell runs: cmd /c ..., powershell -Command ..., bash -c ...
function nestedCommands(text) {
  const found = [];
  const nested = /\b(cmd(?:\.exe)?\s+\/[ck]|(?:pwsh|powershell)(?:\.exe)?(?:\s+-(?!c\b|command\b)\w+)*\s+-(?:c|command)|(?:bash|sh|zsh)(?:\.exe)?\s+-c)\s+("([^"]*)"|'([^']*)'|([^\n]*))/gi;
  for (const m of text.matchAll(nested)) {
    found.push({ text: m[3] ?? m[4] ?? m[5] ?? "", cmd: /^cmd/i.test(m[1]) });
  }
  return found;
}

export function checkShell(command, depth = 0, cmd = false) {
  const text = String(command ?? "");
  for (const statement of text.split(/\|\||&&|[;&\n]/)) {
    const namesOnly = NAMES_ONLY_LISTING.test(statement) && !/\bvalue\b/i.test(statement);
    const parts = statement.split("|");
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i].trim();
      if (!seg) continue;
      const ctx = { word: firstWord(seg), namesOnly, piped: i > 0, cmd };
      for (const [rule, test] of SHELL_RULES) {
        if (test(seg, ctx)) return rule;
      }
    }
  }
  if (depth < 3) {
    for (const inner of nestedCommands(text)) {
      const rule = checkShell(inner.text, depth + 1, inner.cmd);
      if (rule) return rule;
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
  return nativePath(input?.path ?? input?.file_path ?? input?.target_file ?? input?.target_directory ?? "");
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

function parsedInput(input) {
  if (typeof input !== "string") return input ?? {};
  try {
    return JSON.parse(input) ?? {};
  } catch {
    return {};
  }
}

export function checkTool(toolName, rawInput, root = process.cwd()) {
  const tool = String(toolName || "");
  const input = parsedInput(rawInput);
  if (tool.startsWith("MCP:")) return checkUrl(input?.url);
  if (tool === "Read" && sensitivePath(toolPath(input))) return "reading a credentials file";
  if (tool === "Grep") {
    const mode = String(input?.output_mode ?? "content");
    const glob = String(input?.glob ?? "");
    const target = toolPath(input);
    if (mode !== "content") return null;
    if (sensitivePath(target) || /(^|[\\/*{,])\.env(\b|\*|$)/i.test(glob) || sensitivePath(glob)) {
      return "searching inside an .env file";
    }
    const narrowed = (input?.type || /\*\.[\w{},]+$/.test(glob)) && !/env|pem|netrc|pgpass|credentials/i.test(glob);
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

// KEY=value lines; a quoted value may run over several lines (a private key, for example).
export function parseEnvFile(path) {
  const values = {};
  let text;
  try {
    text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return values;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    const quote = value[0];
    if ((quote === '"' || quote === "'") && !(value.length > 1 && value.endsWith(quote))) {
      const rest = [value.slice(1)];
      while (i + 1 < lines.length) {
        const next = lines[++i];
        if (next.trimEnd().endsWith(quote)) { rest.push(next.trimEnd().slice(0, -1)); break; }
        rest.push(next);
      }
      value = rest.join("\n");
    } else {
      value = value.replace(/^(['"])(.*)\1$/, "$2");
    }
    values[m[1]] = value;
  }
  return values;
}

function localHost(hostname) {
  return /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(hostname);
}

function secretParts(name, value) {
  const parts = [];
  if (!value || value.length < MIN_SECRET_LENGTH) return parts;
  const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  if (SECRET_NAME.test(name)) parts.push(value);
  if (isUrl) {
    try {
      const url = new URL(value);
      if (url.password && !localHost(url.hostname)) {
        parts.push(value, url.password, decodeURIComponent(url.password));
      }
    } catch {
      // not a parseable URL: the whole value is kept above when its name is secret
    }
  }
  return parts.filter((p) => p && p.length >= MIN_SECRET_LENGTH);
}

export function knownSecrets(root = process.cwd(), env = process.env) {
  const found = new Map(); // value -> setting name
  const add = (name, value) => {
    if (/^NEXT_PUBLIC_/i.test(name)) return; // public by design
    for (const part of secretParts(name, String(value ?? ""))) if (!found.has(part)) found.set(part, name);
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
  const haystack = typeof text === "string" ? text : JSON.stringify(text ?? "");
  if (!haystack) return names;
  for (const [value, name] of secrets) if (haystack.includes(value)) names.add(name);
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
      if (sensitivePath(nativePath(event.file_path))) return { permission: "deny", user_message: denied("reading a credentials file").user_message };
      const leaks = leakedNames(event.content, knownSecrets(root, env));
      if (leaks.size) return { permission: "deny", user_message: denied(`a file holding the value of ${[...leaks].sort().join(", ")}`).user_message };
      return { permission: "allow" };
    }
    case "beforeMCPExecution": {
      const rule = checkUrl(parsedInput(event.tool_input)?.url);
      return rule ? denied(rule) : { permission: "allow" };
    }
    case "postToolUse": {
      const leaks = leakedNames(event.tool_output, knownSecrets(root, env));
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
  const root = workspaceRoot(event?.workspace_roots?.[0]);
  process.stdout.write(JSON.stringify(handle(event, root)));
}

const self = (p) => resolve(p).toLowerCase();
if (process.argv[1] && self(fileURLToPath(import.meta.url)) === self(process.argv[1])) {
  main().catch(() => process.exit(1));
}
