#!/usr/bin/env python
"""
Build script for SheetAgent desktop application.
Separated into independent stages for faster iteration.

Usage:
  python build.py              # Build all
  python build.py --python     # Only setup embedded Python
  python build.py --backend    # Only build backend exe
  python build.py --tauri      # Only build Tauri app
"""

import argparse
import os
import sys
import shutil
import subprocess
import urllib.request
import zipfile
from pathlib import Path

# Directories
ROOT_DIR = Path(__file__).parent
BACKEND_DIR = ROOT_DIR / 'backend'
DESKTOP_DIR = ROOT_DIR / 'desktop'
TAURI_BIN_DIR = DESKTOP_DIR / 'src-tauri' / 'bin'
PYTHON_EMBED_DIR = ROOT_DIR / 'python-embed'

# Python embedded version
PYTHON_VERSION = "3.11.9"
PYTHON_EMBED_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip"

# Packages to install in embedded Python
SANDBOX_PACKAGES = ['polars', 'fastexcel', 'openpyxl', 'xlsxwriter', 'python-docx']


def download_python_embed():
    """Download and extract Python embedded package."""
    print("\n" + "=" * 50)
    print("Step 1: Download Python Embedded")
    print("=" * 50)

    if PYTHON_EMBED_DIR.exists():
        python_exe = PYTHON_EMBED_DIR / 'python.exe'
        if python_exe.exists():
            print(f"[OK] Python embed already exists: {PYTHON_EMBED_DIR}")
            return True

    PYTHON_EMBED_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = ROOT_DIR / 'python-embed.zip'

    try:
        print(f"Downloading Python {PYTHON_VERSION}...")
        print(f"  URL: {PYTHON_EMBED_URL}")
        urllib.request.urlretrieve(PYTHON_EMBED_URL, zip_path)

        print(f"Extracting to: {PYTHON_EMBED_DIR}")
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(PYTHON_EMBED_DIR)

        zip_path.unlink()
        print("[OK] Python embedded downloaded")
        return True
    except Exception as e:
        print(f"[ERR] Failed: {e}")
        return False


def setup_python_embed():
    """Setup Python embedded with pip and required packages."""
    print("\n" + "=" * 50)
    print("Step 2: Setup Python Embedded")
    print("=" * 50)

    python_exe = PYTHON_EMBED_DIR / 'python.exe'
    if not python_exe.exists():
        print(f"[ERR] python.exe not found in {PYTHON_EMBED_DIR}")
        return False

    # Enable pip by modifying python311._pth file
    pth_file = PYTHON_EMBED_DIR / 'python311._pth'
    if pth_file.exists():
        content = pth_file.read_text(encoding='utf-8')
        if 'import site' not in content:
            lines = content.split('\n')
            new_lines = []
            for line in lines:
                if line.strip().startswith('#import site'):
                    new_lines.append('import site')
                else:
                    new_lines.append(line)
            if 'import site' not in '\n'.join(new_lines):
                new_lines.append('import site')
            pth_file.write_text('\n'.join(new_lines), encoding='utf-8')
            print("[OK] Enabled pip in ._pth file")

    # Check if pip is already installed
    pip_path = PYTHON_EMBED_DIR / 'Scripts' / 'pip.exe'
    if pip_path.exists():
        print("[OK] pip already installed")
    else:
        # Download get-pip.py
        get_pip_path = PYTHON_EMBED_DIR / 'get-pip.py'
        print("Installing pip...")
        try:
            urllib.request.urlretrieve('https://bootstrap.pypa.io/get-pip.py', get_pip_path)
            result = subprocess.run(
                [str(python_exe), str(get_pip_path), '--no-warn-script-location'],
                capture_output=True, text=True, timeout=120
            )
            get_pip_path.unlink()
            if result.returncode == 0:
                print("[OK] pip installed")
            else:
                print(f"[WARN] pip install issue: {result.stderr[:200]}")
        except Exception as e:
            print(f"[WARN] Failed to install pip: {e}")

    # Install required packages
    print("\nInstalling sandbox packages...")
    for pkg in SANDBOX_PACKAGES:
        result = subprocess.run(
            [str(python_exe), '-m', 'pip', 'install', pkg, '--no-warn-script-location', '-q'],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode != 0:
            print(f"  [WARN] {pkg}: {result.stderr[:100]}")
        else:
            print(f"  [OK] {pkg}")

    # Verify
    result = subprocess.run(
        [str(python_exe), '-c', 'import polars; print(f"polars {polars.__version__}")'],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode == 0:
        print(f"\n[OK] Python embedded ready: {result.stdout.strip()}")
        return True
    else:
        print(f"[ERR] polars not working: {result.stderr}")
        return False


def copy_python_to_tauri():
    """Copy Python embed to Tauri bin directory."""
    python_dst = TAURI_BIN_DIR / 'python'

    if python_dst.exists():
        # Check if already up to date
        src_exe = PYTHON_EMBED_DIR / 'python.exe'
        dst_exe = python_dst / 'python.exe'
        if dst_exe.exists() and src_exe.exists():
            if src_exe.stat().st_mtime <= dst_exe.stat().st_mtime:
                print("[OK] Python already copied to Tauri bin")
                return True
        shutil.rmtree(python_dst)

    if PYTHON_EMBED_DIR.exists():
        TAURI_BIN_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copytree(PYTHON_EMBED_DIR, python_dst)
        print(f"[OK] Copied Python to: {python_dst}")
        return True
    else:
        print("[WARN] Python embed not found, skipping")
        return False


def build_backend():
    """Build the Python backend as a standalone executable."""
    print("\n" + "=" * 50)
    print("Step 3: Build Backend EXE")
    print("=" * 50)

    # Check PyInstaller
    try:
        import PyInstaller
        print(f"[OK] PyInstaller {PyInstaller.__version__}")
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'pyinstaller'], check=True)

    os.chdir(BACKEND_DIR)

    cmd = [sys.executable, '-m', 'PyInstaller', '--clean', '--noconfirm', 'SheetAgent-backend.spec']
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd)

    if result.returncode != 0:
        print("[ERR] Backend build failed!")
        return False

    exe_path = BACKEND_DIR / 'dist' / 'sheet-agent-backend.exe'
    if exe_path.exists():
        size_mb = exe_path.stat().st_size / 1024 / 1024
        print(f"[OK] Backend built: {exe_path} ({size_mb:.1f} MB)")
        return True
    else:
        print("[ERR] Backend exe not found!")
        return False


def copy_backend_to_tauri():
    """Copy backend exe to Tauri bin directory."""
    TAURI_BIN_DIR.mkdir(parents=True, exist_ok=True)

    src = BACKEND_DIR / 'dist' / 'sheet-agent-backend.exe'
    dst = TAURI_BIN_DIR / 'sheet-agent-backend-x86_64-pc-windows-msvc.exe'

    if not src.exists():
        print(f"[ERR] Backend exe not found: {src}")
        return False

    shutil.copy2(src, dst)
    print(f"[OK] Copied backend to: {dst}")
    return True


def build_tauri():
    """Build the Tauri frontend."""
    print("\n" + "=" * 50)
    print("Step 4: Build Tauri App")
    print("=" * 50)

    os.chdir(DESKTOP_DIR)

    cmd = ['npm', 'run', 'tauri:build']
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd)

    if result.returncode == 0:
        exe_path = DESKTOP_DIR / 'src-tauri' / 'target' / 'release' / 'sheet-agent-desktop.exe'
        if exe_path.exists():
            size_mb = exe_path.stat().st_size / 1024 / 1024
            print(f"[OK] Tauri built: {exe_path} ({size_mb:.1f} MB)")
        return True
    else:
        print("[ERR] Tauri build failed!")
        return False


def main():
    parser = argparse.ArgumentParser(description='Build SheetAgent')
    parser.add_argument('--python', action='store_true', help='Only setup embedded Python')
    parser.add_argument('--backend', action='store_true', help='Only build backend exe')
    parser.add_argument('--tauri', action='store_true', help='Only build Tauri app')
    args = parser.parse_args()

    print("=" * 50)
    print("SheetAgent Build Script")
    print(f"Python: {PYTHON_VERSION}")
    print("=" * 50)

    # If no specific flag, build all
    build_all = not (args.python or args.backend or args.tauri)

    success = True

    if build_all or args.python:
        if not download_python_embed():
            success = False
        elif not setup_python_embed():
            success = False
        elif build_all:
            if not copy_python_to_tauri():
                success = False

    if build_all or args.backend:
        if not build_backend():
            success = False
        elif build_all:
            if not copy_backend_to_tauri():
                success = False

    if build_all or args.tauri:
        if not build_tauri():
            success = False

    if success:
        print("\n" + "=" * 50)
        print("✓ Build complete!")
        print("=" * 50)
        if build_all:
            exe_path = DESKTOP_DIR / 'src-tauri' / 'target' / 'release' / 'sheet-agent-desktop.exe'
            print(f"\nOutput: {exe_path}")
    else:
        print("\n[ERR] Build failed!")
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
