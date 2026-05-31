#!/usr/bin/env node
'use strict';
/**
 * Build the SvelteKit renderer for the desktop app and copy it into
 * desktop/renderer/.
 *
 * Key difference from the web build: DESKTOP_BUILD=1 flips the
 * __CRYPTEON_DESKTOP__ compile-time flag (app/vite.config.ts) so provider
 * requests route through the Electron main process's local proxy — making
 * BYOK AI features work without CORS. BASE_PATH is forced empty so assets
 * resolve from the local server root.
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, '..');
const repoRoot = resolve(desktopDir, '..');
const appDir = join(repoRoot, 'app');
const buildDir = join(appDir, 'build');
const rendererDir = join(desktopDir, 'renderer');

const env = { ...process.env, DESKTOP_BUILD: '1', BASE_PATH: '' };

function run(cmd, cwd) {
  console.log(`\n[build-renderer] $ ${cmd}  (cwd=${cwd})`);
  execSync(cmd, { cwd, env, stdio: 'inherit' });
}

// 1. Install deps if needed.
if (!existsSync(join(appDir, 'node_modules'))) {
  run('npm ci --no-audit --no-fund', appDir);
}

// 2. Build the static bundle with the desktop proxy flag on.
run('npm run build', appDir);

if (!existsSync(buildDir)) {
  throw new Error(`[build-renderer] expected build output at ${buildDir}`);
}

// 3. Refresh desktop/renderer with the new build.
if (existsSync(rendererDir)) rmSync(rendererDir, { recursive: true, force: true });
mkdirSync(rendererDir, { recursive: true });
cpSync(buildDir, rendererDir, { recursive: true });

console.log(`\n[build-renderer] OK -> ${rendererDir}`);
