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
- Decode the payload (`atob()` on the middle segment) to read `exp`, purely for UX — never for actual security, since only the server can verify a signature.
- `setTimeout`, scheduled from the remaining time until `exp`, to auto-clear an expired token from `localStorage`. Capture the timer ID (`setTimeout` returns one) if you need to cancel it early via `clearTimeout(id)` — e.g. on manual logout.
- Redirect to login if no token is found on a protected page's load.

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
- Never trust the original filename directly for disk storage — generate a unique name (timestamp + original) via `diskStorage`'s `filename` function. Store the **original** name in a separate column (`original_name`) for clean display.
- `req.file`/each item in `req.files` has fixed properties defined by multer: `originalname`, `filename`, `path`, `size`, `mimetype`.
- The destination folder must already exist on disk.

**Streaming a file back (download)**
- `res.download(filepath, suggestedFilename)` — a built-in Express method. Sets the right headers (`Content-Disposition`) and streams the file, letting you serve the disk-safe file under its clean display name.
- Client can't use a plain `<a href>` for an authenticated download (links can't carry custom headers). Instead: `fetch()` with the `Authorization` header → `response.blob()` (raw binary, the counterpart to `.json()`/`.text()`) → `URL.createObjectURL(blob)` → a JS-created, invisible `<a>` with `.download = filename`, `.click()`'d programmatically → `URL.revokeObjectURL(url)` to clean up afterward.

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

**Dynamically building HTML from an array**
- Loop, accumulate a string via `+=`, set `.innerHTML` once at the end — simpler than creating DOM elements one at a time for this scale of UI.
- Embed dynamic values (like a row's id) directly into inline `onclick="handler(${value})"` calls to connect generated HTML back to top-level JS functions.

**User-facing safety and feedback UI**
- `confirm("...")` — blocks execution, returns true/false; use before destructive actions (delete), with an early `return` on cancel.
- `prompt("...")` — blocks execution, returns the entered string or `null` on cancel; used for simple single-value input (rename) without building a separate form/modal.
- Loading indicators: toggle a hidden element's `display` before a slow `await`, and hide it again in a `finally` block — `finally` runs regardless of success or failure, so the indicator can't get stuck visible after an error.

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

---

## 11. Client-side visual design system

Once functionality was complete, a dedicated styling pass was done across all three client pages ("The ledger" theme):

**Palette**: ink navy shell (`#10192E`), darker ink panel for the header (`#16223B`), parchment card surface (`#F4EEDF`), brass accent for primary actions (`#B8892B`), rust for destructive actions (`#9C4A3C`), warm muted gray for secondary text (`#6B6455`).

**Typography**: Fraunces (serif, loaded via Google Fonts) for the wordmark and section titles only; IBM Plex Sans for everything else (body text, inputs, table). Two distinct type roles, not a single default font everywhere — loaded via `<link>` tags in `<head>`, applied via `font-family` in CSS, restricted to specific selectors (`.section-title`, `.header h2`) rather than globally, so body text stays in the sans font.

**Signature detail — the corner tab**: a small rotated-square `::before` pseudo-element on each card, mimicking a filed index tab.
```css
.card { position: relative; }
.card::before {
    content: "";
    position: absolute;
    top: -8px; left: 22px;
    width: 16px; height: 16px;
    background: #B8892B;
    transform: rotate(45deg);
}
```
`position: relative` on the parent is required for the pseudo-element's `position: absolute` to anchor correctly; `content: ""` is mandatory for any `::before`/`::after` to render at all, even with no visible text.

**Table styling**: hairline row dividers instead of a bordered grid, numeric columns (size, date) right-aligned like ledger figures via `:nth-child()` selectors, action buttons stripped of default button chrome (`background: none; border: none;`) and turned into inline colored text links.

**CSS gotchas hit during this pass**:
- `border-bottom: 1px #2A3654;` — invalid, silently invisible. Border shorthand needs three parts: width, **style**, color (`1px solid #2A3654`).
- `white-space: nowrap` on table headers prevents two-word labels ("Uploaded at") from wrapping onto a second line when their column is narrow.
- `width: 100%` combined with `padding` overflows its container unless paired with `box-sizing: border-box`.
- Native `<select>` dropdown arrows can't be restyled with ordinary CSS — a known, accepted browser limitation, not a bug.

**Duplication across pages**: the same shell/header/font/input CSS was copied into all three HTML files. Functional, but a maintenance cost — consolidating shared rules into one external stylesheet (`<link rel="stylesheet" href="styles.css">` on every page) keeps a single source of truth for anything shared, while page-specific rules (`.register_card` vs `.login_card` vs `.upload_card`) stay local.

---

## 12. Debugging discipline

Test in order, independent of each other: **MySQL → Server (curl/Postman) → Client (browser)** — tells you *which* boundary broke.

Use DevTools systematically: **Console** for JS errors, **Network** for actual request/response bodies and status codes (check the filter — "All"/"Fetch/XHR" — a wrong filter hides real requests), **Application → Local Storage** for stored tokens, **Elements** to check if data actually reached the DOM. Enable **"Preserve log"** when a possible page navigation is involved.

**When something looks broken but the code looks right, check the environment, not just the code** — e.g., Live Server auto-reloading because it's watching a folder the server writes to.

**When a feature silently does nothing (e.g., empty results, no error)**: check the actual response body in the Network tab before assuming the client is at fault — many "client bugs" throughout this build were actually the client correctly reacting to a server-side error response.
