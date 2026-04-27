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
    FETCH_TIMEOUT_MS: 5000,

    // ── Application ──────────────────────────────────────────────
    APP_NAME:    'SafeExam',
    APP_VERSION: '1.0.0',

});
