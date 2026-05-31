'use strict';
/**
 * Crypteon desktop — preload.
 *
 * Runs in an isolated context. Exposes a minimal, read-only surface to the
 * renderer and tags <html> with desktop/platform classes so the app can apply
 * native-feeling polish (draggable title bar, traffic-light spacing, fonts)
 * without affecting the web/Docker build.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('crypteonDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});

function tagPlatform() {
  try {
    const el = document.documentElement;
    el.classList.add('is-desktop', 'platform-' + process.platform);
  } catch {
    /* DOM not ready / unavailable — ignore */
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tagPlatform, { once: true });
} else {
  tagPlatform();
}
