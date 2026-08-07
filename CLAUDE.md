**Workspace:** D:/dev (see ~/.devstack/config)
**Shared tooling:** check `D:/dev/scripts/INDEX.md` before building something new

# mini-voicemeeter (MiniMeeter)

## Purpose
A lightweight, resizable desktop audio mixer for Voicemeeter Banana on Windows. Provides live faders, per-channel mute, A1 output switching, and animated backgrounds in a compact window small enough to sit alongside Plexamp or Spotify.

## Stack
- Tauri desktop app (Rust backend + web frontend) — source under `app/`
- Node.js 20+ for the frontend build; Rust (stable, MSVC) for the native binary
- Windows-only (uses Voicemeeter Remote API + Windows acrylic glass)

## Commands
```bash
cd app
npm install
npx tauri build   # compiled binary -> app/src-tauri/target/release/minimeeter.exe
```
(No dev/test scripts documented in the README; check `app/package.json` for any dev command.)

## Integrations
- Voicemeeter Banana (must be installed) — polls hardware at ~30fps via its Remote API
- Windows 10/11 system accent color for acrylic transparency

## Scope Notes
- GPL-3.0 licensed. Releases distributed as a Windows `.exe`.
- Repo root contains a `log.txt` and a screenshot; the actual app lives in `app/`.
