'use strict';
/**
 * Crypteon desktop — internal HTTP server.
 *
 * Serves the static SvelteKit build from ./renderer and reverse-proxies
 * provider API calls at /api/_proxy/<id>/* to the real provider host. This is
 * the production-safe equivalent of the Vite dev proxy: the renderer (built
 * with DESKTOP_BUILD=1) sends BYOK requests same-origin to 127.0.0.1, and this
 * server forwards them server-side, so there is NO browser CORS friction.
 *
 * Performance:
 *   - Content-hashed assets under /_app/immutable/ are served `immutable` with
 *     a 1-year max-age, so the renderer never re-fetches a chunk it already has
 *     (instant client-side navigation between tools).
 *   - Other assets get a strong ETag + 304 Not-Modified short-circuit.
 *   - HTML is no-cache (always fresh) but still ETag-revalidated.
 *   - Keep-alive is tuned so Chromium reuses sockets.
 *
 * Zero third-party dependencies — Node core only.
 */
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8'
};

// Mirror of app/vite.config.ts server.proxy targets. Keep in sync.
const PROXY_TARGETS = {
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  groq: 'https://api.groq.com',
  together: 'https://api.together.xyz',
  fireworks: 'https://api.fireworks.ai',
  deepinfra: 'https://api.deepinfra.com',
  cerebras: 'https://api.cerebras.ai',
  deepseek: 'https://api.deepseek.com',
  sambanova: 'https://api.sambanova.ai',
  nvidia: 'https://integrate.api.nvidia.com',
  openrouter: 'https://openrouter.ai',
  anthropic: 'https://api.anthropic.com',
  // Local model servers — forwarded as-is to the user's machine.
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
  vllm: 'http://localhost:8000',
  llamacpp: 'http://localhost:8080'
};

const PROXY_PREFIX = '/api/_proxy/';

// Tiny in-memory cache of file metadata + content. The renderer is small and
// read many times, so caching avoids repeated disk reads + ETag hashing and
// makes navigation feel instant. Keyed by absolute file path.
const fileCache = new Map();

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body) res.end(body);
  else res.end();
}

/** Reverse-proxy a request to the matching provider host. */
function handleProxy(req, res) {
  const after = req.url.slice(PROXY_PREFIX.length);
  const slash = after.indexOf('/');
  const id = slash === -1 ? after : after.slice(0, slash);
  const rest = slash === -1 ? '' : after.slice(slash);
  const target = PROXY_TARGETS[id];
  if (!target) {
    return send(res, 404, { 'content-type': 'application/json' },
      JSON.stringify({ error: `Unknown proxy target '${id}'` }));
  }

  const targetUrl = new URL(rest || '/', target);
  const client = targetUrl.protocol === 'https:' ? https : http;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  delete headers.connection;
  delete headers['content-length'];
  delete headers['accept-encoding']; // let us stream upstream bytes 1:1
  headers.host = targetUrl.host;

  const upstream = client.request(
    targetUrl,
    { method: req.method, headers },
    (up) => {
      const outHeaders = { ...up.headers };
      outHeaders['access-control-allow-origin'] = '*';
      res.writeHead(up.statusCode || 502, outHeaders);
      up.pipe(res);
    }
  );
  upstream.on('error', (err) => {
    send(res, 502, { 'content-type': 'application/json' },
      JSON.stringify({ error: `Proxy to ${id} failed: ${err.message}` }));
  });
  req.pipe(upstream);
}

function loadFile(filePath) {
  const stat = fs.statSync(filePath); // throws if missing
  const key = filePath;
  const cached = fileCache.get(key);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached;
  }
  const data = fs.readFileSync(filePath);
  const etag = '"' + crypto.createHash('sha1').update(data).digest('base64').slice(0, 27) + '"';
  const entry = { data, etag, mtimeMs: stat.mtimeMs, size: stat.size };
  fileCache.set(key, entry);
  return entry;
}

function cacheControlFor(reqPath, ext) {
  // Content-hashed bundles never change for a given URL → cache hard.
  if (reqPath.includes('/_app/immutable/')) return 'public, max-age=31536000, immutable';
  if (ext === '.html') return 'no-cache';
  return 'public, max-age=3600';
}

/** Serve a static file from the renderer dir, with SPA fallback + caching. */
function handleStatic(req, res, rendererDir) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch {
    pathname = req.url.split('?')[0];
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(rendererDir, safe);

  const serve = (fp, fallbackAllowed) => {
    let entry;
    try {
      const st = fs.statSync(fp);
      if (st.isDirectory()) fp = path.join(fp, 'index.html');
      entry = loadFile(fp);
    } catch {
      if (fallbackAllowed) {
        const ext = path.extname(fp);
        if (!ext || ext === '.html') {
          try {
            const idx = loadFile(path.join(rendererDir, 'index.html'));
            if (req.headers['if-none-match'] === idx.etag) return send(res, 304, {});
            return send(res, 200, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-cache',
              etag: idx.etag
            }, idx.data);
          } catch { /* fallthrough */ }
        }
      }
      return send(res, 404, { 'content-type': 'text/plain' }, 'Not found');
    }
    const ext = path.extname(fp).toLowerCase();
    // ETag revalidation short-circuit.
    if (req.headers['if-none-match'] === entry.etag) {
      return send(res, 304, { 'cache-control': cacheControlFor(pathname, ext) });
    }
    send(res, 200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': cacheControlFor(pathname, ext),
      etag: entry.etag
    }, entry.data);
  };

  serve(filePath, true);
}

/**
 * Start the internal server on a random free port bound to loopback only.
 * @param {string} rendererDir absolute path to the built static site
 * @returns {Promise<{port:number, server:http.Server, close:()=>void}>}
 */
function startServer(rendererDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        return send(res, 200, { 'content-type': 'text/plain' }, 'ok');
      }
      if (req.url.startsWith(PROXY_PREFIX)) {
        return handleProxy(req, res);
      }
      handleStatic(req, res, rendererDir);
    });
    // Reuse sockets for snappy navigation.
    server.keepAliveTimeout = 30000;
    server.headersTimeout = 35000;
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ port, server, close: () => server.close() });
    });
  });
}

module.exports = { startServer, PROXY_TARGETS };
