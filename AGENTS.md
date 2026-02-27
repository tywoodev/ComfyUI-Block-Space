# Repository Guidelines

## Project Structure & Module Organization
- `index.html` boots the LiteGraph demo and loads scripts in order.
- `bootstrap.js` handles CDN loading, error reporting, and initialization.
- `smart-drop.js` and `connection-focus.js` are the core UX patches.
- `app.js` registers demo nodes and wires up a sample graph.
- `docs/plans/` holds planning notes and experiments.

## Build, Test, and Development Commands
This repo is a static HTML/JS prototype; there is no build step.
- Run locally by opening `index.html` in a browser.
- If your browser blocks `file://` access, serve the folder:
  - `python -m http.server 8000` then open `http://localhost:8000`.

## Coding Style & Naming Conventions
- JavaScript only, ES5-style with IIFEs and `"use strict"`.
- Indentation: 2 spaces; include semicolons.
- Prefer `var` (existing codebase convention) and double quotes.
- Node types use `demo/...` namespaces; keep new nodes consistent.

## Testing Guidelines
- No automated tests currently.
- Manually verify behavior by opening the demo and checking the console overlay.
- If you add tests, place them in a new `tests/` folder and name files `*.test.js`.

## Commit & Pull Request Guidelines
- Commit messages are short, imperative sentences with periods (see git history).
  - Example: `Add connection focus glow.`
- PRs should include:
  - Summary of changes and rationale.
  - Steps to verify (browser/version, expected behavior).
  - Screenshots or short clips for visual UI changes.

## Configuration & Safety Notes
- External dependencies are loaded from public CDNs in `bootstrap.js`.
- Keep CDN URLs version-pinned and update both fallback sources together.
- For JavaScript-based ComfyUI customizations, always reference `docs/comfyui-dev-doc.md` first for best practices and standard solution patterns before implementing changes.
- If implementation fails multiple times on the same task, pause and clarify user intent, then present workable alternative solution options before continuing.
