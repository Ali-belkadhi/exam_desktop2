/**
 * ════════════════════════════════════════════════════════════════
 *  config.js  —  Source unique de vérité (Single Source of Truth)
 *  Tous les ViewModels doivent référencer window.APP_CONFIG.
 *  Ne jamais dupliquer ces valeurs ailleurs.
 * ════════════════════════════════════════════════════════════════
 */
window.APP_CONFIG = Object.freeze({

    // ── API Backend ───────────────────────────────────────────────
    API_BASE: 'https://safe-exam-db-ll3f.onrender.com',

    // ── Compte service (super-admin pour les recherches étudiantes) ──
    SERVICE_EMAIL:    'jean.dupont@university.edu',
    SERVICE_PASSWORD: 'SecureP@ss123',

    // ── Rôles autorisés dans l'application desktop professeur ────
    ALLOWED_ROLES: ['professor', 'admin', 'super_admin'],

    // ── Timing ───────────────────────────────────────────────────
    /** Intervalle du heartbeat étudiant en millisecondes */
    HEARTBEAT_INTERVAL_MS: 1000,
    /** Timeout réseau pour les requêtes fetch (ms) */
    FETCH_TIMEOUT_MS: 8000,

    // ── Application ──────────────────────────────────────────────
    APP_NAME:    'SafeExam',
    APP_VERSION: '1.0.0',

});

/**
 * ── FIX PERFORMANCE #1 : Anti-Cold-Start Render Free ────────────
 * Envoie un ping au backend toutes les 9 minutes pour que le serveur
 * Render ne se mette jamais en veille (évite le cold start de 15-30s).
 */
(function startKeepAlive() {
    const pingUrl = window.APP_CONFIG.API_BASE + '/auth/config-test';
    const pingInterval = 9 * 60 * 1000; // 9 minutes
    let pingTimer = null;

    function doPing() {
        fetch(pingUrl, { method: 'GET' }).catch(() => { /* silencieux */ });
    }

    function startPing() {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(doPing, pingInterval);
        console.log('[KeepAlive] Ping Render activé — intervalle 9 min');
    }

    // Démarrer après un court délai (laisser l'app s'initialiser d'abord)
    setTimeout(startPing, 5000);
})();
