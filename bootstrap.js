#!/usr/bin/env node
const { spawn } = require('node:child_process');
const [,, ...args] = process.argv;

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
