// ===== App State Management =====
const AppState = {
    apiKey: null,
    isPaused: false,
    files: [],
    config: {
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        safeMode: 'balanced',
        batchSize: 10,
        translateDialogue: true,
        translateNames: true,
        translateDescriptions: true,
        smartFiltering: true,
        contextAware: true,
        qualityCheck: true,
        preserveFormatting: true,
        skipTranslated: true
    },
    stats: {
        filesProcessed: 0,
        textsTranslated: 0,
        estimatedCost: 0
    },
    load() {
        const storedKey = localStorage.getItem('deepseek_api_key');
        if (storedKey) {
            this.apiKey = atob(storedKey); // Base64 decode
            document.getElementById('api-key-input').value = this.apiKey;
            document.getElementById('key-status').textContent = '✅ Key đã lưu thành công!';
            document.getElementById('key-status').classList.remove('status-hidden', 'status-error');
            document.getElementById('key-status').classList.add('status-success');
            this.updateStartButton();
        }
    },
    saveApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('deepseek_api_key', btoa(key)); // Base64 encode
    },
    updateStats() {
        document.getElementById('files-count').textContent = this.files.length;
        document.getElementById('translated-count').textContent = this.stats.textsTranslated;
        document.getElementById('estimated-cost').textContent = `$${this.stats.estimatedCost.toFixed(4)}`;
    },
    updateProgress(percentage) {
        document.getElementById('overall-progress').style.width = `${percentage}%`;
        document.getElementById('progress-text').textContent = `${Math.round(percentage)}%`;
    },
    setStatus(text, type = 'info') {
        const statusEl = document.getElementById('status-text');
        statusEl.textContent = text;
        statusEl.className = `status-${type}`;
    }
};

// ===== Logger Implementation =====
const Logger = {
    info(msg) {
        console.log(`%c[INFO] ${msg}`, 'color: #00ffea');
        LivePreview.addLog(msg, 'info');
    },
    warning(msg) {
        console.warn(`%c[WARNING] ${msg}`, 'color: #f59e0b');
        LivePreview.addLog(msg, 'warning');
    },
    error(msg) {
        console.error(`%c[ERROR] ${msg}`, 'color: #ef4444');
        LivePreview.addLog(msg, 'error');
    },
    success(msg) {
        console.log(`%c[SUCCESS] ${msg}`, 'color: #10b981');
        LivePreview.addLog(msg, 'success');
    }
};

// ===== Live Preview Implementation =====
const LivePreview = {
    container: document.getElementById('live-preview'),
    addTranslation(original, translated, filename, type = 'translation') {
        const item = document.createElement('div');
        item.className = `preview-item ${type === 'error' ? 'preview-error' : ''} ${type === 'protected' ? 'preview-protected' : ''}`;
        
        let headerIcon = '✅';
        if (type === 'error') headerIcon = '❌';
        if (type === 'protected') headerIcon = '🛡️';
        
        item.innerHTML = `
            <div class="preview-header">${headerIcon} ${filename} - ${new Date().toLocaleTimeString()}</div>
            <div class="preview-original">Original: ${this.escapeHtml(original)}</div>
            <div class="preview-translated">Translated: ${this.escapeHtml(translated)}</div>
        `;
        
        this.container.appendChild(item);
        this.container.scrollTop = this.container.scrollHeight;
        this.removePlaceholder();
    },
    addLog(msg, type) {
        const item = document.createElement('div');
        item.className = `preview-log log-${type}`;
        item.textContent = `[${type.toUpperCase()}] ${msg}`;
        this.container.appendChild(item);
        this.container.scrollTop = this.container.scrollHeight;
        this.removePlaceholder();
    },
    showBatchProgress(current, total, filename) {
        this.addLog(`Batch \( {current + 1}/ \){total} hoàn thành cho ${filename}`, 'info');
    },
    removePlaceholder() {
        const placeholder = this.container.querySelector('.placeholder');
        if (placeholder) placeholder.remove();
    },
    escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

// ===== Progress Manager =====
const ProgressManager = {
    updateFileProgress(percentage) {
        // Có thể thêm progress bar cho từng file nếu cần
        console.log(`File progress: ${percentage}%`);
    },
    updateOverallProgress() {
        const totalFiles = AppState.files.length;
        const processed = AppState.stats.filesProcessed;
        const percentage = totalFiles > 0 ? (processed / totalFiles) * 100 : 0;
        AppState.updateProgress(percentage);
    },
    updateStats() {
        AppState.updateStats();
    }
};

// ===== Event Handlers =====
document.addEventListener('DOMContentLoaded', () => {
    AppState.load();
    initEventListeners();
    initPWA();
});

function initEventListeners() {
    // API Key
    document.getElementById('save-key').addEventListener('click', saveApiKey);
    document.getElementById('toggle-key-visibility').addEventListener('click', toggleKeyVisibility);
    
    // Config
    document.getElementById('source-lang').addEventListener('change', updateConfig);
    document.getElementById('target-lang').addEventListener('change', updateConfig);
    document.getElementById('safe-mode').addEventListener('change', updateConfig);
    document.getElementById('batch-size').addEventListener('input', updateConfig);
    document.querySelectorAll('.checkbox-group input').forEach(checkbox => {
        checkbox.addEventListener('change', updateConfig);
    });
    
    // Upload
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    document.getElementById('select-files').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFiles);
    
    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    
    // Controls
    document.getElementById('start-translation').addEventListener('click', startTranslation);
    document.getElementById('pause-translation').addEventListener('click', togglePause);
    document.getElementById('clear-all').addEventListener('click', clearAll);
    
    // Theme (nếu thêm light theme sau)
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
}

function saveApiKey() {
    const key = document.getElementById('api-key-input').value.trim();
    if (!key) {
        showKeyStatus('❌ Vui lòng nhập API key!', 'error');
        return;
    }
    
    AppState.saveApiKey(key);
    showKeyStatus('✅ Key đã lưu thành công!', 'success');
    AppState.updateStartButton();
}

function showKeyStatus(msg, type) {
    const statusEl = document.getElementById('key-status');
    statusEl.textContent = msg;
    statusEl.classList.remove('status-hidden', 'status-success', 'status-error');
    statusEl.classList.add(`status-${type}`);
}

function toggleKeyVisibility() {
    const input = document.getElementById('api-key-input');
    const icon = this.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

function updateConfig() {
    AppState.config.sourceLanguage = document.getElementById('source-lang').value;
    AppState.config.targetLanguage = document.getElementById('target-lang').value;
    AppState.config.safeMode = document.getElementById('safe-mode').value;
    AppState.config.batchSize = parseInt(document.getElementById('batch-size').value) || 10;
    AppState.config.translateDialogue = document.getElementById('translate-dialogue').checked;
    AppState.config.translateNames = document.getElementById('translate-names').checked;
    AppState.config.translateDescriptions = document.getElementById('translate-descriptions').checked;
    AppState.config.smartFiltering = document.getElementById('smart-filtering').checked;
    AppState.config.contextAware = document.getElementById('context-aware').checked;
    AppState.config.qualityCheck = document.getElementById('quality-check').checked;
    AppState.config.preserveFormatting = document.getElementById('preserve-formatting').checked;
    
    AppState.updateStartButton();
}

AppState.updateStartButton = function() {
    const startBtn = document.getElementById('start-translation');
    startBtn.disabled = !AppState.apiKey || AppState.files.length === 0;
};

function handleFiles(files) {
    const fileList = document.getElementById('file-list');
    Array.from(files).forEach(file => {
        if (file.name.endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    AppState.files.push({ name: file.name, data: jsonData, status: 'pending' });
                    renderFileItem(file.name, 'pending');
                } catch (err) {
                    Logger.error(`File ${file.name} không phải JSON hợp lệ: ${err.message}`);
                }
            };
            reader.readAsText(file);
        }
    });
    AppState.updateStartButton();
    AppState.updateStats();
}

function renderFileItem(filename, status) {
    const fileList = document.getElementById('file-list');
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
        <span>${filename}</span>
        <span class="status status-\( {status}"> \){status.toUpperCase()}</span>
    `;
    fileList.appendChild(item);
}

async function startTranslation() {
    if (!AppState.apiKey) return;
    
    const startBtn = document.getElementById('start-translation');
    const pauseBtn = document.getElementById('pause-translation');
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    AppState.isPaused = false;
    AppState.setStatus('Đang dịch...', 'processing');
    
    for (let i = 0; i < AppState.files.length; i++) {
        if (AppState.isPaused) {
            AppState.setStatus('Tạm dừng', 'paused');
            break;
        }
        
        const file = AppState.files[i];
        updateFileStatus(file.name, 'processing');
        
        try {
            const translatedData = await AutoTransEngine.translateFile(
                file.data,
                file.name,
                AppState.config
            );
            
            downloadTranslatedFile(file.name, translatedData);
            file.status = 'done';
            updateFileStatus(file.name, 'done');
            AppState.stats.filesProcessed++;
            ProgressManager.updateOverallProgress();
            
        } catch (error) {
            Logger.error(`Lỗi dịch ${file.name}: ${error.message}`);
            file.status = 'error';
            updateFileStatus(file.name, 'error');
        }
    }
    
    if (!AppState.isPaused) {
        AppState.setStatus('Hoàn thành!', 'success');
        startBtn.disabled = false;
        pauseBtn.disabled = true;
    }
}

function updateFileStatus(filename, status) {
    const items = document.querySelectorAll('.file-item');
    items.forEach(item => {
        if (item.querySelector('span').textContent === filename) {
            const statusEl = item.querySelector('.status');
            statusEl.className = `status status-${status}`;
            statusEl.textContent = status.toUpperCase();
        }
    });
}

function downloadTranslatedFile(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translated_${filename}`;
    a.click();
    URL.revokeObjectURL(url);
}

function togglePause() {
    AppState.isPaused = !AppState.isPaused;
    this.textContent = AppState.isPaused ? 'Tiếp tục' : 'Tạm dừng';
    this.querySelector('i').className = AppState.isPaused ? 'fas fa-play' : 'fas fa-pause';
    if (!AppState.isPaused) {
        startTranslation(); // Resume
    }
}

function clearAll() {
    AppState.files = [];
    AppState.stats.filesProcessed = 0;
    AppState.stats.textsTranslated = 0;
    AppState.stats.estimatedCost = 0;
    document.getElementById('file-list').innerHTML = '';
    LivePreview.container.innerHTML = '<p class="placeholder">Các bản dịch sẽ xuất hiện tại đây khi quá trình bắt đầu...</p>';
    AppState.updateStats();
    AppState.updateProgress(0);
    AppState.setStatus('Sẵn sàng', 'info');
    AppState.updateStartButton();
}

function toggleTheme() {
    // Hiện tại chỉ dark theme, có thể thêm light sau
    console.log('Theme toggle - coming soon!');
}

// ===== PWA Installation =====
function initPWA() {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('install-btn').style.display = 'block';
    });

    document.getElementById('install-btn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('PWA installed');
            }
            deferredPrompt = null;
        }
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered!', reg))
            .catch(err => console.error('SW registration failed', err));
    }
}