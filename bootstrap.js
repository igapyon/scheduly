#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [, , ...args] = process.argv;

const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line || line.startsWith('#')) return;
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return;
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (!key || process.env[key]) return;
      const unquoted = value.replace(/^['\"]|['\"]$/g, '');
      process.env[key] = unquoted;
    });
}

if (!process.env.SCHEDULY_PROJECT_DRIVER) {
  process.env.SCHEDULY_PROJECT_DRIVER = 'local';
}
if (!process.env.SCHEDULY_API_BASE_URL) {
  process.env.SCHEDULY_API_BASE_URL = '';
}

const child = spawn(args[0], args.slice(1), {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
