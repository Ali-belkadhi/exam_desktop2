// ─── BrowserVM — Navigateur intégré via <webview> Electron ──────────────────
const BrowserVM = {
    webview: null,
    addressBar: null,
    statusBar: null,
    titleEl: null,
    securityIcon: null,
    btnBack: null,
    btnForward: null,
    errorEl: null,

    init(initialUrl = 'about:blank') {
        this.addressBar = document.getElementById('addressBar');
        this.statusBar = document.getElementById('browser-status');
        this.titleEl = document.getElementById('browser-title');
        this.securityIcon = document.getElementById('security-icon');
        this.btnBack = document.getElementById('btn-back');
        this.btnForward = document.getElementById('btn-forward');
        this.errorEl = document.getElementById('browser-error');

        // ── Création dynamique du Webview pour ISOLATION des sessions ──────
        const container = document.getElementById('browser-body');
        if (!container) return;

        const studentUniqueId = sessionStorage.getItem('studentId') || sessionStorage.getItem('userId') || 'guest';
        
        const wv = document.createElement('webview');
        wv.id = 'mainWebview';
        wv.setAttribute('style', 'flex:1; width:100%;');
        wv.setAttribute('allowpopups', '');
        wv.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        wv.setAttribute('partition', `persist:student-${studentUniqueId}`);
        wv.setAttribute('src', initialUrl || 'about:blank');
        
        container.appendChild(wv);
        this.webview = wv;

        // ── Navigation events ────────────────────────────────────────────
        this.webview.addEventListener('did-start-loading', () => {
            if (this.statusBar) this.statusBar.textContent = 'Chargement...';
            const btnReload = document.getElementById('btn-reload');
            if (btnReload) {
                btnReload.textContent = '✕';
                btnReload.setAttribute('onclick', 'BrowserVM.stop()');
            }
            if (this.errorEl) this.errorEl.classList.remove('visible');
        });

        this.webview.addEventListener('did-stop-loading', () => {
            if (this.statusBar) this.statusBar.textContent = 'Prêt';
            const btnReload = document.getElementById('btn-reload');
            if (btnReload) {
                btnReload.innerHTML = '&#8635;';
                btnReload.setAttribute('onclick', 'BrowserVM.reload()');
            }
        });

        this.webview.addEventListener('did-navigate', (e) => {
            if (e.url === 'about:blank') return;
            if (this.addressBar) this.addressBar.value = e.url;
            this.updateSecurityIcon(e.url);
            this.updateNavButtons();
        });

        this.webview.addEventListener('did-navigate-in-page', (e) => {
            if (e.url === 'about:blank') return;
            if (this.addressBar) this.addressBar.value = e.url;
            this.updateSecurityIcon(e.url);
            this.updateNavButtons();
        });

        this.webview.addEventListener('page-title-updated', (e) => {
            if (this.titleEl) this.titleEl.textContent = e.title || 'Nouvel onglet';
        });

        this.webview.addEventListener('did-fail-load', (e) => {
            if (e.errorCode === -3) return; // Aborted
            if (this.errorEl) {
                this.errorEl.classList.add('visible');
                const errMsg = document.getElementById('browser-error-msg');
                if (errMsg) errMsg.textContent = `Erreur ${e.errorCode}: ${e.errorDescription || 'Page introuvable.'}`;
            }
            if (this.webview) this.webview.style.display = 'none';
        });

        this.webview.addEventListener('did-finish-load', () => {
            if (this.errorEl) this.errorEl.classList.remove('visible');
            if (this.webview) this.webview.style.display = 'flex';
        });

        this.webview.addEventListener('update-target-url', (e) => {
            if (this.statusBar) this.statusBar.textContent = e.url || 'Prêt';
        });
    },

    // ── Commands ────────────────────────────────────────────────────────
    navigate(input) {
        if (!input || !input.trim()) return;
        if (!this.webview) return;

        let url = input.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
            }
        }

        if (this.addressBar) this.addressBar.value = url;
        this.webview.src = url;
        this.webview.style.display = 'flex';
        if (this.errorEl) this.errorEl.classList.remove('visible');
    },

    goBack() {
        if (this.webview && this.webview.canGoBack()) this.webview.goBack();
    },

    goForward() {
        if (this.webview && this.webview.canGoForward()) this.webview.goForward();
    },

    reload() {
        if (this.webview) this.webview.reload();
    },

    stop() {
        if (this.webview) this.webview.stop();
    },

    // ── Helpers ─────────────────────────────────────────────────────────
    updateNavButtons() {
        if (this.btnBack) this.btnBack.disabled = !this.webview.canGoBack();
        if (this.btnForward) this.btnForward.disabled = !this.webview.canGoForward();
    },

    updateSecurityIcon(url) {
        if (!this.securityIcon) return;
        if (url.startsWith('https://')) {
            this.securityIcon.textContent = '🔒';
            this.securityIcon.title = 'Connexion sécurisée (HTTPS)';
        } else if (url.startsWith('http://')) {
            this.securityIcon.textContent = '⚠️';
            this.securityIcon.title = 'Connexion non sécurisée (HTTP)';
        } else {
            this.securityIcon.textContent = '🌐';
            this.securityIcon.title = '';
        }
    }
};

window.BrowserVM = BrowserVM;
