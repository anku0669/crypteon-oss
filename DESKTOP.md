# Crypteon Desktop

Crypteon ships as a native desktop app (Electron) for **macOS** (`.dmg`),
**Windows** (`.exe`), and **Linux** (`AppImage` + `.deb`).

The desktop build is more than a website wrapper. The Electron main process runs
a tiny local server that:

1. Serves the compiled SvelteKit app from `127.0.0.1` (no internet needed for the
   tool itself), and
2. **Reverse-proxies your BYOK provider API calls** (`/api/_proxy/<provider>`),
   so the AI modules (Campaign, PromptCraft, Fuzzer, Probe Lab, etc.) work
   **without CORS errors** — exactly like the dev server, unlike the static web
   build where browsers block direct provider calls.

Everything stays local: your API keys live in the app, requests go straight from
your machine to the provider.

---

## macOS — build & install the `.dmg`  (you are here)

**Requirements:** macOS, [Node.js](https://nodejs.org) 20.19+ (or 22.12+), and Xcode
Command Line Tools (`xcode-select --install`).

> Uses electron-builder 26+, which ships a portable `dmgbuild` bundle — so you do
> **not** need a system `python` installed (older electron-builder failed with
> `Command failed: which python` on modern macOS; that's fixed here).

```bash
# from the repo root
cd desktop
npm install
npm run dist:mac
```

When it finishes, your installer is at:

```
dist-desktop/Crypteon-2.6.0-arm64.dmg     # Apple Silicon (M1/M2/M3/M4)
dist-desktop/Crypteon-2.6.0.dmg           # Intel Macs
```

**Install it like any Mac app:**

1. Double-click the `.dmg`.
2. Drag the **Crypteon** icon onto the **Applications** folder.
3. Eject the disk image, open **Applications**, and launch **Crypteon**.

> First launch (unsigned build): macOS Gatekeeper may say *"Crypteon can't be
> opened because it is from an unidentified developer."* Right-click the app →
> **Open** → **Open**, or go to **System Settings → Privacy & Security → Open
> Anyway**. This is only needed once. (To remove the warning entirely, sign the
> app with an Apple Developer ID — see "Code signing" below.)

Prefer one command from the repo root? `make dmg` does the same thing.

---

## Run it without packaging (fastest way to try it)

```bash
cd desktop
npm install
npm start          # builds the renderer + launches the app window
```

---

## Windows — build the `.exe`

Run on a Windows machine with Node.js installed:

```bash
cd desktop
npm install
npm run dist:win
```

Output: `dist-desktop/Crypteon Setup 2.6.0.exe` (NSIS installer — lets the user
pick the install folder and creates Start-menu + desktop shortcuts).

## Linux — build AppImage / `.deb`

```bash
cd desktop
npm install
npm run dist:linux
```

Output: `dist-desktop/Crypteon-2.6.0.AppImage` and `crypteon_2.6.0_amd64.deb`.

---

## Why can't the `.dmg` be built on Linux / in CI by default?

A macOS `.dmg` can **only** be produced on macOS (it needs Apple's `hdiutil`).
Likewise a fully native build of each platform is best done on that platform.
electron-builder *can* cross-build some targets, but `.dmg` is the firm
exception — so build the Mac installer on your Mac. Windows `.exe` and Linux
targets can be built on Linux too.

To build **all three** where supported:

```bash
make desktop-all      # or: cd desktop && npm run dist:all
```

---

## Code signing (optional, removes the Gatekeeper warning)

If you have an Apple Developer ID, set these before `npm run dist:mac`:

```bash
export CSC_LINK=/path/to/DeveloperIDApplication.p12
export CSC_KEY_PASSWORD=your-cert-password
# notarization (optional):
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
```

electron-builder will sign (and notarize, if the Apple vars are set)
automatically.

---

## Layout

```
desktop/
├── package.json                 electron + electron-builder config (mac/win/linux targets)
├── scripts/build-renderer.mjs   builds the SvelteKit app with DESKTOP_BUILD=1, copies to renderer/
├── src/
│   ├── main.js                  Electron main: boots server, window, menu
│   ├── server.js                local static server + BYOK provider proxy (no CORS)
│   └── preload.js               isolated bridge (exposes window.crypteonDesktop)
├── build/                       app icons (icon.icns / icon.ico / icon.png)
├── renderer/                    generated — the built web app (gitignored)
└── ../dist-desktop/             generated — the installers land here (gitignored)
```

## Using the AI modules

The transform tools (Transform, Decode, Emoji, ciphers, encoders) work fully
offline — no key needed. The red-team / AI modules are **BYOK**: open
**Settings**, add a provider key (OpenAI, Anthropic, OpenRouter, Groq, Together,
Fireworks, DeepInfra, Cerebras, DeepSeek, SambaNova, NVIDIA, or any
OpenAI-compatible / local endpoint like Ollama or LM Studio), and the modules
activate. In the desktop app these calls are proxied locally, so they just work.
