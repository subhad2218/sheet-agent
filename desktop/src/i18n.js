// SheetAgent i18n — lightweight runtime translation

const I18N = {
  en: {
    'nav.files': 'Files',
    'nav.history': 'History',
    'nav.settings': 'Settings',
    'project.explorer': 'Project Explorer',
    'context.panel': 'Context Panel',
    'upload.drop': 'Drop or click to upload',
    'upload.uploading': 'Uploading {0} file(s)...',
    'upload.failed': 'Failed: {0}',
    'upload.uploaded': 'Uploaded: {0}',
    'upload.error': 'Error: {0}',
    'upload.done': '{0} file(s) uploaded',
    'files.no_files': 'No files',
    'files.cannot_connect': 'Cannot connect',
    'folder.prompt': 'Enter folder name:',
    'folder.new_folder': 'New Folder',
    'folder.placeholder': 'Folder name',
    'folder.create': 'Create',
    'folder.create_failed': 'Failed to create folder',
    'move.failed': 'Move failed',
    'preview.failed': 'Preview failed',
    'preview.error': 'Preview error',
    'preview.empty': 'Upload files and run a task to preview data',
    'session.new': 'New Session',
    'status.idle': 'Idle',
    'status.running': 'Running',
    'status.stopped': 'Stopped',
    'status.done': 'Done',
    'status.error': 'Error',
    'status.max_turns': 'Max turns',
    'status.fixing': 'Fixing',
    'status.executing': 'executing...',
    'chat.placeholder': 'Ask SheetAgent to process your data... @file.xlsx',
    'chat.thinking': 'Thinking...',
    'chat.max_turns': 'Maximum turns reached. Task may be incomplete.',
    'chat.connection_error': 'Connection error',
    'chat.request_failed': 'Request failed',
    'code.title': 'GENERATED CODE',
    'data.preview': 'Data Preview',
    'data.export': 'EXPORT',
    'history.title': 'Session History',
    'history.subtitle': 'Review and restore previous agent workflows.',
    'history.search': 'Search sessions...',
    'history.all': 'All',
    'history.today': 'Today',
    'history.yesterday': 'Yesterday',
    'history.week': '7 Days',
    'history.older': 'Older',
    'history.success': 'Success',
    'history.error': 'Error',
    'history.active': 'Active',
    'history.no_match': 'No sessions match the current filters',
    'history.load_failed': 'Failed to load history',
    'history.session_failed': 'Failed to load session',
    'history.steps': 'steps',
    'history.empty': 'Session history will appear here',
    'history.delete_confirm': 'Delete this session? This cannot be undone.',
    'history.continue': 'Continue in Workbench',
    'history.back': 'Back',
    'settings.title': 'Settings',
    'settings.llm_config': 'LLM Configuration',
    'settings.environment': 'Environment',
    'settings.provider': 'Provider',
    'settings.api_key': 'API Key',
    'settings.api_key_hint': 'Stored securely in your local environment.',
    'settings.model': 'Model',
    'settings.base_url': 'Base URL (Optional)',
    'settings.workspace': 'Workspace Path',
    'settings.workspace_hint': 'Default directory for file reads/writes by the agent.',
    'settings.save': 'Save & Restart Session',
    'settings.saved': 'Saved!',
    'settings.ollama_hint': 'Ollama runs locally and does not require an API key.',
    'toast.deleted': 'Deleted',
    'toast.delete_failed': 'Delete failed',
    'toast.restore_failed': 'Restore failed',
    'confirm.delete_file': 'Delete file "{0}"? This cannot be undone.',
    'confirm.delete_folder': 'Delete folder "{0}"? This cannot be undone.',
    'context.copy': 'Copy filename',
    'context.delete': 'Delete',
    'dialog.cancel': 'Cancel',
    'dialog.confirm': 'OK',
    'lang.switch': '中文',
    'lang.switch_title': 'Switch Language',
  },
  zh: {
    'nav.files': '文件',
    'nav.history': '历史',
    'nav.settings': '设置',
    'project.explorer': '项目资源管理器',
    'context.panel': '上下文面板',
    'upload.drop': '拖拽或点击上传',
    'upload.uploading': '正在上传 {0} 个文件...',
    'upload.failed': '上传失败：{0}',
    'upload.uploaded': '已上传：{0}',
    'upload.error': '错误：{0}',
    'upload.done': '已上传 {0} 个文件',
    'files.no_files': '暂无文件',
    'files.cannot_connect': '无法连接',
    'folder.prompt': '输入文件夹名称：',
    'folder.new_folder': '新建文件夹',
    'folder.placeholder': '文件夹名称',
    'folder.create': '创建',
    'folder.create_failed': '创建文件夹失败',
    'move.failed': '移动失败',
    'preview.failed': '预览失败',
    'preview.error': '预览错误',
    'preview.empty': '上传文件并运行任务以预览数据',
    'session.new': '新会话',
    'status.idle': '空闲',
    'status.running': '运行中',
    'status.stopped': '已停止',
    'status.done': '完成',
    'status.error': '错误',
    'status.max_turns': '达到最大轮数',
    'status.fixing': '修复中',
    'status.executing': '执行中...',
    'chat.placeholder': '让 SheetAgent 处理你的数据... @file.xlsx',
    'chat.thinking': '思考中...',
    'chat.max_turns': '已达到最大轮数，任务可能未完成。',
    'chat.connection_error': '连接错误',
    'chat.request_failed': '请求失败',
    'code.title': '生成的代码',
    'data.preview': '数据预览',
    'data.export': '导出',
    'history.title': '会话历史',
    'history.subtitle': '查看并恢复之前的 Agent 工作流。',
    'history.search': '搜索会话...',
    'history.all': '全部',
    'history.today': '今天',
    'history.yesterday': '昨天',
    'history.week': '7天',
    'history.older': '更早',
    'history.success': '成功',
    'history.error': '错误',
    'history.active': '进行中',
    'history.no_match': '没有符合当前筛选条件的会话',
    'history.load_failed': '加载历史失败',
    'history.session_failed': '加载会话失败',
    'history.steps': '步',
    'history.empty': '会话历史将显示在这里',
    'history.delete_confirm': '删除此会话？此操作无法撤销。',
    'history.continue': '在工作台中继续',
    'history.back': '返回',
    'settings.title': '设置',
    'settings.llm_config': 'LLM 配置',
    'settings.environment': '环境',
    'settings.provider': '提供商',
    'settings.api_key': 'API 密钥',
    'settings.api_key_hint': '安全存储在本地环境中。',
    'settings.model': '模型',
    'settings.base_url': '基础 URL（可选）',
    'settings.workspace': '工作区路径',
    'settings.workspace_hint': 'Agent 默认的文件读写目录。',
    'settings.save': '保存并重启会话',
    'settings.saved': '已保存！',
    'settings.ollama_hint': 'Ollama 在本地运行，不需要 API 密钥。',
    'toast.deleted': '已删除',
    'toast.delete_failed': '删除失败',
    'toast.restore_failed': '恢复失败',
    'confirm.delete_file': '删除文件 "{0}"？此操作无法撤销。',
    'confirm.delete_folder': '删除文件夹 "{0}"？此操作无法撤销。',
    'context.copy': '复制文件名',
    'context.delete': '删除',
    'dialog.cancel': '取消',
    'dialog.confirm': '确定',
    'lang.switch': 'English',
    'lang.switch_title': '切换语言',
  }
};

let _currentLang = 'en';

// Expose to window for cross-script access (Vite may scope modules)
window._currentLang = _currentLang;
window.I18N = I18N;

function detectLang() {
  const saved = localStorage.getItem('sa_lang');
  if (saved && I18N[saved]) return saved;
  const htmlLang = document.documentElement.lang || navigator.language || 'en';
  if (htmlLang.toLowerCase().startsWith('zh')) return 'zh';
  return 'en';
}

function i18n(key, ...args) {
  let text = I18N[window._currentLang || _currentLang]?.[key] || I18N['en']?.[key] || key;
  args.forEach((arg, i) => {
    text = text.replace(new RegExp(`\\{${i}\\}`, 'g'), arg);
  });
  return text;
}

function setLang(lang) {
  if (!I18N[lang]) return;
  _currentLang = lang;
  window._currentLang = lang;
  localStorage.setItem('sa_lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  applyI18n();
  // Dispatch event so app.js can react
  document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
}

function applyI18n() {
  // Update elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (!key) return;
    const text = i18n(key);
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && 'placeholder' in el) {
      el.placeholder = text;
    } else if (el.childElementCount === 0) {
      el.textContent = text;
    }
    if (el.title) {
      el.title = text;
    }
  });
  // Update elements with data-i18n-html (innerHTML)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (key) el.innerHTML = i18n(key);
  });
}

// Initialize — works with both regular <script> and ES module (Vite) loading
function _initI18n() {
  _currentLang = detectLang();
  window._currentLang = _currentLang;
  applyI18n();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initI18n);
} else {
  _initI18n();
}

// Expose to window (for Vite module scoping / cross-script access)
window._currentLang = _currentLang;
window.I18N = I18N;
window.i18n = i18n;
window.setLang = setLang;
window.applyI18n = applyI18n;
window.detectLang = detectLang;

// ES module exports (for when loaded as type="module")
export { I18N, _currentLang, i18n, setLang, applyI18n, detectLang };
