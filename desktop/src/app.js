// SheetAgent Frontend — v9 (Tech-Blue Professional Strict Redesign)

// Ensure i18n.js is loaded first (Vite module scoping requires explicit import)
import './i18n.js';

// 检测 Tauri 环境 - 运行时检测
function checkTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}
const API_BASE = checkTauri() ? 'http://127.0.0.1:8765' : '';

// Tauri invoke helper - 直接使用 __TAURI_INTERNALS__.invoke
async function tauriInvoke(cmd, args = {}) {
  if (!checkTauri()) return null;
  try {
    // Tauri 2.0: 使用全局 invoke 方法
    return await window.__TAURI_INTERNALS__.invoke(cmd, args);
  } catch (e) {
    console.error('Tauri invoke error:', e);
    return null;
  }
}

// ---- Markdown config ----
if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true });
}

// ---- State ----
let currentSessionId = null;
let isStreaming = false;
let currentAssistantEl = null;
let currentReasoningBody = null;
let currentReasoningToggle = null;
let reasoningStepCount = 0;
let currentTextBuffer = '';
let currentAbortController = null;
let currentContentEl = null;
let currentProvider = 'claude';
let currentPreviewPath = null;
let currentPreviewData = null;
let currentDir = '';
let historySessions = [];
let historyFilter = { search: '', period: 'all', status: 'all' };
let currentPageName = 'workbench';

// ---- DOM refs ----
const mainWrapper = document.getElementById('main-wrapper');
const topBar = document.getElementById('top-bar');
const navBtns = document.querySelectorAll('.nav-btn');
const ctxWorkbench = document.getElementById('ctx-workbench');
const viewWorkbench = document.getElementById('view-workbench');
const viewHistory = document.getElementById('view-history');
const viewHistoryDetail = document.getElementById('view-history-detail');
const viewSettings = document.getElementById('view-settings');
const historyDetailChat = document.getElementById('history-detail-chat');
const historyDetailTitle = document.getElementById('history-detail-title');
const historyDetailBack = document.getElementById('history-detail-back');
const historyDetailContinue = document.getElementById('history-detail-continue');
const pageTitle = document.getElementById('page-title');
const sessionDisplay = document.getElementById('session-display');
const agentStatus = document.getElementById('agent-status');
const leftCol = document.getElementById('left-col');
const rightCol = document.getElementById('right-col');
const resizer = document.getElementById('resizer');
const chatArea = document.getElementById('chat-area');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const inputArea = document.getElementById('input-area');
const previewContent = document.getElementById('preview-content');
const previewFilename = document.getElementById('preview-filename');
const sheetTabs = document.getElementById('sheet-tabs');
const btnExport = document.getElementById('btn-export');
const codeToggle = document.getElementById('code-toggle');
const codeBody = document.getElementById('code-body');
const codeArrow = document.getElementById('code-arrow');
const codePreview = document.getElementById('code-preview');
const uploadArea = document.getElementById('upload-area');
const fileUpload = document.getElementById('file-upload');
const uploadProgress = document.getElementById('upload-progress');
const ctxFileList = document.getElementById('ctx-file-list');
const breadcrumb = document.getElementById('breadcrumb');
const btnParentDir = document.getElementById('btn-parent-dir');
const btnNewFolder = document.getElementById('btn-new-folder');
const cfgApiKey = document.getElementById('cfg-api-key');
const cfgApiKeyHint = document.getElementById('cfg-api-key-hint');
const cfgModel = document.getElementById('cfg-model');
const cfgBaseUrl = document.getElementById('cfg-base-url');
const cfgWorkspace = document.getElementById('cfg-workspace');
const cfgWorkspaceBtn = document.getElementById('cfg-workspace-btn');
const saveConfigBtn = document.getElementById('save-config-btn');
const providerBtns = document.querySelectorAll('.provider-btn');
const historyList = document.getElementById('history-list');
const newSessionBtn = document.getElementById('new-session-btn');
const langSwitchBtn = document.getElementById('lang-switch-btn');
const contextMenu = document.getElementById('context-menu');
const ctxCopyBtn = document.getElementById('ctx-copy-btn');
const ctxDeleteBtn = document.getElementById('ctx-delete-btn');

// ---- Init ----
async function _initApp() {
  setupEventListeners();
  setupResizer();
  newSession();

  // 等待后端就绪后再加载配置和文件
  await waitForBackend();
  loadConfig();
}

async function waitForBackend() {
  for (let i = 0; i < 30; i++) {
    try {
      const resp = await fetch(`${API_BASE}/api/config`);
      if (resp.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  console.error('Backend not ready after 15s');
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initApp);
} else {
  _initApp();
}

function setupEventListeners() {
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  if (langSwitchBtn) {
    langSwitchBtn.addEventListener('click', () => {
      const next = window._currentLang === 'en' ? 'zh' : 'en';
      window.setLang(next);
    });
  }

  newSessionBtn.addEventListener('click', newSession);

  sendBtn.addEventListener('click', () => {
    if (isStreaming) handleStop();
    else handleSend();
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) handleStop();
      else handleSend();
    }
  });
  chatInput.addEventListener('input', autoResizeInput);

  saveConfigBtn.addEventListener('click', saveConfig);
  providerBtns.forEach(btn => {
    btn.addEventListener('click', () => selectProvider(btn.dataset.provider));
  });
  if (cfgWorkspaceBtn) {
    cfgWorkspaceBtn.addEventListener('click', selectWorkspaceDirectory);
  }

  // History filters
  const historySearch = document.getElementById('history-search');
  if (historySearch) {
    historySearch.addEventListener('input', (e) => {
      historyFilter.search = e.target.value;
      applyHistoryFilters();
    });
  }
  document.querySelectorAll('.history-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      historyFilter.period = btn.dataset.period;
      document.querySelectorAll('.history-period-btn').forEach(b => {
        b.classList.remove('bg-surface-variant', 'text-on-surface', 'font-semibold');
        b.classList.add('text-on-surface-variant');
      });
      btn.classList.add('bg-surface-variant', 'text-on-surface', 'font-semibold');
      btn.classList.remove('text-on-surface-variant');
      applyHistoryFilters();
    });
  });
  document.querySelectorAll('.history-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      historyFilter.status = btn.dataset.status;
      document.querySelectorAll('.history-status-btn').forEach(b => {
        b.classList.remove('bg-surface-variant', 'text-on-surface', 'font-semibold');
        b.classList.add('text-on-surface-variant');
      });
      btn.classList.add('bg-surface-variant', 'text-on-surface', 'font-semibold');
      btn.classList.remove('text-on-surface-variant');
      applyHistoryFilters();
    });
  });

  // History detail nav
  if (historyDetailBack) {
    historyDetailBack.addEventListener('click', () => switchPage('history'));
  }
  if (historyDetailContinue) {
    historyDetailContinue.addEventListener('click', () => {
      // Copy history detail chat to workbench chat area
      chatArea.innerHTML = historyDetailChat.innerHTML;
      switchPage('workbench');
    });
  }

  codeToggle.addEventListener('click', () => {
    codeBody.classList.toggle('hidden');
    codeArrow.style.transform = codeBody.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  uploadArea.addEventListener('click', () => fileUpload.click());
  fileUpload.addEventListener('change', (e) => uploadFiles(e.target.files));
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('border-primary', 'bg-surface-container');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('border-primary', 'bg-surface-container');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('border-primary', 'bg-surface-container');
    uploadFiles(e.dataTransfer.files);
  });

  inputArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatInput.classList.add('border-primary');
  });
  inputArea.addEventListener('dragleave', () => {
    chatInput.classList.remove('border-primary');
  });
  inputArea.addEventListener('drop', (e) => {
    e.preventDefault();
    chatInput.classList.remove('border-primary');
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files, true);
    }
  });

  btnExport.addEventListener('click', () => {
    if (currentPreviewPath) {
      window.open(`${API_BASE}/api/download/${encodeURIComponent(currentPreviewPath)}`, '_blank');
    }
  });

  btnParentDir.addEventListener('click', goParentDir);
  btnNewFolder.addEventListener('click', createFolder);

  document.addEventListener('langchange', () => {
    // Update mixed icon+text elements
    if (btnExport) btnExport.innerHTML = '<span class="material-symbols-outlined text-[14px]">download</span> ' + window.i18n('data.export');
    if (historyDetailContinue) historyDetailContinue.innerHTML = '<span class="material-symbols-outlined text-[18px]">edit</span> ' + window.i18n('history.continue');
    if (ctxCopyBtn) ctxCopyBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">content_copy</span> ' + window.i18n('context.copy');
    if (ctxDeleteBtn) ctxDeleteBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">delete</span> ' + window.i18n('context.delete');
    if (saveConfigBtn && !saveConfigBtn.innerHTML.includes('check')) {
      saveConfigBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> ' + window.i18n('settings.save');
    }
    // Refresh page title
    const titles = {
      workbench: 'SheetAgent',
      history: window.i18n('history.title'),
      'history-detail': 'SheetAgent',
      settings: window.i18n('settings.title'),
    };
    pageTitle.textContent = titles[currentPageName] || 'SheetAgent';
    // Refresh settings hints
    if (currentProvider !== 'ollama') {
      cfgApiKeyHint.textContent = window.i18n('settings.api_key_hint');
    }
    // Refresh preview empty state if no data
    if (!currentPreviewData) {
      previewContent.innerHTML = '<div class="text-on-surface-variant font-body-sm text-body-sm text-center italic py-10">' + window.i18n('preview.empty') + '</div>';
    }
    // Refresh history list if visible
    if (currentPageName === 'history') {
      applyHistoryFilters();
    }
    // Refresh reasoning panel toggle text
    const rsLabel = document.querySelector('.reasoning-toggle .font-label-caps');
    if (rsLabel) rsLabel.textContent = window.i18n('chat.thinking');
    const rsCount = document.querySelector('.reasoning-toggle .rs-count');
    if (rsCount && reasoningStepCount > 0) rsCount.textContent = `${reasoningStepCount} ${window.i18n('history.steps')}`;
  });
}

function autoResizeInput() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
}

// ---- Directory navigation ----

function updateBreadcrumb() {
  breadcrumb.textContent = currentDir || '/';
  btnParentDir.style.visibility = currentDir ? 'visible' : 'hidden';
}

function goParentDir() {
  if (!currentDir) return;
  const parts = currentDir.split(/[\\/]/).filter(Boolean);
  parts.pop();
  currentDir = parts.join('/');
  updateBreadcrumb();
  loadFiles();
}

function enterDir(name) {
  currentDir = currentDir ? `${currentDir}/${name}` : name;
  updateBreadcrumb();
  loadFiles();
}

async function createFolder() {
  const name = await showInputDialog(
    window.i18n('folder.new_folder') || 'New Folder',
    window.i18n('folder.placeholder') || 'Folder name',
    '',
    window.i18n('folder.create') || 'Create'
  );
  if (!name) return;
  try {
    const resp = await fetch(`${API_BASE}/api/workspace/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: currentDir, name: name }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(err.detail || window.i18n('folder.create_failed'), 'error');
      return;
    }
    loadFiles();
  } catch (e) {
    showToast(window.i18n('folder.create_failed') + ': ' + e.message, 'error');
  }
}

// ---- Resizer ----

function setupResizer() {
  let isDragging = false;

  resizer.addEventListener('mousedown', (e) => {
    isDragging = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const container = viewWorkbench;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(20, Math.min(80, (x / rect.width) * 100));
    leftCol.style.width = pct + '%';
    rightCol.style.flex = '1';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  });
}

// ---- Page switching ----

function switchPage(page) {
  currentPageName = page;
  navBtns.forEach(btn => {
    const active = btn.dataset.page === page;
    btn.classList.toggle('text-primary', active);
    btn.classList.toggle('text-on-surface-variant', !active);
    btn.classList.toggle('border-primary', active);
    btn.classList.toggle('border-transparent', !active);
  });

  ctxWorkbench.classList.toggle('hidden', page !== 'workbench');

  viewWorkbench.classList.toggle('hidden', page !== 'workbench');
  viewHistory.classList.toggle('hidden', page !== 'history');
  viewHistoryDetail.classList.toggle('hidden', page !== 'history-detail');
  viewSettings.classList.toggle('hidden', page !== 'settings');

  if (page === 'settings' || page === 'history-detail') {
    mainWrapper.classList.remove('ml-[292px]');
    mainWrapper.classList.add('ml-[52px]');
    topBar.style.width = 'calc(100% - 52px)';
  } else {
    mainWrapper.classList.add('ml-[292px]');
    mainWrapper.classList.remove('ml-[52px]');
    topBar.style.width = 'calc(100% - 292px)';
  }

  const titles = { workbench: 'SheetAgent', history: window.i18n('history.title'), 'history-detail': 'SheetAgent', settings: window.i18n('settings.title') };
  pageTitle.textContent = titles[page] || 'SheetAgent';

  if (page === 'history') {
    loadHistory();
  }
}

// ---- Provider ----

const PROVIDER_DEFAULTS = {
  claude: { model: 'claude-haiku-4-5-20251001', base_url: '' },
  openai: { model: 'gpt-4o-mini', base_url: '' },
  deepseek: { model: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1' },
  qwen: { model: 'qwen-plus', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  ollama: { model: 'gemma4:e4b', base_url: 'http://localhost:11434/v1' },
};

function selectProvider(provider) {
  currentProvider = provider;
  providerBtns.forEach(btn => {
    const active = btn.dataset.provider === provider;
    btn.classList.toggle('border-primary', active);
    btn.classList.toggle('bg-primary-fixed/10', active);
    btn.classList.toggle('text-primary', active);
    btn.classList.toggle('border-outline-variant', !active);
    btn.classList.toggle('text-on-surface-variant', !active);
  });

  // Update Ollama-specific UI hints
  if (provider === 'ollama') {
    cfgApiKey.placeholder = 'Not needed for Ollama';
    cfgApiKeyHint.textContent = window.i18n('settings.ollama_hint');
    cfgModel.placeholder = 'e.g. gemma4:e4b';
    cfgBaseUrl.placeholder = 'http://localhost:11434/v1';
  } else {
    cfgApiKey.placeholder = 'Enter API Key';
    cfgApiKeyHint.textContent = window.i18n('settings.api_key_hint');
    cfgModel.placeholder = 'e.g. claude-3-sonnet-20240229';
    cfgBaseUrl.placeholder = 'https://api.anthropic.com';
  }

  // Set model/base_url synchronously from local defaults
  const defaults = PROVIDER_DEFAULTS[provider];
  if (defaults) {
    cfgModel.value = defaults.model || '';
    cfgBaseUrl.value = defaults.base_url || '';
  }
}

// ---- Session ----

function newSession() {
  currentSessionId = null;
  sessionDisplay.textContent = window.i18n('session.new');
  chatArea.innerHTML = '';
  clearCodePanel();
  previewContent.innerHTML = '<div class="text-on-surface-variant font-body-sm text-body-sm text-center italic py-10">' + window.i18n('preview.empty') + '</div>';
  previewFilename.textContent = '';
  sheetTabs.classList.add('hidden');
  sheetTabs.innerHTML = '';
  currentPreviewPath = null;
  currentPreviewData = null;
  currentAssistantEl = null;
  currentContentEl = null;
  currentReasoningBody = null;
  currentReasoningToggle = null;
  reasoningStepCount = 0;
  currentTextBuffer = '';
  chatInput.value = '';
  chatInput.style.height = '56px';
  setAgentStatus(window.i18n('status.idle'), '');
}

// ---- Agent status ----

function setAgentStatus(text, type) {
  let dotColor = 'bg-on-surface-variant';
  let textColor = 'text-on-surface-variant';
  if (type === 'running') { dotColor = 'bg-primary animate-pulse'; textColor = 'text-primary'; }
  else if (type === 'error') { dotColor = 'bg-error'; textColor = 'text-error'; }
  else if (type === 'done') { dotColor = 'bg-secondary'; textColor = 'text-secondary'; }
  agentStatus.innerHTML = `<span class="w-2 h-2 rounded-full ${dotColor}"></span><span class="font-label-caps text-label-caps ${textColor}">${text}</span>`;
}

// ---- Stop ----

function handleStop() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  isStreaming = false;
  updateSendButton(false);
  currentAssistantEl = null;
  currentContentEl = null;
  currentReasoningBody = null;
  currentReasoningToggle = null;
  reasoningStepCount = 0;
  currentTextBuffer = '';
  setAgentStatus(window.i18n('status.stopped'), 'error');
}

function updateSendButton(streaming) {
  const icon = sendBtn.querySelector('span');
  if (streaming) {
    sendBtn.classList.remove('bg-primary', 'text-on-primary');
    sendBtn.classList.add('bg-error-container', 'text-on-error-container');
    icon.textContent = 'stop';
  } else {
    sendBtn.classList.remove('bg-error-container', 'text-on-error-container');
    sendBtn.classList.add('bg-primary', 'text-on-primary');
    icon.textContent = 'send';
  }
}

// ---- File upload ----

async function uploadFiles(files, attachToInput = false) {
  if (!files || files.length === 0) return;

  uploadProgress.classList.remove('hidden');
  uploadProgress.classList.remove('text-error');
  uploadProgress.textContent = window.i18n('upload.uploading', files.length);

  const uploadedNames = [];
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    const url = currentDir
      ? `${API_BASE}/api/upload?dir=${encodeURIComponent(currentDir)}`
      : `${API_BASE}/api/upload`;

    try {
      const resp = await fetch(url, { method: 'POST', body: formData });
      if (!resp.ok) {
        const err = await resp.json();
        uploadProgress.textContent = window.i18n('upload.failed', file.name);
        uploadProgress.classList.add('text-error');
        return;
      }
      const result = await resp.json();
      uploadProgress.textContent = window.i18n('upload.uploaded', result.filename);
      uploadedNames.push(result.filename);
    } catch (e) {
      uploadProgress.textContent = window.i18n('upload.error', e.message);
      uploadProgress.classList.add('text-error');
      return;
    }
  }

  uploadProgress.textContent = window.i18n('upload.done', files.length);
  setTimeout(() => uploadProgress.classList.add('hidden'), 2000);
  loadFiles();
  fileUpload.value = '';

  if (attachToInput && uploadedNames.length > 0) {
    const refs = uploadedNames.map(f => `@${f}`).join(' ');
    const current = chatInput.value.trim();
    chatInput.value = current ? `${current} ${refs}` : refs;
    autoResizeInput();
  }
}

// ---- File list ----

async function loadFiles() {
  try {
    const resp = await fetch(`${API_BASE}/api/workspace/files?dir=${encodeURIComponent(currentDir)}`);
    const data = await resp.json();
    updateBreadcrumb();
    ctxFileList.innerHTML = '';

    if ((!data.dirs || data.dirs.length === 0) && (!data.files || data.files.length === 0)) {
      ctxFileList.innerHTML = '<li class="text-on-surface-variant font-body-sm text-body-sm italic px-2">' + window.i18n('files.no_files') + '</li>';
      return;
    }

    // Dirs
    if (data.dirs) {
      for (const d of data.dirs) {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-variant cursor-pointer text-on-surface font-body-sm text-body-sm transition-colors';
        li.dataset.dir = d.name;
        li.title = 'Open folder';
        li.draggable = false;
        li.innerHTML = `<span class="material-symbols-outlined text-[16px] text-primary">folder</span><span class="truncate flex-1">${escapeHtml(d.name)}</span>`;
        li.addEventListener('click', () => enterDir(d.name));

        const dirPath = currentDir ? `${currentDir}/${d.name}` : d.name;
        li.addEventListener('contextmenu', (e) => showContextMenu(e, dirPath, true));

        // Drop zone for folders
        li.addEventListener('dragover', (e) => {
          e.preventDefault();
          li.classList.add('bg-primary/20', 'border', 'border-primary');
        });
        li.addEventListener('dragleave', () => {
          li.classList.remove('bg-primary/20', 'border', 'border-primary');
        });
        li.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          li.classList.remove('bg-primary/20', 'border', 'border-primary');
          const src = e.dataTransfer.getData('text/plain');
          if (!src) return;
          const destDir = currentDir ? `${currentDir}/${d.name}` : d.name;
          await moveFile(src, destDir);
        });

        ctxFileList.appendChild(li);
      }
    }

    // Files
    if (data.files) {
      for (const f of data.files) {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-variant cursor-pointer text-on-surface font-body-sm text-body-sm transition-colors';
        li.dataset.path = f.path;
        li.title = 'Preview (drag to folder to move)';
        li.draggable = true;
        li.innerHTML = `<span class="material-symbols-outlined text-[16px] text-on-surface-variant">${getFileIcon(f.name)}</span><span class="truncate flex-1">${escapeHtml(f.name)}</span><span class="text-on-surface-variant text-[10px] shrink-0">${f.size_mb}MB</span>`;
        li.addEventListener('click', () => previewFile(f.path));

        li.addEventListener('contextmenu', (e) => showContextMenu(e, f.path, false));

        li.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', f.path);
          e.dataTransfer.effectAllowed = 'move';
          li.classList.add('opacity-50');
        });
        li.addEventListener('dragend', () => {
          li.classList.remove('opacity-50');
        });

        ctxFileList.appendChild(li);
      }
    }
  } catch {
    ctxFileList.innerHTML = '<li class="text-error font-body-sm text-body-sm italic px-2">' + window.i18n('files.cannot_connect') + '</li>';
  }
}

async function moveFile(src, destDir) {
  try {
    const resp = await fetch(`${API_BASE}/api/workspace/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ src, dest_dir: destDir }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(err.detail || window.i18n('move.failed'), 'error');
      return;
    }
    loadFiles();
  } catch (e) {
    showToast('Move failed: ' + e.message, 'error');
  }
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = { xlsx: 'table_chart', xls: 'table_chart', csv: 'description', parquet: 'archive', docx: 'article', doc: 'article', png: 'image', jpg: 'image', jpeg: 'image', gif: 'gif', webp: 'image', bmp: 'image' };
  return icons[ext] || 'insert_drive_file';
}

// ---- Data preview (multi-sheet) ----

async function previewFile(path) {
  try {
    const resp = await fetch(`${API_BASE}/api/preview?path=${encodeURIComponent(path)}&n_rows=100`);
    if (!resp.ok) { const err = await resp.json(); showToast(window.i18n('preview.failed') + ': ' + (err.detail || 'Error'), 'error'); return; }
    const data = await resp.json();
    currentPreviewPath = path;
    currentPreviewData = data;

    if (data.type === 'document') {
      showDocumentPreview(path, data);
      return;
    }
    if (data.type === 'image') {
      showImagePreview(path, data);
      return;
    }

    if (data.sheets && Object.keys(data.sheets).length > 1) {
      renderSheetTabs(data.sheets, data.active_sheet || Object.keys(data.sheets)[0]);
    } else {
      sheetTabs.classList.add('hidden');
      sheetTabs.innerHTML = '';
    }

    const activeSheet = data.active_sheet || (data.sheets ? Object.keys(data.sheets)[0] : null);
    if (activeSheet && data.sheets && data.sheets[activeSheet]) {
      showPreviewTable(path, data.sheets[activeSheet]);
    } else {
      showPreviewTable(path, data);
    }
  } catch (e) { showToast(window.i18n('preview.error') + ': ' + e.message, 'error'); }
}

function renderSheetTabs(sheets, activeSheet) {
  sheetTabs.classList.remove('hidden');
  sheetTabs.innerHTML = '';
  Object.keys(sheets).forEach(name => {
    const btn = document.createElement('button');
    const isActive = name === activeSheet;
    btn.className = `px-2 py-0.5 rounded font-body-sm text-body-sm transition-colors ${isActive ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant'}`;
    btn.textContent = name;
    btn.addEventListener('click', () => {
      if (currentPreviewData) {
        renderSheetTabs(currentPreviewData.sheets, name);
        showPreviewTable(currentPreviewPath, currentPreviewData.sheets[name]);
      }
    });
    sheetTabs.appendChild(btn);
  });
}

function showImagePreview(path, data) {
  previewFilename.textContent = `${data.format.toUpperCase()} · ${(data.size_bytes / 1024).toFixed(1)} KB`;
  previewContent.innerHTML = `<div class="flex items-center justify-center h-full p-4"><img src="${data.data_url}" alt="${escapeHtml(path)}" class="max-w-full max-h-full object-contain rounded border border-outline-variant"></div>`;
}

function showDocumentPreview(path, data) {
  previewFilename.textContent = `${data.format.toUpperCase()} · ${data.paragraph_count || 0} paragraphs`;
  let html = '<div class="overflow-auto h-full"><div class="p-4 font-body-md text-body-md text-on-surface whitespace-pre-wrap">';
  html += escapeHtml(data.text_preview || '');
  html += '</div>';
  if (data.tables && data.tables.length > 0) {
    html += '<div class="mt-4 px-4"><div class="font-label-caps text-label-caps text-on-surface-variant mb-2">TABLES</div>';
    data.tables.forEach((tbl, idx) => {
      html += `<div class="mb-4"><div class="font-body-sm text-body-sm text-on-surface-variant mb-1">Table ${idx + 1}</div>`;
      html += '<table class="w-full text-left border-collapse font-body-sm text-body-sm">';
      tbl.forEach((row) => {
        html += '<tr>';
        row.forEach(cell => {
          html += `<td class="px-2 py-1 border border-outline-variant text-on-surface">${escapeHtml(cell)}</td>`;
        });
        html += '</tr>';
      });
      html += '</table></div>';
    });
    html += '</div>';
  }
  html += '</div>';
  previewContent.innerHTML = html;
}

function showPreviewTable(path, data) {
  previewFilename.textContent = `${data.row_count} rows · ${data.columns.length} cols · ${data.preview_rows} shown`;

  let html = '<table class="w-full text-left border-separate border-spacing-0 font-body-sm text-body-sm">';
  html += '<thead class="sticky top-0"><tr><th class="px-3 py-2 border-b border-outline-variant bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps w-[40px]">#</th>';
  for (const col of data.columns) {
    const idx = data.columns.indexOf(col);
    html += `<th class="px-3 py-2 border-b border-outline-variant bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps" title="${escapeHtml(col)}: ${escapeHtml(data.dtypes[idx])}">${escapeHtml(col)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (let i = 0; i < data.data.length; i++) {
    html += `<tr class="hover:bg-surface-variant/50 transition-colors"><td class="px-3 py-1.5 border-b border-outline-variant text-on-surface-variant">${i + 1}</td>`;
    for (const col of data.columns) {
      const val = data.data[i][col];
      html += `<td class="px-3 py-1.5 border-b border-outline-variant text-on-surface">${val === null || val === undefined ? '<span class="text-outline italic">null</span>' : escapeHtml(String(val))}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  previewContent.innerHTML = html;
}

function clearPreview() {
  previewContent.innerHTML = '<div class="text-on-surface-variant font-body-sm text-body-sm text-center italic py-10">' + window.i18n('preview.empty') + '</div>';
  previewFilename.textContent = '';
  sheetTabs.classList.add('hidden');
  sheetTabs.innerHTML = '';
  currentPreviewPath = null;
  currentPreviewData = null;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Context Menu ----
let contextMenuTarget = null;

function showContextMenu(e, path, isDir) {
  e.preventDefault();
  e.stopPropagation();
  contextMenuTarget = { path, isDir };
  contextMenu.classList.remove('hidden');
  const x = Math.min(e.clientX, window.innerWidth - 140);
  const y = Math.min(e.clientY, window.innerHeight - 60);
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  contextMenuTarget = null;
}

async function deleteTarget() {
  if (!contextMenuTarget) return;
  const { path, isDir } = contextMenuTarget;
  const type = isDir ? 'folder' : 'file';
  if (!confirm(`Delete ${type} "${path}"? This cannot be undone.`)) {
    hideContextMenu();
    return;
  }
  try {
    const resp = await fetch(`${API_BASE}/api/workspace/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      showToast(err.detail || window.i18n('toast.delete_failed'), 'error');
      hideContextMenu();
      return;
    }
    showToast(window.i18n('toast.deleted'), 'success');
    loadFiles();
    // If the deleted file is currently previewed, clear preview
    if (!isDir && currentPreviewPath === path) {
      clearPreview();
    }
  } catch (e) {
    showToast(window.i18n('toast.delete_failed') + ': ' + e.message, 'error');
  }
  hideContextMenu();
}

async function copyTarget() {
  if (!contextMenuTarget) return;
  const { path, isDir } = contextMenuTarget;
  hideContextMenu();

  const textToCopy = path;
  let copied = false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(textToCopy);
      copied = true;
    }
  } catch {
    copied = false;
  }

  if (!copied) {
    const ta = document.createElement('textarea');
    ta.value = textToCopy;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;z-index:-1;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      copied = document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
  }

  if (copied) {
    showToast(isDir ? 'Folder path copied' : 'Filename copied', 'success');
  } else {
    showToast('Copy failed', 'error');
  }
}

// Close context menu on any click elsewhere
document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

ctxCopyBtn.addEventListener('click', copyTarget);
ctxDeleteBtn.addEventListener('click', deleteTarget);

// ---- Config ----

async function loadConfig() {
  try {
    const resp = await fetch(`${API_BASE}/api/config`);
    const cfg = await resp.json();
    selectProvider(cfg.provider || 'claude');
    // Override defaults with saved config values
    if (cfg.model) cfgModel.value = cfg.model;
    if (cfg.base_url) cfgBaseUrl.value = cfg.base_url;
    cfgApiKey.value = '';
    cfgWorkspace.value = cfg.workspace || '';
    loadFiles();
  } catch {}
}

async function selectWorkspaceDirectory() {
  try {
    // Tauri环境 - 通过 IPC 调用 Rust 命令
    if (checkTauri()) {
      const selected = await tauriInvoke('select_directory');
      if (selected) {
        cfgWorkspace.value = selected;
        console.log('Selected workspace:', selected);
        // 自动保存配置并刷新文件列表
        await saveConfig();
        currentDir = '';
        loadFiles();
        showToast(window.i18n('settings.workspace_updated') || 'Workspace updated', 'success');
      }
      return;
    }

    // 浏览器环境 - showDirectoryPicker 无法获取完整路径，改为手动输入
    // 但先尝试获取目录名作为提示
    let hintName = '';
    try {
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker();
        hintName = dirHandle?.name || '';
      }
    } catch (e) {
      // 用户取消或权限拒绝，继续手动输入流程
    }

    // 显示输入对话框
    const path = await showInputDialog(
      window.i18n('settings.workspace') || 'Workspace Path',
      window.i18n('settings.workspace_hint') || 'Enter full directory path (e.g. C:\\Users\\YourName\\Documents\\MyWorkspace)',
      hintName
    );
    if (path) {
      cfgWorkspace.value = path;
      // 自动保存配置并刷新文件列表
      await saveConfig();
      currentDir = '';
      loadFiles();
      showToast(window.i18n('settings.workspace_updated') || 'Workspace updated', 'success');
    }
  } catch (e) {
    console.error('Directory selection failed:', e);
  }
}

async function saveConfig() {
  const body = {
    provider: currentProvider,
    model: cfgModel.value || undefined,
    api_key: cfgApiKey.value || undefined,
    base_url: cfgBaseUrl.value || undefined,
    workspace: cfgWorkspace.value || undefined,
  };
  try {
    const resp = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      saveConfigBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check</span> ' + window.i18n('settings.saved');
      setTimeout(() => { saveConfigBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> ' + window.i18n('settings.save'); }, 1500);
      loadFiles();
    } else {
      const err = await resp.json();
      alert(window.i18n('chat.request_failed') + ': ' + (err.detail || 'Error'));
    }
  } catch (e) {
    alert('Failed to save config: ' + e.message);
  }
}

// ---- Chat ----

async function handleSend() {
  let message = chatInput.value.trim();
  if ((!message) || isStreaming) return;

  chatInput.value = '';
  chatInput.style.height = '56px';
  addMessage('user', message);

  isStreaming = true;
  updateSendButton(true);
  setAgentStatus(window.i18n('status.running'), 'running');

  currentAbortController = new AbortController();

  try {
    const resp = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: currentSessionId, stream: true, current_dir: currentDir, lang: window._currentLang }),
      signal: currentAbortController.signal,
    });

    if (!resp.ok) {
      const err = await resp.json();
      addMessage('error', err.detail || window.i18n('chat.request_failed'));
      setAgentStatus(window.i18n('status.error'), 'error');
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try { handleStreamEvent(JSON.parse(data)); } catch {}
        }
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      addMessage('error', window.i18n('chat.connection_error') + ': ' + e.message);
      setAgentStatus(window.i18n('status.error'), 'error');
    }
  } finally {
    isStreaming = false;
    currentAbortController = null;
    updateSendButton(false);
    currentAssistantEl = null;
    currentContentEl = null;
    currentReasoningBody = null;
    currentReasoningToggle = null;
    reasoningStepCount = 0;
    currentTextBuffer = '';
    loadFiles();
    setAgentStatus(window.i18n('status.idle'), '');
  }
}

function _ensureAssistantBubble() {
  if (!currentAssistantEl) {
    currentAssistantEl = addMessage('assistant', '');
    currentAssistantEl.innerHTML = '';
    currentContentEl = document.createElement('div');
    currentContentEl.className = 'assistant-content';
    currentAssistantEl.appendChild(currentContentEl);
  }
  if (!currentContentEl) {
    currentContentEl = document.createElement('div');
    currentContentEl.className = 'assistant-content';
    currentAssistantEl.appendChild(currentContentEl);
  }
}


function handleStreamEvent(event) {
  switch (event.type) {
    case 'session':
      currentSessionId = event.session_id;
      sessionDisplay.textContent = `Session ${event.session_id}`;
      break;

    case 'turn_start':
      if (!currentAssistantEl) {
        currentAssistantEl = addMessage('assistant', '');
        currentAssistantEl.innerHTML = '';
        currentContentEl = document.createElement('div');
        currentContentEl.className = 'assistant-content';
        currentAssistantEl.appendChild(currentContentEl);
      }
      currentTextBuffer = '';
      break;

    case 'text':
      _ensureAssistantBubble();
      currentTextBuffer += event.content;
      currentContentEl.innerHTML = renderMarkdown(currentTextBuffer);
      scrollChatBottom();
      break;

    case 'tool_call':
      _ensureAssistantBubble();

      ensureReasoningPanel();
      reasoningStepCount++;
      const stepId = `rs-${reasoningStepCount}`;

      let stepHtml = '';
      if (event.name === 'execute_python' && event.arguments?.code) {
        stepHtml = `<div class="font-label-caps text-label-caps text-on-surface-variant mb-1">${escapeHtml(event.name)}</div><pre class="bg-surface-container-high p-2 rounded overflow-auto font-code-block text-code-block text-on-surface my-1 text-[11px] leading-4"><code>${escapeHtml(event.arguments.code)}</code></pre>`;
        appendToCodePanel(`--- execute_python ---\n${event.arguments.code}\n`);
      } else {
        stepHtml = `<div class="font-label-caps text-label-caps text-on-surface-variant mb-1">${escapeHtml(event.name)}</div><div class="font-code-block text-code-block text-on-surface-variant text-[11px] leading-4">${escapeHtml(JSON.stringify(event.arguments, null, 2))}</div>`;
        appendToCodePanel(`--- ${event.name} ---\n${JSON.stringify(event.arguments, null, 2)}\n`);
      }

      const stepEl = document.createElement('div');
      stepEl.id = stepId;
      stepEl.className = 'mb-2 pb-2 border-b border-outline-variant/50 last:border-0';
      stepEl.innerHTML = stepHtml + `<div class="rs-status mt-1 font-label-caps text-label-caps text-secondary">${window.i18n('status.executing')}</div>`;
      currentReasoningBody.appendChild(stepEl);
      updateReasoningToggle();
      break;

    case 'tool_exec_end':
      let isError = false;
      try {
        const parsed = JSON.parse(event.result);
        if (parsed.success === false && parsed.stderr) isError = true;
      } catch {}

      const lastStep = currentReasoningBody?.querySelector(`#rs-${reasoningStepCount} .rs-status`);
      if (lastStep) {
        lastStep.textContent = isError ? window.i18n('status.error') : window.i18n('status.done');
        lastStep.className = `rs-status mt-1 font-label-caps text-label-caps ${isError ? 'text-error' : 'text-primary'}`;
      }

      appendToCodePanel(`Result:\n${event.result}\n\n`);
      currentTextBuffer = '';
      break;

    case 'auto_fix':
      {
        const fixBadge = document.createElement('div');
        fixBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded bg-tertiary-container/20 text-tertiary border border-tertiary/30 mb-2 font-body-sm text-body-sm';
        fixBadge.innerHTML = `<span class="material-symbols-outlined text-[14px]">auto_fix</span>${window.i18n('status.fixing')} (${event.attempt}/${event.max})...`;
        if (currentReasoningBody) {
          currentReasoningBody.appendChild(fixBadge);
        }
        setAgentStatus(window.i18n('status.fixing') + ` ${event.attempt}/${event.max}`, 'running');
      }
      break;

    case 'done':
      if (event.content) {
        _ensureAssistantBubble();
        currentContentEl.innerHTML = renderMarkdown(event.content);
        const mentionedFiles = event.content.match(/[\w\-一-鿿]+\.(xlsx|csv|parquet|docx|doc|png|jpg|jpeg|gif|webp)/gi);
        if (mentionedFiles) {
          const fileName = mentionedFiles[0];
          const fullPath = currentDir ? `${currentDir}/${fileName}` : fileName;
          previewFile(fullPath);
        }
      }
      currentTextBuffer = '';
      setAgentStatus(window.i18n('status.done'), 'done');
      scrollChatBottom();
      break;

    case 'max_turns':
      addMessage('error', window.i18n('chat.max_turns'));
      setAgentStatus(window.i18n('status.max_turns'), 'error');
      break;

    case 'error':
      addMessage('error', event.content || window.i18n('chat.request_failed'));
      setAgentStatus(window.i18n('status.error'), 'error');
      break;
  }
}

// ---- Reasoning panel (collapsible) ----

function ensureReasoningPanel() {
  _ensureAssistantBubble();
  if (!currentReasoningBody) {
    const panel = document.createElement('div');
    panel.className = 'reasoning-panel mt-2 border border-outline-variant rounded bg-surface-container-low';

    const toggle = document.createElement('div');
    toggle.className = 'reasoning-toggle flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-surface-variant/50 transition-colors';
    toggle.innerHTML = `<span class="material-symbols-outlined text-[14px] text-on-surface-variant transition-transform">psychology</span><span class="font-label-caps text-label-caps text-on-surface-variant">${window.i18n('chat.thinking')}</span><span class="rs-count font-body-sm text-body-sm text-on-surface-variant ml-auto"></span><span class="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform rs-arrow">keyboard_arrow_down</span>`;
    toggle.addEventListener('click', () => {
      const body = panel.querySelector('.reasoning-body');
      const arrow = panel.querySelector('.rs-arrow');
      body.classList.toggle('hidden');
      arrow.style.transform = body.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    const body = document.createElement('div');
    body.className = 'reasoning-body hidden px-3 py-2 border-t border-outline-variant';

    panel.appendChild(toggle);
    panel.appendChild(body);

    // Insert BEFORE the content div so innerHTML updates don't destroy it
    if (currentContentEl) {
      currentAssistantEl.insertBefore(panel, currentContentEl);
    } else {
      currentAssistantEl.appendChild(panel);
    }

    currentReasoningBody = body;
    currentReasoningToggle = toggle;
  }
}

function updateReasoningToggle() {
  if (currentReasoningToggle) {
    const countEl = currentReasoningToggle.querySelector('.rs-count');
    if (countEl) countEl.textContent = `${reasoningStepCount} ${window.i18n('history.steps')}`;
  }
}

// ---- Code panel ----

function appendToCodePanel(text) {
  codePreview.textContent += text;
  codeBody.scrollTop = codeBody.scrollHeight;
  if (codeBody.classList.contains('hidden')) {
    codeBody.classList.remove('hidden');
    codeArrow.style.transform = 'rotate(180deg)';
  }
}

function clearCodePanel() {
  codePreview.textContent = '';
  codeBody.classList.add('hidden');
  codeArrow.style.transform = 'rotate(0deg)';
}

// ---- Markdown ----

function renderMarkdown(text) {
  if (!text) return '';
  if (typeof marked !== 'undefined') {
    try { return marked.parse(text); } catch {}
  }
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre class="bg-surface-container-high p-3 rounded overflow-auto font-code-block text-code-block text-on-surface my-3"><code>${escapeHtml(code)}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code class="bg-surface-variant px-1.5 py-0.5 rounded text-on-surface font-code-block text-code-block">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-on-surface">$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ---- DOM helpers ----

function addMessage(role, text, targetContainer = chatArea) {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex ' + (role === 'user' ? 'justify-end' : 'justify-start');

  const bubble = document.createElement('div');
  if (role === 'user') {
    bubble.className = 'rounded-2xl px-5 py-3.5 max-w-[85%] font-body-md text-body-md bg-primary-container text-on-primary-container min-w-0 overflow-x-hidden break-words leading-relaxed';
    bubble.textContent = text;
  } else if (role === 'error') {
    bubble.className = 'rounded-2xl px-5 py-3.5 max-w-[85%] font-body-md text-body-md bg-error-container text-on-error-container border border-error min-w-0 overflow-x-hidden break-words leading-relaxed';
    bubble.textContent = text;
  } else if (role === 'assistant') {
    bubble.className = 'markdown-body rounded-2xl px-5 py-3.5 max-w-[90%] font-body-md text-body-md bg-surface-container-high text-on-surface min-w-0 overflow-x-hidden break-words leading-relaxed';
    bubble.innerHTML = text;
  } else {
    bubble.className = 'rounded-2xl px-5 py-3.5 max-w-[85%] font-body-md text-body-md bg-surface-container-high text-on-surface min-w-0 overflow-x-hidden break-words leading-relaxed';
    bubble.textContent = text;
  }

  wrapper.appendChild(bubble);
  targetContainer.appendChild(wrapper);
  targetContainer.scrollTop = targetContainer.scrollHeight;
  return bubble;
}

function showToast(text, type = 'error') {
  const el = document.createElement('div');
  const bg = type === 'error' ? 'bg-error-container text-on-error-container border-error' : 'bg-surface-container-high text-on-surface border-outline-variant';
  el.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg border shadow-lg font-body-sm text-body-sm z-[100] ${bg} transition-opacity duration-300`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('opacity-0');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ---- Custom Dialog ----

function showInputDialog(title, placeholder = '', defaultValue = '', confirmText = null) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/60 z-[200] flex items-center justify-center backdrop-blur-sm';

    const dialog = document.createElement('div');
    dialog.className = 'bg-surface-container border border-outline-variant rounded-lg shadow-2xl p-6 w-[420px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-150';
    dialog.innerHTML = `
      <h3 class="font-h2 text-h2 text-on-surface mb-4">${escapeHtml(title)}</h3>
      <input type="text" class="dialog-input w-full bg-surface-container-highest border border-outline-variant rounded-lg py-2.5 px-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-body-md transition-colors" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}"/>
      <div class="flex justify-end gap-3 mt-5">
        <button class="dialog-cancel px-4 py-2 rounded-lg text-on-surface-variant hover:bg-surface-variant font-body-md transition-colors">${window.i18n('dialog.cancel') || 'Cancel'}</button>
        <button class="dialog-confirm px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/80 font-body-md font-semibold transition-colors">${escapeHtml(confirmText || window.i18n('dialog.confirm') || 'OK')}</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const input = dialog.querySelector('.dialog-input');
    const cancelBtn = dialog.querySelector('.dialog-cancel');
    const confirmBtn = dialog.querySelector('.dialog-confirm');

    input.focus();
    input.select();

    const close = (value) => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 150);
      resolve(value);
    };

    cancelBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => close(input.value.trim() || null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value.trim() || null);
      if (e.key === 'Escape') close(null);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
  });
}

function scrollChatBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '...';
}

// ---- Session History ----

function getStatusLabel(status) {
  const map = { success: window.i18n('history.success'), error: window.i18n('history.error'), active: window.i18n('history.active') };
  const colors = { success: 'bg-secondary', error: 'bg-error', active: 'bg-primary' };
  return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-high border border-outline-variant font-body-sm text-body-sm"><span class="w-2 h-2 rounded-full ${colors[status] || 'bg-on-surface-variant'}"></span>${map[status] || status}</span>`;
}

function renderHistoryList(sessions) {
  historyList.innerHTML = '';
  if (!sessions.length) {
    historyList.innerHTML = '<div class="text-on-surface-variant font-body-sm text-body-sm text-center italic py-10">' + window.i18n('history.no_match') + '</div>';
    return;
  }
  sessions.forEach(sess => {
    const dateStr = new Date(sess.updated_at * 1000).toLocaleString();
    const el = document.createElement('div');
    el.className = 'bg-surface-container-low border border-outline-variant rounded-lg p-4 flex flex-col gap-2 hover:border-primary transition-colors cursor-pointer';
    el.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="font-body-md text-body-md text-on-surface font-semibold truncate pr-2">${escapeHtml(sess.title || 'Untitled')}</div>
        <button class="delete-session-btn p-1 text-on-surface-variant hover:text-error transition-colors" data-id="${sess.session_id}" title="${window.i18n('context.delete')}">
          <span class="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
      <div class="flex items-center gap-3 text-on-surface-variant font-body-sm text-body-sm flex-wrap">
        ${getStatusLabel(sess.status)}
        <span>${sess.turn_count} ${window.i18n('history.steps')}</span>
        <span>${dateStr}</span>
      </div>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.delete-session-btn')) return;
      restoreSession(sess.session_id);
    });
    el.querySelector('.delete-session-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistorySession(sess.session_id);
    });
    historyList.appendChild(el);
  });
}

function applyHistoryFilters() {
  let result = [...historySessions];
  // Search filter
  if (historyFilter.search) {
    const term = historyFilter.search.toLowerCase();
    result = result.filter(s => (s.title || '').toLowerCase().includes(term));
  }
  // Period filter
  if (historyFilter.period !== 'all') {
    const now = Date.now() / 1000;
    const day = 86400;
    switch (historyFilter.period) {
      case 'today':
        result = result.filter(s => now - s.updated_at < day);
        break;
      case 'yesterday':
        result = result.filter(s => {
          const diff = now - s.updated_at;
          return diff >= day && diff < 2 * day;
        });
        break;
      case 'week':
        result = result.filter(s => now - s.updated_at < 7 * day);
        break;
      case 'older':
        result = result.filter(s => now - s.updated_at >= 7 * day);
        break;
    }
  }
  // Status filter
  if (historyFilter.status !== 'all') {
    result = result.filter(s => s.status === historyFilter.status);
  }
  renderHistoryList(result);
}

async function loadHistory() {
  try {
    const resp = await fetch(`${API_BASE}/api/sessions`);
    if (!resp.ok) { historyList.innerHTML = '<div class="text-error font-body-sm text-body-sm text-center italic py-10">' + window.i18n('history.load_failed') + '</div>'; return; }
    const data = await resp.json();
    historySessions = data.sessions || [];
    applyHistoryFilters();
  } catch {
    historyList.innerHTML = '<div class="text-error font-body-sm text-body-sm text-center italic py-10">' + window.i18n('history.load_failed') + '</div>';
  }
}

async function restoreSession(sessionId) {
  try {
    const resp = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
    if (!resp.ok) { showToast(window.i18n('history.session_failed'), 'error'); return; }
    const data = await resp.json();
    currentSessionId = data.session_id;
    sessionDisplay.textContent = `Session ${data.session_id}`;
    // Render to history detail view
    historyDetailChat.innerHTML = '';
    historyDetailTitle.textContent = data.title || `Session ${data.session_id}`;
    // Replay messages
    for (const m of data.messages) {
      if (m.role === 'user') {
        addMessage('user', m.content, historyDetailChat);
      } else if (m.role === 'assistant') {
        const text = m.text || '';
        const bubble = addMessage('assistant', '', historyDetailChat);
        let html = renderMarkdown(text);
        if (m.tool_calls && m.tool_calls.length > 0) {
          html += '<div class="mt-2 border border-outline-variant rounded bg-surface-container-low">';
          html += '<div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"><span class="material-symbols-outlined text-[14px] text-on-surface-variant">psychology</span><span class="font-label-caps text-label-caps text-on-surface-variant">Thinking</span><span class="rs-count font-body-sm text-body-sm text-on-surface-variant ml-auto">' + m.tool_calls.length + ' steps</span></div>';
          html += '<div class="px-3 py-2 border-t border-outline-variant">';
          for (const tc of m.tool_calls) {
            html += `<div class="mb-2 pb-2 border-b border-outline-variant/50 last:border-0"><div class="font-label-caps text-label-caps text-on-surface-variant mb-1">${escapeHtml(tc.name)}</div>`;
            if (tc.name === 'execute_python' && tc.arguments?.code) {
              html += `<pre class="bg-surface-container-high p-2 rounded overflow-auto font-code-block text-code-block text-on-surface my-1 text-[11px] leading-4"><code>${escapeHtml(tc.arguments.code)}</code></pre>`;
            } else {
              html += `<div class="font-code-block text-code-block text-on-surface-variant text-[11px] leading-4">${escapeHtml(JSON.stringify(tc.arguments, null, 2))}</div>`;
            }
            html += '</div>';
          }
          html += '</div></div>';
        }
        bubble.innerHTML = html;
      }
    }
    switchPage('history-detail');
  } catch (e) {
    showToast(window.i18n('toast.restore_failed') + ': ' + e.message, 'error');
  }
}

async function deleteHistorySession(sessionId) {
  if (!confirm(window.i18n('history.delete_confirm'))) return;
  try {
    const resp = await fetch(`${API_BASE}/api/sessions/${sessionId}`, { method: 'DELETE' });
    if (resp.ok) {
      showToast(window.i18n('toast.deleted'), 'success');
      loadHistory();
      if (currentSessionId === sessionId) {
        newSession();
      }
    } else {
      showToast(window.i18n('toast.delete_failed'), 'error');
    }
  } catch {
    showToast(window.i18n('toast.delete_failed'), 'error');
  }
}
