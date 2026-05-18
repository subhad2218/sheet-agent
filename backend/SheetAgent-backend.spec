# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for SheetAgent backend.
Backend includes polars for preview, sandbox uses embedded Python.
"""

import sys
from pathlib import Path

block_cipher = None

backend_dir = Path(SPECPATH)

# Exclude large packages not needed in backend
EXCLUDES = [
    'tkinter', 'test', 'tests',
    # Heavy ML libraries
    'tensorflow', 'torch', 'torchaudio', 'torchvision',
    'onnxruntime', 'transformers', 'datasets',
    'sklearn', 'scipy',
    # Imaging (not needed)
    'PIL', 'pillow', 'cv2', 'opencv',
    # Dev tools
    'jupyter', 'ipython', 'notebook',
    'selenium', 'playwright',
    # Misc large
    'altair', 'narwhals', 'librosa', 'matplotlib',
]

a = Analysis(
    ['run.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[
        ('config.yaml', '.'),
    ],
    hiddenimports=[
        # FastAPI
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'starlette',
        'starlette.responses',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'pydantic',
        'pydantic_core',
        'pydantic_settings',
        # HTTP client
        'httpx',
        'httpcore',
        'h11',
        'anyio',
        'anyio.from_thread',
        # Data processing (for preview)
        'polars',
        'polars.polars',
        'fastexcel',
        'openpyxl',
        # LLM providers
        'anthropic',
        'openai',
        'tiktoken',
        'tiktoken_ext',
        'tiktoken_ext.openai_public',
        # Config
        'yaml',
        # Misc
        'appdirs',
        'toml',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=EXCLUDES,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='sheet-agent-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console for debugging, set to False for production
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
