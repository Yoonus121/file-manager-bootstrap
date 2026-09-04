# File Manager

A secure multi-user file management web app built with Node.js, Express, and MySQL. Register, log in, upload files, and manage them (search, sort, rename, delete, download) — all scoped to your own account.

## Tech stack

Node.js · Express · MySQL · JWT · bcrypt · Multer · express-rate-limit · vanilla HTML/CSS/JavaScript

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [MySQL](https://dev.mysql.com/downloads/) installed and running locally (or accessible remotely)
- A code editor with a local static server for the client — e.g. [VS Code](https://code.visualstudio.com/) with the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension

## Project structure

```
server/
  index.js
  package.json
  uploadedFiles/      <- created manually, stores uploaded files
  .env                <- created manually, see below

client/
  register.html
  login.html
  upload.html
  styles.css
```

## Setup

### 1. Clone and install server dependencies

```bash
cd server
npm install
```

### 2. Create the `uploadedFiles` folder

```bash
mkdir uploadedFiles
```

This folder must exist before running the server — uploaded files are saved here.

### 3. Create a `.env` file

In the `server` folder, create a file named exactly `.env` with the following, filled in with your own values:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=file_manager_db
DB_PORT=3306
JWT_SECRET=a_long_random_string
```

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Confirm MySQL is running

The database itself (`DB_NAME`) does not need to exist yet — the server creates it, along with all required tables, automatically on first run.

## Running the app

### Start the server

```bash
cd server
node index.js
```

You should see, in order:

```
db created
user table created
files table created
express Server running at http://localhost:3000/
```

For automatic restarts on file changes during development, use [nodemon](https://www.npmjs.com/package/nodemon) instead:

```bash
npx nodemon index.js
```

### Start the client

Open the `client` folder in VS Code and start Live Server on `register.html` (or `login.html`) — right-click the file → **Open with Live Server**. This serves the client at `http://localhost:5500` (or similar).

Do not open the HTML files directly by double-clicking them — the app relies on CORS and `fetch()` behavior that requires being served over `http://`, not opened as a local `file://` path.

## Using the app

1. Open `register.html` in your browser, create an account.
2. You'll be redirected to `login.html` — log in with the same credentials.
3. On successful login you're redirected to `upload.html`, where you can:
   - Upload one or more files (click the add-file icon)
   - Search and sort your files
   - Rename, delete, or download any file
   - Log out (clears your session)

Your login session lasts 1 hour, after which you'll need to log in again.

## API overview

| Method | Route | Auth required | Description |
|---|---|---|---|
| POST | `/api/register` | No | Create a new account |
| POST | `/api/login` | No | Log in, receive a JWT |
| POST | `/api/upload` | Yes | Upload one or more files |
| GET | `/api/files` | Yes | List your files |
| DELETE | `/api/files/:id` | Yes | Delete a file |
| PATCH | `/api/files/:id` | Yes | Rename a file |
| GET | `/api/files/:id/download` | Yes | Download a file |

Authenticated requests require an `Authorization: Bearer <token>` header, using the token returned from `/api/login`.

## Notes

- `.env` and `uploadedFiles/` are excluded from version control — see `.gitignore`. Never commit real credentials.
- The server and client run as two separate processes on different ports; MySQL must be running before the server starts.
