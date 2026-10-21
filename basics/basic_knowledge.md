# Basic Knowledge — File Management App (HTML + Node.js + MySQL)

## 1. The big picture

Three separate programs that talk to each other. The browser **never** talks to MySQL directly.

```
Client (HTML/CSS/JS)  --HTTP-->  Server (Node.js/Express)  --SQL-->  Database (MySQL)
       <--JSON-response--                <--rows--
```

---

## 2. How a connection actually gets established

Every network connection has two layers:
1. **TCP handshake** — a raw pipe opens between two machines/ports.
2. **Application-level handshake on top of it** — HTTP for client↔server, MySQL's own auth protocol for server↔database.

**Client ↔ Server**: no persistent connection — every `fetch()` is its own request/response cycle. This is why auth needs a token.

**Server ↔ Database**: a **long-lived** connection (or pool), opened once at startup and reused for every query.

---

## 3. HTTP & REST basics

- Routes combine a **method** + **path**: `GET /api/files`, `POST /api/upload`, `PATCH /api/files/:id`, `DELETE /api/files/:id`.
- **Route parameters** (`:id`) capture a value from the URL itself, read via `req.params.id`.
- Use the right **status codes** consistently: 200 success, 400 bad input, 401 not logged in, 403 forbidden/invalid token, 404 not found, 429 rate-limited, 500 server error.
- **HTTP method conventions matter**: GET to read, POST to create, PATCH for a partial update, DELETE to remove. Not enforced by the browser, but expected by anyone reading your API (including future you).
- **`response.ok`** is `true` for any 2xx status. The client uses it to decide between a success message and an error message, instead of guessing from the body.

---

## 4. CORS

- A **browser-enforced** rule based on origin (protocol + domain + **port**). Irrelevant to server↔database (raw TCP, no browser).
- The request still reaches the server and gets processed — CORS only blocks the **browser** from letting client JS **read** the response.
- Fixed via `app.use(cors())`.

---

## 5. Authentication essentials

**Password hashing** — `bcrypt.hash(pass, saltRounds)` to store, `bcrypt.compare(entered, storedHash)` to verify. Never re-hash and directly compare — every hash call produces a different result even for the same input, by design.

**JWT** — `header.payload.signature`. Payload is readable (base64, not encrypted) but signature-protected against tampering. `jwt.sign(payload, JWT_SECRET, {expiresIn: '1h'})`, `jwt.verify(token, JWT_SECRET)`. Sent via `Authorization: Bearer <token>`.

**`auth_jwt` middleware** — checks the header, verifies the token, attaches `req.user`, calls `next()` or responds 401/403.

**Client-side token lifecycle**
- Decode the payload to read `exp`, purely for UX — never for actual security, since only the server can verify a signature.
- JWTs use **base64url**, not plain base64 (`-` and `_` instead of `+` and `/`). Convert before calling `atob()`: `.replace(/-/g, '+').replace(/_/g, '/')`. Wrap the decode in `try/catch` — a malformed token should log the user out, not crash the script.
- `setTimeout`, scheduled from the remaining time until `exp`, calls `logout()` when the token expires. Capture the timer ID so a manual logout can cancel it with `clearTimeout(id)`.
- Redirect to login if no token is found on a protected page's load.
- If the server answers **401** to a data request, call `logout()` — the token was rejected even if the client thought it was still valid.

**"Remember me" — `localStorage` vs `sessionStorage`**
- `localStorage` survives closing the browser. `sessionStorage` is cleared when the tab/browser closes.
- Ticked → store the token in `localStorage`. Unticked → store it in `sessionStorage`.
- A protected page must read **both**: `localStorage.getItem(...) || sessionStorage.getItem(...)`. Logout must clear **both**.
- On login, it is cleaner to remove the token from the *other* storage, otherwise an older "remembered" token can keep the user logged in after they unticked the box.

**Rate limiting** — a defense against brute-force/spam attempts, orthogonal to authentication itself. `express-rate-limit` middleware, configured with a time window and a max request count per IP, applied per-route:
```js
const limiter = rateLimit({ windowMs: 15*60*1000, max: 5, message: {...} });
app.post('/api/login', limiter, handler);
```
Different routes can (and should) have different tuning — e.g. registration abuse looks different from login brute-forcing, so a stricter/longer window suits register better than login.

---

## 6. File uploads

- `multer` parses `multipart/form-data`, which `express.json()` cannot handle.
- Client: `FormData`, `.append(fieldName, file)`, sent as the `fetch` body with **no manual `Content-Type`** — the browser sets it (with the correct boundary) automatically.
- **Field name must match exactly** between client (`formdata.append("files", file)`) and server (`upload.array('files', 10)`) — a mismatch silently results in an empty `req.file`/`req.files`, not an error.

**Single file**: `upload.single('file')` → `req.file` (one object).
**Multiple files**: `upload.array('files', maxCount)` → `req.files` (an **array** of objects) — insert logic must loop over it, one row per file.

- File input access: `.files` — a `FileList`, even for one file. Use `.files[0]` for single-select, or the whole `.files` (looped) for `multiple`-enabled inputs.
- **Reset the input after an upload** (`fileInput.value = ""`), otherwise choosing the same file again doesn't fire the `change` event.
- **Guard against an empty selection** (`if (!selectedFiles.length) return;`) — cancelling the file dialog can fire `change` with no files in some browsers.
- Never trust the original filename directly for disk storage — generate a unique name (timestamp + original) via `diskStorage`'s `filename` function. Store the **original** name in a separate column (`original_name`) for clean display.
- `req.file`/each item in `req.files` has fixed properties defined by multer: `originalname`, `filename`, `path`, `size`, `mimetype`.
- The destination folder must already exist on disk.
- **Hiding the native file input**: the real `<input type="file">` is hidden with Bootstrap's `d-none`, and a styled button calls `document.getElementById('fileInput').click()`. The `id` stays the same, so the upload code is unaffected.

**Streaming a file back (download)**
- `res.download(filepath, suggestedFilename)` — a built-in Express method. Sets the right headers (`Content-Disposition`) and streams the file, letting you serve the disk-safe file under its clean display name.
- Client can't use a plain `<a href>` for an authenticated download (links can't carry custom headers). Instead: `fetch()` with the `Authorization` header → check `response.ok` → `response.blob()` → `URL.createObjectURL(blob)` → a JS-created `<a>` with `.download = filename`, `.click()`'d programmatically → `URL.revokeObjectURL(url)` to clean up afterward.
- The Download button passes **only the file id** (`downloadFile(${file.id})`). The function looks the name up from `allfiles` itself. Passing the name through an inline `onclick` string breaks on a name containing an apostrophe (`it's.pdf`) and is an injection risk.

---

## 7. Database design

**users**
| column | notes |
|---|---|
| id | primary key, auto-increment |
| fname | |
| email | `UNIQUE` |
| hashed_pass | bcrypt hash |
| created_at | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` |

**files**
| column | notes |
|---|---|
| id | primary key, auto-increment |
| user_id | `FOREIGN KEY REFERENCES user(id)` |
| filename | disk-safe generated name |
| original_name | name as uploaded, for display and rename target |
| filepath | where it lives on disk |
| size | `BIGINT` — bytes, never store as text |
| uploaded_at | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` |

**Two-phase database/table creation**: connect without a database → `CREATE DATABASE IF NOT EXISTS` → reconnect with the database specified → `CREATE TABLE IF NOT EXISTS`. Idempotent, safe on every restart.

**`CREATE TABLE IF NOT EXISTS` does not alter existing tables.** Use `ALTER TABLE ... ADD/DROP/CHANGE COLUMN` manually for schema changes on a table that already exists.

**Ownership checks on every mutating query** — delete, rename (update), and download all filter by **both** `id AND user_id`, never `id` alone. This is the difference between "any logged-in user can touch any file by guessing an id" and a genuinely secure per-user system. A `SELECT ... WHERE id = ? AND user_id = ?` first (to confirm existence + ownership, and to fetch anything needed like `filepath`) before acting is the standard shape.

**Preventing SQL injection**: always `?` placeholders with a separate values array — never string-concatenate user input into a query.

**`AUTO_INCREMENT` gaps** are normal (failed inserts still consume an id). `TRUNCATE TABLE` resets the counter; `DELETE FROM` does not.

---

## 8. Client-side patterns that recurred throughout

**Single source of truth + pure render function**
- Fetch data once, store it in a shared variable (`let allfiles = []`).
- A separate render function (`renderFileList`) derives what's displayed from that stored data — filtering (search) and sorting are just transformations applied before rendering, not separate re-fetches.
- Sort and search compose naturally this way: filter first, then sort the filtered result.
- `.filter()` (keep matching items) and `.sort()` (reorder, via a compare function returning negative/zero/positive) are the two array methods this relies on. `.sort()` mutates in place — sort a copy (`[...array]`, or `.filter()`'s naturally-new result) if the original order needs preserving.
- Use `allfiles = data.files || []` so an unexpected response gives an empty list instead of a crash.

**Dynamically building HTML from an array**
- Loop, accumulate a string via `+=`, set `.innerHTML` once at the end — simpler than creating DOM elements one at a time for this scale of UI.
- Embed only **safe values** (like a numeric row id) directly into inline `onclick="handler(${value})"` calls.
- **Escape anything a user controls before putting it in `innerHTML`.** A file name is user input. The helper:
  ```js
  function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
  }
  ```
  Without it, a file named `<img src=x onerror=...>` would run as code on the page (XSS).
- Use `.textContent` (not `.innerHTML`) when putting a plain message from the server into the page.
- A lookup helper (`getFileIcon(name)`) returning an icon class and color by file extension keeps the template short. The values come from a fixed list in the code, so they are safe to embed.
- Render an **empty state** row ("No files found") when the filtered list is empty.

**User-facing safety and feedback UI**
- `confirm("...")` — blocks execution, returns true/false; use before destructive actions (delete), with an early `return` on cancel.
- `prompt("...")` — blocks execution, returns the entered string or `null` on cancel; used for simple single-value input (rename) without building a separate form/modal.
- Loading indicators: toggle a hidden element's `display` before a slow `await`, and hide it again in a `finally` block — `finally` runs regardless of success or failure, so the indicator can't get stuck visible after an error.
- **One `showMessage(msg, isError)` helper** per page: sets the text, switches the Bootstrap alert class between `alert-success` and `alert-danger`, and hides itself after a few seconds (`setTimeout`, with `clearTimeout` so messages don't overlap).
- **One global safety net** for failed network calls: `window.addEventListener("unhandledrejection", ...)` shows "Could not reach the server" for any uncaught failed `fetch`, instead of wrapping every function in its own `try/catch`. Login and register still use explicit `try/catch` since they run before the user is inside the app.

---

## 9. JavaScript concepts that came up repeatedly

- **`async`/`await`**: only works inside `async` functions. Top-level `await` needs ES Modules; wrap CommonJS startup logic in an `async function main(){...}` and call it.
- **Scope and shadowing**: share a value across functions by declaring it once at the top level (`let x;`) and assigning to it elsewhere **without** `const`/`let`/`var` — using a declaration keyword again creates a separate shadowed variable instead of updating the shared one. This came up for `dbconnection`, `token`, `cleanupTimerId`.
- **Declaration order matters**: `const`/`let` variables can't be referenced before their declaration line runs (temporal dead zone) — read/declare values *before* validating or using them, not after.
- **Function calls vs. declarations**: `async function x(){...}` only defines it; nothing runs until `x()` is actually called elsewhere. A very common category of bug throughout this build.
- **`.json()` / `.blob()` on a Response**: both are **methods** (need parentheses) returning Promises — `await response.json()` for parsed data, `await response.blob()` for raw binary.
- **Assignment vs. comparison**: `if (x = true)` assigns and is always truthy; use `===` or just `if (x)` for a boolean.
- **`return` after sending a response**: stops the rest of a function running and attempting a second `res...()` call, which Express doesn't allow.
- **Middleware and `next()`**: forgetting to call `next()` on the success path leaves a request hanging forever.
- **`setTimeout`/`clearTimeout`**: `setTimeout` returns an ID; capture it if the scheduled action might need cancelling.
- **Field-name matching across the client/server boundary** is a distinct category of bug from ordinary JS bugs — a perfectly valid piece of code on each side can still fail silently if the *string* identifying a field (`FormData` key, multer's expected field name) doesn't match exactly.
- **Object destructuring**: `const { icon, color } = getFileIcon(name);` unpacks the fields of a returned object into variables.
- **Default parameters**: `function showMessage(msg, isError = false)` — callers can leave the second argument out.

---

## 10. Key npm packages

| Package | Purpose |
|---|---|
| `express` | web server framework |
| `mysql2` (`mysql2/promise`) | MySQL driver, promise-based |
| `bcrypt` | password hashing |
| `jsonwebtoken` | JWT creation/verification |
| `multer` | multipart/file upload handling |
| `cors` | CORS headers |
| `dotenv` | load `.env` config |
| `express-rate-limit` | per-route request rate limiting |
| `fs` / `fs/promises` | reading/deleting files on disk (Node built-in, no install needed) |
| `nodemon` (dev) | auto-restart server on file changes |

**Client-side libraries (loaded from a CDN, nothing to install):** Bootstrap 5.3.3 (CSS + bundle JS) and Bootstrap Icons 1.11.3 (icon font).

---

## 11. Client-side visual design system (Bootstrap 5)

The original hand-written "ledger" theme (parchment cards, serif titles, corner tabs) was replaced by a **Bootstrap 5** redesign, built to match mockup images, one page at a time.

**Setup**
- In `<head>`: the viewport meta tag, Bootstrap CSS, then Bootstrap Icons CSS — all **before** the page's own `<style>` block, so own rules can override Bootstrap.
- Before `</body>`: the Bootstrap bundle script.
- Google Fonts links were removed. The page uses the system font stack (`'Segoe UI', system-ui, ...`).
- Colors are defined once as CSS variables in `:root` and reused with `var(--gold)`.

**Palette**: dark navy page (`#10192e`), navy top bar (`#0f1c3f`), navy gradient hero/sidebar panels, light blue-grey form panel (`#f4f7fd` → `#eaf0fa`), white cards, **gold/orange** for primary actions (orange gradient `#fbbd3d` → `#e0900f` on register/login, solid gold `#b8892b` on the upload page), red for destructive actions.

**Page layouts**
- **Register / Login**: a full-height `app-shell` (flex column) with a navy top bar, then a two-column `row g-0` — left `col-md-6` hero panel (illustration + heading + tagline), right `col-md-6` form panel containing a white card (`max-width: 460px; margin: 0 auto`). Columns stack on phones.
- **Upload**: top bar with avatar + Logout, then `row g-0` with a `col-lg-3` sidebar (hero image, heading, "Upload" nav item) and `col-lg-9` main area holding a cream `main-card` → header with gold icon, dashed drop zone with the Add File button, and a white `file-card` with search + sort, the alert, the spinner and the table.

**Bootstrap pieces used**
- **Grid**: 12 columns per row. Column widths must add up to 12 or less — `col-lg-3` + `col-lg-9` works, `3 + 10` wraps the second column onto a new row. `g-0` removes gutters.
- **Flex utilities**: `d-flex`, `flex-column`, `align-items-center`, `justify-content-between`, `gap-2/3`, `flex-grow-1`.
- **Spacing utilities**: `p-3`, `px-3 py-2`, `mb-3`, `mt-4`, `me-1`, `my-4`, `w-100`.
- **Forms**: `form-label`, `form-control`, `form-select`, `input-group` + `input-group-text` (icon box attached to an input), `form-check` (checkbox + label).
- **Feedback**: `alert alert-danger/alert-success` (hidden with `d-none` until needed), `spinner-border spinner-border-sm`.
- **Tables**: `table`, `align-middle`, `table-responsive` (scrolls sideways on small screens instead of breaking the layout).
- **Buttons**: `btn`, `btn-sm`, `btn-outline-danger`, plus custom `btn-gold`, `btn-gold-sm`, `btn-outline-action`, `btn-register`, `btn-login`.
- **Icons**: `<i class="bi bi-person-fill"></i>` and similar.

**Custom CSS patterns**
- A circular icon holder (`.icon-circle`, `.icon-circle-gold`): fixed `width`/`height`, `border-radius: 50%`, flex-centered, `flex-shrink: 0` so it never squashes into an oval.
- Focus ring in the accent color: `border-color` + `box-shadow: 0 0 0 .2rem rgba(...)` on `.form-control:focus`.
- A `@media (min-width: 768px)` rule gives the sort dropdown a minimum width.
- Rounded table header: `border-radius` on the first and last `th`.

**CSS/HTML gotchas hit during this pass**
- **Class names must match exactly** between HTML and CSS: `.top-bar` vs `class="topbar"`, `.file-table` vs `.files-table`, `align-item-center` vs `align-items-center`. A mismatch fails silently — the rule just never applies.
- **Typos in selectors/values**: `.form-control:form` (should be `:focus`), `col-12 co;-md`, `##14224a` (double hash) — none throw an error; the style is simply ignored.
- **Global `p { color: ... }` and `h1 { color: ... }` rules from the old theme** override Bootstrap's text colors everywhere and must be deleted.
- Text turns dark and unreadable on a navy background when the background rule isn't applied, because Bootstrap's default body text color is dark.
- Unclosed or extra `</div>` tags are silently "fixed" by the browser, which can move whole sections out of their parent. Check nesting by clicking an opening tag in VS Code (its matching closing tag highlights), and auto-format with **Shift + Alt + F** so indentation reveals the structure.
- `overflow: hidden` on a rounded wrapper is what clips child corners to the rounded shape.
- `width: 100%` combined with `padding` overflows its container unless paired with `box-sizing: border-box` (Bootstrap sets this globally).
- Native `<select>` dropdown arrows can't be restyled with ordinary CSS — a known, accepted browser limitation.

**Duplication across pages**: the top bar, buttons, input styling and `:root` colors are copied into all three HTML files. Consolidating the shared rules into one `styles.css` is the main remaining styling task.

---

## 12. Debugging discipline

Test in order, independent of each other: **MySQL → Server (curl/Postman) → Client (browser)** — tells you *which* boundary broke.

Use DevTools systematically: **Console** for JS errors, **Network** for actual request/response bodies and status codes (check the filter — "All"/"Fetch/XHR" — a wrong filter hides real requests), **Application → Local Storage / Session Storage** for stored tokens, **Elements** to check if data actually reached the DOM and which classes an element really has. Enable **"Preserve log"** when a possible page navigation is involved.

**When something looks broken but the code looks right, check the environment, not just the code** — e.g., Live Server auto-reloading because it's watching a folder the server writes to.

**When a feature silently does nothing (e.g., empty results, no error)**: check the actual response body in the Network tab before assuming the client is at fault — many "client bugs" throughout this build were actually the client correctly reacting to a server-side error response.

**When styling "doesn't apply"**: in DevTools → Elements, select the element and look at the Styles pane. If your rule isn't listed at all, the selector doesn't match (class-name typo); if it's listed but crossed out, something more specific overrides it.
