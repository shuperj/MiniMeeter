> **DOE Framework** — This project is part of the DOE workspace at `D:/dev/`.
> - Domain: `hobby/` | Project: `hobby/projects/mini-voicemeeter/`
> - Shared tools: read `D:/dev/shared/CLAUDE.md`
> - Domain tools: read `D:/dev/hobby/CLAUDE.md`
> - Env: `D:/dev/.env` (never hardcode credentials)

# MiniMeeter — Lightweight Voicemeeter GUI Wrapper

## Stack
- Tauri 2.x (Rust backend + React/TypeScript frontend)
- Vite + TypeScript frontend
- NSIS installer (Windows, currentUser install mode)
- GitHub releases: `shuperj/MiniMeeter`

## Release Policy
- **Minor fixes**: bump to a new version (e.g. v1.0.2 → v1.0.3) and create a new GitHub release — do NOT replace assets on the existing release
- **Version** is set in `app/src-tauri/tauri.conf.json` and `app/src-tauri/Cargo.toml`
- Build: `cd app && npx tauri build` → installer at `app/src-tauri/target/release/bundle/nsis/`
- Upload: `gh release create vX.X.X <installer> --title "MiniMeeter vX.X.X" --repo shuperj/MiniMeeter`
