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

    init() {
        this.webview = document.getElementById('mainWebview');
        this.addressBar = document.getElementById('addressBar');
        this.statusBar = document.getElementById('browser-status');
        this.titleEl = document.getElementById('browser-title');
        this.securityIcon = document.getElementById('security-icon');
        this.btnBack = document.getElementById('btn-back');
        this.btnForward = document.getElementById('btn-forward');
        this.errorEl = document.getElementById('browser-error');

        if (!this.webview) return; // Guard — page may not have browser window

        // ── Navigation events ────────────────────────────────────────────
        this.webview.addEventListener('did-start-loading', () => {
            this.statusBar.textContent = 'Chargement...';
            document.getElementById('btn-reload').textContent = '✕';
            document.getElementById('btn-reload').setAttribute('onclick', 'BrowserVM.stop()');
            this.errorEl.classList.remove('visible');
        });

        this.webview.addEventListener('did-stop-loading', () => {
            this.statusBar.textContent = 'Prêt';
            document.getElementById('btn-reload').innerHTML = '&#8635;';
            document.getElementById('btn-reload').setAttribute('onclick', 'BrowserVM.reload()');
        });

        this.webview.addEventListener('did-navigate', (e) => {
            this.addressBar.value = e.url;
            this.updateSecurityIcon(e.url);
            this.updateNavButtons();
        });

        this.webview.addEventListener('did-navigate-in-page', (e) => {
            this.addressBar.value = e.url;
            this.updateSecurityIcon(e.url);
            this.updateNavButtons();
        });

        this.webview.addEventListener('page-title-updated', (e) => {
            this.titleEl.textContent = e.title || 'Nouvel onglet';
        });

        this.webview.addEventListener('page-favicon-updated', () => { });

        this.webview.addEventListener('did-fail-load', (e) => {
            if (e.errorCode === -3) return; // Aborted — ignore
            this.errorEl.classList.add('visible');
            document.getElementById('browser-error-msg').textContent =
                `Erreur ${e.errorCode}: ${e.errorDescription || 'Page introuvable.'}`;
            this.webview.style.display = 'none';
        });

        this.webview.addEventListener('did-finish-load', () => {
            this.errorEl.classList.remove('visible');
            this.webview.style.display = 'flex';
        });

        this.webview.addEventListener('update-target-url', (e) => {
            this.statusBar.textContent = e.url || 'Prêt';
        });
    },

    // ── Commands ────────────────────────────────────────────────────────
    navigate(input) {
        if (!input.trim()) return;
        let url = input.trim();

        // If no protocol and no dot → Google search
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
            }
        }

        this.addressBar.value = url;
        this.webview.src = url;
        this.webview.style.display = 'flex';
        this.errorEl.classList.remove('visible');
    },

    goBack() {
        if (this.webview.canGoBack()) this.webview.goBack();
    },

    goForward() {
        if (this.webview.canGoForward()) this.webview.goForward();
    },

    reload() {
        this.webview.reload();
    },

    stop() {
        this.webview.stop();
    },

    // ── Helpers ─────────────────────────────────────────────────────────
    updateNavButtons() {
        this.btnBack.disabled = !this.webview.canGoBack();
        this.btnForward.disabled = !this.webview.canGoForward();
    },

    updateSecurityIcon(url) {
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

// Init after DOM is ready
document.addEventListener('DOMContentLoaded', () => BrowserVM.init());
