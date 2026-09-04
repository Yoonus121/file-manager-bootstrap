# Summary — File Manager (full-stack project)

A consolidated snapshot of the whole build: architecture, features, tech stack, and how the pieces fit together.

---

## What it is

A multi-user file management web app. Users register, log in, and upload/list/search/sort/rename/delete/download their own files — with every file scoped strictly to its owner. Built entirely from first principles: client, server, and database as three genuinely separate processes, wired together deliberately rather than via a framework that hides the seams.

---

## Architecture

```
Client (HTML/CSS/JS)  --HTTP-->  Server (Node.js/Express)  --SQL-->  Database (MySQL)
       <--JSON-response--                <--rows--
```

- **Client**: three pages — `register.html`, `login.html`, `upload.html` — vanilla JS, no framework.
- **Server**: `index.js`, Express, one file, all routes.
- **Database**: MySQL, two tables (`user`, `files`), created and migrated by the server itself on startup.

---

## Full feature list

**Auth**
- Registration with `bcrypt` password hashing, duplicate-email handling, client + server input validation.
- Login with credential verification and JWT issuance (1-hour expiry).
- Reusable `auth_jwt` middleware protecting every file route.
- Client-side token lifecycle: stored in `localStorage`, decoded to schedule automatic cleanup via `setTimeout`, cleared on logout.
- Rate limiting on both register (3/hour/IP) and login (5/15min/IP) via `express-rate-limit`.

**Files**
- Upload — single or multiple files at once, `multer` with safe disk-generated filenames, original name preserved separately for display.
- List — filtered per user, sortable (newest/oldest/A–Z/Z–A) and searchable by filename, entirely client-side against one fetched dataset (no re-fetch on sort/search).
- Rename — updates display name only, ownership-checked.
- Delete — removes both the database row and the physical file, ownership-checked, confirmed via `confirm()` before sending.
- Download — streamed from the server via `res.download()`, retrieved client-side via a blob + temporary-link pattern (since authenticated downloads can't use a plain link).

**UX polish**
- Loading spinner around every fetch.
- Full page-to-page flow: register → login → upload, logout closing the loop.
- Custom visual design system applied consistently across all three pages (see below).

---

## Visual design

A cohesive theme nicknamed "the ledger" — grounded in the app's own subject matter (file/record keeping) rather than a generic dashboard look.

- **Palette**: ink navy shell, parchment card surface, brass primary accent, rust for destructive actions.
- **Type**: Fraunces (serif) for titles/wordmark, IBM Plex Sans for everything else.
- **Signature detail**: a small rotated-square corner tab on every card, like a filed index card.
- **Table**: ledger-style rows — hairline dividers, right-aligned numeric columns, actions as inline text links instead of boxed buttons.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (ES6+, async/await) |
| Backend | Node.js, Express.js |
| Database | MySQL (`mysql2/promise`) |
| Auth | JWT (`jsonwebtoken`), `bcrypt` |
| File handling | `multer`, Node `fs/promises` |
| Security | `cors`, `express-rate-limit`, parameterized queries |
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

Upload size/type limits, CSS consolidation into a shared stylesheet, an accessibility pass, and — as the largest remaining feature — password reset via an external email service.

---

## The single habit that carried the whole build

Every session: **start MySQL → start server → start client**, test each layer independently before layering on the next, and use browser DevTools (Console, Network, Application, Elements) systematically whenever something breaks — checking the actual response body before assuming which side is at fault.
