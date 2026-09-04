# Plan — File Management App

Status: **feature-complete and substantially extended** beyond the original four-feature scope. Currently entering a cleanup/polish phase before further feature work.

---

## ✅ Completed — Foundation

- Client, server, and MySQL running as separate, understood processes.
- Two-phase server-driven database/table setup (`CREATE DATABASE IF NOT EXISTS` → `CREATE TABLE IF NOT EXISTS`).
- Full client↔server↔database round trip proven before building real features.

## ✅ Completed — Core features

- **Registration** — `users` table, `bcrypt` hashing, parameterized insert, duplicate-email handling.
- **Login** — lookup, `bcrypt.compare`, JWT issuance (1h expiry).
- **`auth_jwt` middleware** — reusable route protection.
- **File upload** — `multer`, safe disk storage, metadata (`user_id`, `filename`, `original_name`, `filepath`, `size`) linked via foreign key.
- **File listing** — filtered per user.

## ✅ Completed — Client pages and flow

- `register.html` → success redirects to `login.html`.
- `login.html` → success stores JWT, redirects to `upload.html`.
- `upload.html` — the main authenticated page: token check + redirect on load, scheduled token cleanup, upload, dynamic file table, logout.

## ✅ Completed — Extended features

- **Automatic JWT expiry cleanup** — client-side decode of `exp`, `setTimeout`/`clearTimeout` pair.
- **Logout** — clears timer, token, redirects.
- **Sort** — newest/oldest/A–Z/Z–A, client-side only, no re-fetch (`allfiles` + `renderFileList`).
- **Search by filename** — live filter (`input` event), composes with sort.
- **Confirm-before-delete** — `confirm()` guard before the delete request.
- **Loading spinner** — shown/hidden around fetch calls via `try/finally`.
- **File deletion** — `DELETE /api/files/:id`, ownership-checked, removes both the DB row and the disk file.
- **File rename** — `PATCH /api/files/:id`, ownership-checked, updates `original_name` only (disk file untouched).
- **File download** — `GET /api/files/:id/download`, ownership-checked, `res.download()` server-side; blob + temporary-link pattern client-side (since a plain `<a href>` can't carry an auth header).
- **Input validation** — client-side (fast feedback) and server-side (the actual enforced boundary) on register/login: empty-field checks, basic email format, password minimum length.
- **Rate limiting** — `express-rate-limit`, separately tuned for `/api/register` (3/hour) and `/api/login` (5/15min).
- **Multiple file upload** — `upload.array('files', 10)`, `req.files` loop on insert; client `<input multiple>`, loops the full `FileList` into `FormData` under the same field name.

---

## Reference: full route list

| Method | Route | Protected | Rate-limited | Purpose |
|---|---|---|---|---|
| POST | `/api/register` | No | Yes | Create a new user |
| POST | `/api/login` | No | Yes | Verify credentials, issue JWT |
| POST | `/api/upload` | Yes | No | Upload one or more files, store metadata |
| GET | `/api/files` | Yes | No | List the logged-in user's files |
| DELETE | `/api/files/:id` | Yes | No | Delete a file (DB row + disk file), ownership-checked |
| PATCH | `/api/files/:id` | Yes | No | Rename a file's display name, ownership-checked |
| GET | `/api/files/:id/download` | Yes | No | Stream a file back for download, ownership-checked |

---

## ✅ Completed — Cleanup and styling

- **Code cleanup** — all four core files (`register.html`, `login.html`, `upload.html`, server file) reviewed and tidied: consistent naming (`handleRegisterSubmit`, `handleLoginSubmit`, `handleUpload`, `loadFileList`, `renderFileList`), consistent `response`/`data` naming across every fetch call, grouped middleware, fixed a real status-code bug (`/api/login`'s "user not exist" now correctly returns `404` instead of a silent `200`), complete error logging in every route's `catch` block.
- **Server file renamed** — `server.js` → `index.js`.
- **Visual design system ("the ledger")** — ink navy shell, parchment card surface, brass accent, Fraunces (serif, titles) + IBM Plex Sans (everything else), a signature rotated-square corner tab on each card, ledger-style table (hairline dividers, right-aligned numeric columns, action buttons turned into inline text links). Applied consistently across all three client pages.
- **Known remaining debt**: shared CSS (shell, header, fonts, inputs) is currently duplicated across three HTML files rather than pulled into a single external stylesheet — acceptable for now, worth consolidating before adding more pages.
- **`README.md` added** — setup and run instructions for a fresh clone.

## 🔜 Next up

1. **Upload size/type limits** — `multer`'s `limits` option and a `fileFilter` function; currently nothing stops an arbitrarily large or arbitrary-type file from being uploaded. Smallest remaining security-adjacent gap.
2. **CSS consolidation** — move shared styles into one `styles.css`, linked from all three pages.
3. **Accessibility pass** — `aria-live="polite"` on the `#response` status message so screen readers announce it; review `alt` text on icons now that they carry real meaning in the styled version.
4. **Drag-and-drop upload** — `dragover`/`drop` handlers feeding the existing multi-file `FormData` logic.

## Ideas parked for later

- **Password reset / forgot password** — requires an external email-sending service (e.g. Resend, SendGrid, or Nodemailer + SMTP), a secure single-use time-limited token (new DB column or table), and a new client page. Biggest remaining feature, deliberately saved for a focused session.
- **File preview, "remember me" / persistent login, pagination, folders/organization, sharing between users** — larger features if the app keeps growing.

---

## Habit that carried the whole build

Every session: **start MySQL → start server → start client**, test each layer independently before layering on the next. Use DevTools (Console, Network, Application, Elements) systematically when something breaks, and check the actual response body before assuming which side is at fault.
