# Networking Tracker — developer notes

Vite + TypeScript + Preact, built into one self-contained `dist/index.html` (vite-plugin-singlefile). No server. Chrome opens it from `file://` and saves via the File System Access API.

```
npm install
npm run dev        # http://localhost:5173 (use #memory to skip the folder picker)
npm run typecheck
npm run build      # → dist/index.html, copy into her Drive folder
```

## Layout
- `src/types.ts`: data model (Firm → Person → Interaction, plus Task, Deadline, Template, Question, Settings).
- `src/logic.ts`: derived person status, reminders (thank-you / check-in / no-reply), dashboard metrics, firm stats. Nothing derived is stored.
- `src/store.ts`: state, mutations, persistence. The folder handle is kept in IndexedDB. Writes are debounced 600 ms. Backups go to `backups/` every 30 min (10 kept).
- `src/io.ts`: xlsx/CSV/ICS/vCard export; xlsx/CSV/LinkedIn import (SheetJS).
- `src/compose.ts`: template rendering and the Gmail compose URL.
- `src/seed.ts`: default templates, question bank, settings.
- `scripts/convert.mjs`: the one-time conversion of her original workbook (explicit, hand-checked mapping). Regenerate with
  `npx esbuild src/seed.ts --format=esm --outfile=scripts/seed-build.mjs && node scripts/convert.mjs out/tracker.json`.

## Status rules
No interactions → Prospect. Email/text out → Outreach sent (→ No response after `noReplyDays`, default 14). Email in → Scheduling. Any conversation type → Spoke. Thank-you after → Thanked. Check-in after Thanked/Spoke → Keep warm. Dormant is manual only. Setting status by hand sticks until the next logged interaction.

## Known limits
- Chrome/Edge/Arc only for saving. Other browsers fall back to an in-memory session with JSON download.
- Not tested here: Chrome remembering the folder across browser restarts. Headless Chromium crashes when it reads a stored handle back from IndexedDB, even though that's the standard pattern. Check it during setup: quit Chrome, reopen, and the app should either open directly or show "Welcome back → Continue".
- One editor at a time. Two Macs editing at once produce Drive conflict copies (no merge).
