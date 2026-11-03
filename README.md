# Networking Tracker

A small app for a 1L law student to track firms, contacts, conversations, follow-ups and recruiting deadlines.

It runs as a **Google Apps Script web app**: data is stored in `tracker.json` in a Google Drive folder, every save is mirrored into a read-only Google Sheet, and only allow-listed Google accounts can open it. The app code is loaded from this repo's `release/` folder through jsDelivr, pinned to the latest commit on `main`.

```
npm install
npm run dev          # local dev at http://localhost:5173 (add #memory to skip the folder picker)
npm run release      # typecheck + dist/index.html (offline single-file build) + release/app.js|css (web app)
```

Commit `release/` after `npm run release`; the web app picks up the new commit within about 5 minutes.

- `src/` — Preact + TypeScript app. `src/gas.ts` is the web-app storage backend; `src/store.ts` also supports a local-folder mode (File System Access API) for the offline build.
- `apps-script/` — server side (`Code.gs`, `index.html`, `appsscript.json`) and a mocked test (`node apps-script/test.cjs`).
- `scripts/firms.mjs` — builds the firm list import file.

No personal data lives in this repo; the tracker data stays in Google Drive.
