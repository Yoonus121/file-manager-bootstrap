# Plan — File Management App

Status: **feature-complete, extended, and restyled with Bootstrap 5.** All three pages share one navy-and-gold design. The next phase is hardening (upload limits) and consolidating the duplicated CSS.

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

- **Automatic JWT expiry cleanup** — client-side decode of `exp` (base64url-safe, wrapped in `try/catch`); on expiry the timer calls `logout()`.
- **Logout** — clears the timer, clears the token from **both** `localStorage` and `sessionStorage`, redirects.
- **Remember me** — a checkbox on the login page. Ticked stores the token in `localStorage` (survives closing the browser); unticked uses `sessionStorage`. `upload.html` reads from both.
- **Rejected-token handling** — a 401 from `/api/files` logs the user out instead of crashing the render.
- **Sort** — newest/oldest/A–Z/Z–A, client-side only, no re-fetch (`allfiles` + `renderFileList`).
- **Search by filename** — live filter (`input` event), composes with sort.
- **Confirm-before-delete** — `confirm()` guard before the delete request.
- **Loading spinner** — Bootstrap `spinner-border`, shown/hidden around fetch calls via `try/finally`.
- **File deletion** — `DELETE /api/files/:id`, ownership-checked, removes both the DB row and the disk file.
- **File rename** — `PATCH /api/files/:id`, ownership-checked, updates `original_name` only (disk file untouched).
- **File download** — `GET /api/files/:id/download`, ownership-checked, `res.download()` server-side; blob + temporary-link pattern client-side. The button passes only the file id; the name is looked up from `allfiles`. A failed download shows an error instead of saving a broken file.
- **Input validation** — client-side (fast feedback) and server-side (the actual enforced boundary) on register/login: empty-field checks, basic email format, password minimum length.
- **Rate limiting** — `express-rate-limit`, separately tuned for `/api/register` (3/hour) and `/api/login` (5/15min).
- **Multiple file upload** — `upload.array('files', 10)`, `req.files` loop on insert; client `<input multiple>`, loops the full `FileList` into `FormData` under the same field name. The input is reset after each upload so the same file can be chosen again.

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

## ✅ Completed — Cleanup and server work

- **Code cleanup** — all four core files (`register.html`, `login.html`, `upload.html`, server file) reviewed and tidied: consistent naming (`handleRegisterSubmit`, `handleLoginSubmit`, `handleUpload`, `loadfilelist`, `renderFileList`), consistent `response`/`data` naming across every fetch call, grouped middleware, fixed a real status-code bug (`/api/login`'s "user not exist" now correctly returns `404` instead of a silent `200`), complete error logging in every route's `catch` block.
- **Server file renamed** — `server.js` → `index.js`.
- **`README.md` added** — setup and run instructions for a fresh clone.

## ✅ Completed — Bootstrap 5 redesign

The earlier hand-written "ledger" theme (parchment, serif titles, corner tabs) was replaced by a Bootstrap 5 design built from mockup images, one step at a time.

- **Setup** — Bootstrap 5.3.3 + Bootstrap Icons 1.11.3 from a CDN, loaded before each page's own CSS. Google Fonts removed; the system font stack is used. Colors live in `:root` variables.
- **Register page** — navy top bar with a Login link, two-column layout (hero illustration + "Organize Your Files Easily & Securely" on the left, white "Create Account" card on the right), icon-prefixed inputs, orange Register button. Layout fills the whole screen (no blank margin around it).
- **Login page** — same shell, "Welcome Back!" hero, "Login" card with a lock icon, email and password fields, Remember me checkbox, orange Login button. The "Forgot password?" link from the mockup was deliberately left out.
- **Upload page** — top bar with avatar + Logout, navy sidebar (hero image, heading, "Upload" nav item), cream main card with a gold-icon header, dashed drop zone with an Add File button, and a white card with search box (icon), sort dropdown, alert, spinner and table. The mockup's eye/preview button was left out (no backend route for it); Delete is kept as a small red trash button.
- **File table** — colored icon per file type (`getFileIcon`), muted size/date columns, Rename / Download / Delete buttons, "No files found" empty state, `table-responsive` wrapper.
- **Feedback UI** — errors and results show in Bootstrap alerts (`alert-danger` / `alert-success`) through a `showMessage()` helper that auto-hides after 4 seconds. A global `unhandledrejection` handler shows "Could not reach the server" for any failed network call.
- **Security fix** — file names are HTML-escaped (`escapeHtml`) before going into `innerHTML`, and the Download button no longer passes the name through an inline `onclick`. Messages from the server are written with `textContent`.

---

## 🔜 Next up

1. **Upload size/type limits** — `multer`'s `limits` option and a `fileFilter` function; currently nothing stops an arbitrarily large or arbitrary-type file from being uploaded. Smallest remaining security-adjacent gap.
2. **CSS consolidation** — move the shared styles (`:root` colors, top bar, buttons, inputs, alert, hero panel, icon circles) into one `styles.css`, linked from all three pages. The same rules are currently copied into each HTML file.
3. **Small leftovers on `upload.html`**
   - Change the Actions header from `text-center` to `text-end` so it lines up with the right-aligned buttons.
   - Add `if (!selectedFiles.length) return;` at the top of `handleUpload` to ignore a cancelled file dialog.
   - Add `text-break` to the file-name span so very long names don't push the buttons off the row.
4. **Login cleanup** — when logging in, remove the token from the *other* storage (`sessionStorage` when "remember" is ticked, `localStorage` when it isn't), so an old remembered token can't keep the user logged in.
5. **Drag-and-drop upload** — the dashed box looks like a drop zone but only the button works. `dragenter`/`dragover`/`dragleave`/`drop` handlers feeding the existing multi-file logic, plus a `.drag-over` highlight style.
6. **Phone layout** — hide the sidebar hero image below the `lg` breakpoint (`d-none d-lg-block`) or turn the sidebar into a collapsible menu, so the upload area isn't pushed far down the page.
7. **Accessibility pass** — review `alt` text on the logo/hero images; the Bootstrap alert already uses `role="alert"`, so screen readers announce it.

## Ideas parked for later

- **Password reset / forgot password** — requires an external email-sending service (e.g. Resend, SendGrid, or Nodemailer + SMTP), a secure single-use time-limited token (new DB column or table), and a new client page. Biggest remaining feature, deliberately saved for a focused session. (The "Forgot password?" link is not on the login page until this exists.)
- **File preview** — the redesign mockup had an eye button. Needs a backend route that serves the file inline (correct `Content-Type`, `Content-Disposition: inline`), plus a modal or new tab on the client.
- **Upload progress bar** — needs `XMLHttpRequest` (or similar) instead of `fetch` to get upload progress events.
- **Pagination, folders/organization, sharing between users** — larger features if the app keeps growing.

---

## Habit that carried the whole build

Every session: **start MySQL → start server → start client**, test each layer independently before layering on the next. Use DevTools (Console, Network, Application, Elements) systematically when something breaks, and check the actual response body before assuming which side is at fault. For styling: change **one step at a time** and check the result in the browser before moving to the next.
