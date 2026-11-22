# Diskly (Electron)

Desktop port of the Diskly v2 prototype, with real drive info and disk scanning.

- `npm install`
- `npm start` builds the UI and launches the app
- `npm run dev` runs with Vite hot reload

How it works: `electron/main.js` lists drives (PowerShell `Win32_LogicalDisk`), runs `electron/scanner.js`
in a worker thread (read-only walk; files of 100 MB and up are listed), and handles reveal, move, Recycle Bin and
permanent delete. The last scan is cached in the app's user-data folder. Protected system files
(pagefile/hiberfil/swapfile) can't be deleted from the app.
