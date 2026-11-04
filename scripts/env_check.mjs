#!/usr/bin/env node
// Check settings without showing them (security plan, stage 5).
//
//   node scripts/env_check.mjs NAME [NAME ...]   where each is set, and its length
//   node scripts/env_check.mjs --names [TEXT]    the names defined, optionally containing TEXT
//
// Looks in this process's environment and in the project's env files. Never prints a value: only
// set / not set / empty, the length, and for a web address its scheme, whether it carries a
// password, and whether its host is local.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ENV_FILES = [".env", ".env.local", "apps/backend/.env", "apps/frontend/.env.local"];

export function parseEnvFile(path) {
  const values = {};
  let text;
  try {
    text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return values;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function sources(root, env) {
  const list = [["process environment", env]];
  for (const rel of ENV_FILES) {
    const path = join(root, rel);
    if (existsSync(path)) list.push([rel, parseEnvFile(path)]);
  }
  return list;
}

export function describe(value) {
  if (value === undefined) return "not set";
  if (value === "") return "empty";
  let text = `set (${value.length} characters)`;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
      text += `; ${url.protocol.replace(":", "")} address, ${url.password ? "with" : "no"} password, ` +
        `${local ? "local" : "remote"} host`;
    } catch {
      text += "; looks like an address but does not parse";
    }
  }
  return text;
}

export function report(args, root = process.cwd(), env = process.env) {
  const lines = [];
  const all = sources(root, env);
  if (args[0] === "--names") {
    const filter = (args[1] || "").toLowerCase();
    for (const [where, values] of all) {
      const names = Object.keys(values).filter((n) => n.toLowerCase().includes(filter)).sort();
      if (where === "process environment" && !filter) {
        lines.push(`${where}: ${names.length} names (give a filter to list them)`);
      } else {
        lines.push(`${where}: ${names.length ? names.join(", ") : "none"}`);
      }
    }
    return lines;
  }
  if (!args.length) return ["usage: node scripts/env_check.mjs NAME [NAME ...] | --names [TEXT]"];
  for (const name of args) {
    const found = all.filter(([, values]) => Object.prototype.hasOwnProperty.call(values, name));
    if (!found.length) {
      lines.push(`${name}: not set (looked in the process environment and ${ENV_FILES.join(", ")})`);
      continue;
    }
    for (const [where, values] of found) lines.push(`${name}: ${describe(values[name])} in ${where}`);
  }
  return lines;
}

const self = (p) => resolve(p).toLowerCase();
if (process.argv[1] && self(fileURLToPath(import.meta.url)) === self(process.argv[1])) {
  for (const line of report(process.argv.slice(2))) console.log(line);
}
