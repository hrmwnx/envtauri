# Envtauri

Envtauri is a desktop environment variable editor built with Tauri v2, Rust, and TypeScript.

## Features

- Browse, search, add, edit, and delete variables.
- Load and save `.env` files while retaining comments and blank lines.
- On Windows, manage persistent User and System environment variables in the registry.
- Keep System variables read-only when the app is not elevated.
- Edit semicolon-separated values such as `PATH` as individual entries.

## Development

Install Node.js and Rust, then run:

```sh
npm install
npm run tauri dev
```

Build the frontend with `npm run build`, or create a desktop bundle with:

```sh
npm run tauri build
```

Use the source tabs to switch between `.env`, User, and System variables. Enter a `.env` file path and choose **Load file** to open a file. Changes are staged in the editor until you choose **Save changes** (Ctrl/Cmd+S).
