# Summary — File Manager (full-stack project)

A consolidated snapshot of the whole build: architecture, features, tech stack, and how the pieces fit together.

---

## What it is

A multi-user file management web app. Users register, log in, and upload/list/search/sort/rename/delete/download their own files — with every file scoped strictly to its owner. Built entirely from first principles: client, server, and database as three genuinely separate processes, wired together deliberately rather than via a framework that hides the seams. The client was later restyled with Bootstrap 5 to match designed mockups.

---

## Architecture

```
Client (HTML/CSS/JS)  --HTTP-->  Server (Node.js/Express)  --SQL-->  Database (MySQL)
       <--JSON-response--                <--rows--
```

- **Client**: three pages — `register.html`, `login.html`, `upload.html` — vanilla JS, styled with Bootstrap 5, no JS framework.
- **Server**: `index.js`, Express, one file, all routes.
- **Database**: MySQL, two tables (`user`, `files`), created and migrated by the server itself on startup.

---

## Full feature list

**Auth**
- Registration with `bcrypt` password hashing, duplicate-email handling, client + server input validation.
- Login with credential verification and JWT issuance (1-hour expiry).
- **Remember me** checkbox: token stored in `localStorage` when ticked (survives closing the browser), `sessionStorage` when not.
- Reusable `auth_jwt` middleware protecting every file route.
- Client-side token lifecycle: decoded (base64url-safe) to schedule automatic logout at expiry via `setTimeout`, cleared from both storages on logout, and a 401 from the server also logs the user out.
- Rate limiting on both register (3/hour/IP) and login (5/15min/IP) via `express-rate-limit`.

**Files**
- Upload — single or multiple files at once, `multer` with safe disk-generated filenames, original name preserved separately for display.
- List — filtered per user, sortable (newest/oldest/A–Z/Z–A) and searchable by filename, entirely client-side against one fetched dataset (no re-fetch on sort/search). Shows a "No files found" row when empty.
- Rename — updates display name only, ownership-checked.
- Delete — removes both the database row and the physical file, ownership-checked, confirmed via `confirm()` before sending.
- Download — streamed from the server via `res.download()`, retrieved client-side via a blob + temporary-link pattern (since authenticated downloads can't use a plain link). The button passes only the file id.

**UX polish**
- Bootstrap spinner around every fetch.
- Success/error messages in Bootstrap alerts (green/red) that auto-hide after 4 seconds; a global handler reports an unreachable server.
- Colored file-type icons in the table (PDF, image, document, spreadsheet, archive, video, audio).
- File names are HTML-escaped before display, so a malicious file name can't run code on the page.
- Full page-to-page flow: register → login → upload, logout closing the loop.
- Responsive layout: columns stack on phones, the table scrolls sideways instead of breaking.

---

## Visual design (Bootstrap 5)

Built from mockup images, step by step, across all three pages.

- **Setup**: Bootstrap 5.3.3 and Bootstrap Icons 1.11.3 from a CDN; system font stack; colors as `:root` variables.
- **Palette**: dark navy page and top bar, navy gradient hero/sidebar panels, light blue-grey form panel, white cards, **gold/orange** accent for primary actions, red for delete.
- **Register & Login**: navy top bar, two-column layout (illustration and tagline on the left, white form card with icon-prefixed inputs on the right), full-screen with no blank margins.
- **Upload**: top bar with avatar and Logout, navy sidebar with hero image and "Upload" nav item, cream main card with a gold-icon header, dashed drop zone with the Add File button, and a white card holding search + sort, alert, spinner and the file table.
- **Table**: grey-blue rounded header bar, file-type icons, muted size/date columns, Rename (white), Download (gold) and Delete (small red trash) buttons.
- **Left out on purpose**: "Forgot password?" on the login page (no backend for it) and the eye/preview button in the table (no preview route).

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (ES6+, async/await), Bootstrap 5.3.3, Bootstrap Icons 1.11.3 (CDN) |
| Backend | Node.js, Express.js |
| Database | MySQL (`mysql2/promise`) |
| Auth | JWT (`jsonwebtoken`), `bcrypt` |
| File handling | `multer`, Node `fs/promises` |
| Security | `cors`, `express-rate-limit`, parameterized queries, HTML escaping on the client |
| Config | `dotenv` |
| Dev tooling | `nodemon`, Live Server, MySQL Workbench |

---

## Reference: full route list

| Method | Route | Protected | Rate-limited | Purpose |
|---|---|---|---|---|
| POST | `/api/register` | No | Yes | Create a new user |
| POST | `/api/login` | No | Yes | Verify credentials, issue JWT |
| POST | `/api/upload` | Yes | No | Upload one or more files, store metadata |
| GET | `/api/files` | Yes | No | List the logged-in user's files |
| DELETE | `/api/files/:id` | Yes | No | Delete a file, ownership-checked |
| PATCH | `/api/files/:id` | Yes | No | Rename a file's display name, ownership-checked |
| GET | `/api/files/:id/download` | Yes | No | Stream a file back for download, ownership-checked |

---

## Database schema

**user** — `id`, `fname`, `email` (unique), `hashed_pass`, `created_at`
**files** — `id`, `user_id` (FK → `user.id`), `filename` (disk-safe), `original_name` (display), `filepath`, `size`, `uploaded_at`

---

## What's next (see `plan.md` for full detail)

Upload size/type limits on the server, consolidating the duplicated CSS into one shared `styles.css`, a few small leftovers on the upload page (Actions header alignment, empty-selection guard, long file names), drag-and-drop upload, a better phone layout for the sidebar, and — as the largest remaining feature — password reset via an external email service.

---

## The single habit that carried the whole build

Every session: **start MySQL → start server → start client**, test each layer independently before layering on the next, and use browser DevTools (Console, Network, Application, Elements) systematically whenever something breaks — checking the actual response body before assuming which side is at fault. For the redesign: one small step at a time, check it in the browser, then move on.
