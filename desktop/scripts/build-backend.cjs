const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const EXE_SRC = path.join(BACKEND_DIR, 'dist', 'sheet-agent-backend.exe');
const BIN_DIR = path.resolve(__dirname, '../src-tauri/bin');
const EXE_DEST = path.join(BIN_DIR, 'sheet-agent-backend-x86_64-pc-windows-msvc.exe');

console.log('=== Building backend ===');

execSync('conda run -n sheet_agent python -m PyInstaller --clean --noconfirm SheetAgent-backend.spec', {
  cwd: BACKEND_DIR,
  stdio: 'inherit',
});

if (!fs.existsSync(EXE_SRC)) {
  console.error('ERROR: Backend exe not found at', EXE_SRC);
  process.exit(1);
}

fs.mkdirSync(BIN_DIR, { recursive: true });
fs.copyFileSync(EXE_SRC, EXE_DEST);

const sizeMB = (fs.statSync(EXE_DEST).size / 1024 / 1024).toFixed(1);
console.log(`=== Backend ready: ${EXE_DEST} (${sizeMB} MB) ===`);
