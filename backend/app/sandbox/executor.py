"""Sandboxed Python code executor. Runs user/LLM-generated code in a subprocess
with file-system restrictions and timeout control."""

from __future__ import annotations
import datetime
import subprocess
import sys
import os
import time
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ExecutionResult:
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int


def _get_python_executable() -> str | None:
    """Get the Python executable path for running sandbox code.

    In development: use sys.executable (the current Python interpreter).
    In PyInstaller bundle: look for embedded Python or system Python.

    Returns None if no suitable Python interpreter is found.
    """
    # Check if running in PyInstaller bundle
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        bundle_dir = Path(sys._MEIPASS)
        exe_dir = Path(sys.executable).parent

        # Priority 1: Embedded Python next to the exe (Tauri bundle structure)
        # When bundled with Tauri, Python is in: <exe_dir>/python/python.exe
        embedded_candidates = [
            exe_dir / 'python' / 'python.exe',
            exe_dir / 'python' / 'python3.exe',
            bundle_dir / 'python' / 'python.exe',
            bundle_dir / 'python' / 'python3.exe',
            bundle_dir / 'python.exe',
            bundle_dir / 'python3.exe',
        ]

        for candidate in embedded_candidates:
            if candidate.exists():
                # Verify it can actually run Python code
                try:
                    test_result = subprocess.run(
                        [str(candidate), '-c', 'print("ok")'],
                        capture_output=True,
                        timeout=5,
                    )
                    if test_result.returncode == 0:
                        print(f"[Sandbox] Using Python: {candidate}")
                        return str(candidate)
                except Exception as e:
                    print(f"[Sandbox] Failed to test {candidate}: {e}")
                    continue

        # Priority 2: System Python (common Windows locations)
        system_candidates = []

        # Check LOCALAPPDATA for Python installations
        local_app_data = os.environ.get('LOCALAPPDATA', '')
        if local_app_data:
            programs_dir = Path(local_app_data) / 'Programs' / 'Python'
            if programs_dir.exists():
                for py_dir in programs_dir.iterdir():
                    if py_dir.name.startswith('Python'):
                        system_candidates.append(py_dir / 'python.exe')

        # Check via 'where' command
        for name in ['python', 'python3']:
            try:
                result = subprocess.run(
                    ['where', name],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if result.returncode == 0:
                    for path in result.stdout.strip().split('\n'):
                        path = path.strip()
                        if path:
                            system_candidates.append(path)
            except Exception:
                continue

        # Verify system candidates
        for candidate in system_candidates:
            candidate_path = Path(candidate) if isinstance(candidate, str) else candidate
            if candidate_path.exists():
                try:
                    test_result = subprocess.run(
                        [str(candidate_path), '-c', 'import polars; print("ok")'],
                        capture_output=True,
                        timeout=10,
                    )
                    if test_result.returncode == 0:
                        return str(candidate_path)
                except Exception:
                    continue

        # No Python interpreter found with polars
        print("[Sandbox] WARNING: No Python interpreter found with polars installed.")
        print("[Sandbox] Please either:")
        print("[Sandbox]   1. Install Python and polars on your system, or")
        print("[Sandbox]   2. Use the full build with embedded Python")
        return None

    return sys.executable


def _run_with_fallback(code: str, env: dict, cwd: str, timeout: int) -> subprocess.CompletedProcess | None:
    """Run code using the best available method.

    For regular Python: use python -c "code"
    For PyInstaller exe: write code to temp file and run python temp_file.py

    Returns None if no Python interpreter is available.
    """
    python_exe = _get_python_executable()

    if python_exe is None:
        return None

    # Check if we can use -c flag (regular Python)
    try:
        test_result = subprocess.run(
            [python_exe, '-c', 'print("test")'],
            capture_output=True,
            timeout=5,
        )

        if test_result.returncode == 0:
            # -c flag works, use it
            return subprocess.run(
                [python_exe, '-c', code],
                capture_output=True,
                timeout=timeout,
                cwd=cwd,
                env=env,
            )
    except Exception:
        pass

    # -c doesn't work (probably PyInstaller exe), use temp file
    with tempfile.NamedTemporaryFile(
        mode='w',
        suffix='.py',
        delete=False,
        encoding='utf-8'
    ) as f:
        f.write(code)
        temp_file = f.name

    try:
        return subprocess.run(
            [python_exe, temp_file],
            capture_output=True,
            timeout=timeout,
            cwd=cwd,
            env=env,
        )
    finally:
        try:
            os.unlink(temp_file)
        except:
            pass


# Bootstrap code injected before user code.
# Trusted imports go FIRST (before restrictions), so polars/fastexcel/openpyxl can load
# their internal dependencies (ctypes, shutil, zipfile, etc.).
_SANDBOX_PREAMBLE = """
import sys
import os
import tempfile

# --- Trusted imports: load BEFORE restrictions so internal deps work ---
import polars as pl

# Try to import Excel readers — they may or may not be installed
try:
    import fastexcel
except ImportError:
    pass
try:
    import openpyxl
except ImportError:
    pass

# Pre-load matplotlib so chart generation works in sandbox
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import matplotlib.font_manager as fm
except ImportError:
    pass

# --- Install sandbox restrictions AFTER all trusted imports ---

_workspace = os.environ.get('SA_WORKSPACE', os.getcwd())

# Restrict file system access
_original_open = open
def _restricted_open(file, *args, **kwargs):
    path = os.path.abspath(str(file))
    if not path.startswith(_workspace) and not path.startswith(tempfile.gettempdir()):
        raise PermissionError(f"Access denied: {file} is outside workspace")
    return _original_open(file, *args, **kwargs)

builtins = __import__('builtins')
builtins.open = _restricted_open

# Block dangerous imports
_original_import = builtins.__import__
_blocked = {'subprocess', 'shutil'}

def _restricted_import(name, *args, **kwargs):
    top = name.split('.')[0]
    if top in _blocked:
        raise ImportError(f"Import of {name} is blocked in sandbox")
    return _original_import(name, *args, **kwargs)

builtins.__import__ = _restricted_import

# Block os.system / os.popen — they bypass import restrictions
_original_system = os.system
def _restricted_system(*args, **kwargs):
    raise PermissionError("os.system is blocked in sandbox")
os.system = _restricted_system

_original_popen = os.popen
def _restricted_popen(*args, **kwargs):
    raise PermissionError("os.popen is blocked in sandbox")
os.popen = _restricted_popen
"""

_TIMEOUT_SECONDS = 30


def execute_code(
    code: str,
    workspace: str,
    cwd: str | None = None,
    timeout: int = _TIMEOUT_SECONDS,
) -> ExecutionResult:
    """Execute Python code in a sandboxed subprocess.

    Args:
        code: Python code to run.
        workspace: Path used for sandbox filesystem restrictions (SA_WORKSPACE).
        cwd: Actual working directory for the subprocess. Defaults to workspace.
    """

    full_code = _SANDBOX_PREAMBLE + "\n" + code
    start = time.monotonic()
    actual_cwd = cwd or workspace

    # Create a date-isolated tmp directory inside workspace for intermediate files
    today = datetime.date.today().isoformat()
    tmp_dir = Path(workspace) / ".tmp" / today
    tmp_dir.mkdir(parents=True, exist_ok=True)

    try:
        result = _run_with_fallback(
            code=full_code,
            env={
                **os.environ,
                "SA_WORKSPACE": str(Path(workspace).resolve()),
                "SA_TMP_DIR": str(tmp_dir.resolve()),
                "PYTHONIOENCODING": "utf-8",
                "PYTHONUNBUFFERED": "1",
                "PYTHONUTF8": "1",
            },
            cwd=actual_cwd,
            timeout=timeout,
        )

        # Handle case where no Python interpreter is available
        if result is None:
            duration = int((time.monotonic() - start) * 1000)
            return ExecutionResult(
                success=False,
                stdout="",
                stderr="No Python interpreter found. Please install Python with polars, or use the full build with embedded Python.",
                exit_code=-1,
                duration_ms=duration,
            )

        duration = int((time.monotonic() - start) * 1000)
        stdout = result.stdout.decode("utf-8", errors="replace") if isinstance(result.stdout, bytes) else result.stdout
        stderr = result.stderr.decode("utf-8", errors="replace") if isinstance(result.stderr, bytes) else result.stderr
        return ExecutionResult(
            success=result.returncode == 0,
            stdout=stdout,
            stderr=stderr,
            exit_code=result.returncode,
            duration_ms=duration,
        )
    except subprocess.TimeoutExpired:
        duration = int((time.monotonic() - start) * 1000)
        return ExecutionResult(
            success=False,
            stdout="",
            stderr=f"Execution timed out after {timeout} seconds",
            exit_code=-1,
            duration_ms=duration,
        )
    except Exception as e:
        duration = int((time.monotonic() - start) * 1000)
        return ExecutionResult(
            success=False,
            stdout="",
            stderr=str(e),
            exit_code=-1,
            duration_ms=duration,
        )
