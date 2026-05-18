"""SheetAgent backend entry point."""

import subprocess
import sys
import uvicorn
from app.api.server import app


def _kill_port_occupant(port: int):
    """Kill any process listening on the given port (Windows only)."""
    try:
        result = subprocess.run(
            f'netstat -ano | findstr ":{port}.*LISTENING"',
            capture_output=True, text=True, shell=True,
        )
        for line in result.stdout.strip().splitlines():
            parts = line.strip().split()
            if parts and parts[-1].isdigit():
                pid = int(parts[-1])
                subprocess.run(f'taskkill /F /PID {pid}', capture_output=True, shell=True)
    except Exception:
        pass


def main():
    _kill_port_occupant(8765)
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")


if __name__ == "__main__":
    main()
