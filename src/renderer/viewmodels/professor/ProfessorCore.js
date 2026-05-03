/**
 * ViewModel : ProfessorVM (Core & Initialization)
 */
let API_BASE = window.APP_CONFIG.API_BASE;

function setApiServer(url) {
    API_BASE = url;
    localStorage.setItem('apiBase', url);
    console.log("Serveur API changé vers : " + url);
    ProfVM.fetchRecentSessions();
}

const SERVICE_EMAIL = 'jean.dupont@university.edu';
const SERVICE_PASSWORD = 'SecureP@ss123';

// ── Helpers ────────────────────────────────────────────────────────────────
function _resolveStr(field, ...keys) {
    if (field === null || field === undefined) return null;
    if (typeof field === 'object' && field.$oid) return String(field.$oid);
    if (typeof field === 'object' && field.$date) return String(field.$date);
    if (typeof field === 'object' && !Array.isArray(field)) {
        for (const k of keys) {
            if (field[k] !== undefined && field[k] !== null) return _resolveStr(field[k], ...keys);
        }
        if (field._id) return _resolveStr(field._id);
        if (field.id) return _resolveStr(field.id);
        return null;
    }
    return String(field);
}

function _formatDuree(duree) {
    if (duree === null || duree === undefined || duree === '') return '—';
    const n = Number(duree);
    if (!isNaN(n) && n > 0) {
        const h = Math.floor(n / 60);
        const m = n % 60;
        if (h === 0) return `${m} min`;
        return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
    }
    return String(duree);
}

function _toIsoFromDateAndTime(dateInput, timeInput) {
    const rawDate = (dateInput || '').toString().trim();
    const rawTime = (timeInput || '').toString().trim();
    if (!rawDate) return null;
    let d = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) d = new Date(`${rawDate}T00:00:00`);
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDate)) {
        const [dd, mm, yyyy] = rawDate.split('/').map(v => parseInt(v, 10));
        d = new Date(yyyy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
    } else {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) d = parsed;
    }
    if (!d || isNaN(d.getTime())) return null;
    let hh = d.getHours();
    let mi = d.getMinutes();
    if (/^\d{1,2}:\d{2}$/.test(rawTime)) {
        const [hStr, mStr] = rawTime.split(':');
        hh = parseInt(hStr, 10); mi = parseInt(mStr, 10);
    }
    d.setHours(hh, mi, 0, 0);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

function _addMinutesToIso(isoStart, minutes) {
    if (!isoStart) return null;
    const start = new Date(isoStart);
    if (isNaN(start.getTime())) return null;
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0) return null;
    return new Date(start.getTime() + mins * 60 * 1000).toISOString();
}

function _getClasse(e) {
    if (!e) return '';
    const explicitLabel = _resolveStr(e.classLabel, 'nom', 'name', 'code', 'label') || _resolveStr(e.classeLabel, 'nom', 'name', 'code', 'label');
    if (explicitLabel && !_looksLikeObjectId(explicitLabel)) return explicitLabel;
    const c = e.classe || (e.examId ? e.examId.classe : null);
    if (!c) return '';
    const resolved = _resolveStr(c, 'nom', 'name', 'code', 'label');
    if (resolved && (resolved.length === 24 || resolved.match(/^[0-9a-fA-F]{24}$/))) {
        const found = ProfData.allClasses && ProfData.allClasses.find(cl => _resolveStr(cl._id) === resolved);
        if (found) return found.nom || found.name || found.code || resolved;
    }
    return resolved || '—';
}

function _looksLikeObjectId(value) {
    return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value.trim());
}

function _getReadableSessionTitle(session) {
    if (!session) return null;
    const candidates = [
        _resolveStr(session, 'subject', 'title', 'name', 'nom'),
        _resolveStr(session.examId, 'title', 'subject', 'name', 'nom'),
        _resolveStr(session.examId?.matiere, 'nom', 'code', 'name', 'title', 'label'),
        _resolveStr(session.examId?.subject, 'nom', 'code', 'name', 'title', 'label'),
        _resolveStr(session.examId?.devoir, 'nom', 'code', 'name', 'title', 'label'),
        session.testType === 'QUIZ' ? 'Quiz' : null
    ].map(v => (v || '').toString().trim()).filter(Boolean);
    return candidates.find(v => !_looksLikeObjectId(v)) || null;
}

function _buildSessionTitle(baseTitle, classe) {
    const rawTitle = (baseTitle || '').toString().trim().replace(/\s+/g, ' ');
    const rawClasse = (classe || '').toString().trim().replace(/\s+/g, '');
    if (!rawTitle && !rawClasse) return 'session';
    if (!rawClasse) return rawTitle || 'session';
    if (!rawTitle) return rawClasse;
    return `${rawTitle}-${rawClasse}`;
}

function _escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const ProfData = {
    sessions: [],
    allExams: [],
    filteredExams: [],
    detailsInterval: null,
    currentSessionDetails: null,
    workFolders: [],
    workCurrentClass: null,
    allClasses: []
};

const ProfVM = {
    sessionsOpen: false,
    viewingArchive: false,
    sharedFiles: [],
    sharedUrls: [],
    mode: 'existant',
    selectedExam: null,
    _waitingStudentsSet: new Set(),
    _studentRiskMap: {},

    init() {
        const nom = sessionStorage.getItem('userNom') || sessionStorage.getItem('username') || 'Professeur';
        const prenom = sessionStorage.getItem('userPrenom') || '';
        const full = prenom ? `${prenom} ${nom}` : nom;
        const init = full.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'P';
        document.getElementById('avatarEl').textContent = init;
        document.getElementById('welcomeTitle').textContent = `Bienvenue, ${full} 👋`;

        this.renderSessions();
        this.fetchClasses();
        this.fetchRecentSessions();
        this.checkConnection();
        this.initSocket();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const container = document.getElementById('pm-screen-container');
                if (container && container.classList.contains('pm-screen-fullscreen')) {
                    this.toggleScreenFullscreen();
                }
            }
        });

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes fadeOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }
        `;
        document.head.appendChild(style);
    },

    initSocket() {
        if (!window.io) return;
        const API_BASE_SOCKET = window.APP_CONFIG.API_BASE;
        if (this.socket) this.socket.disconnect();
        this.socket = window.io(API_BASE_SOCKET);
        this.socket.on('connect', () => console.log("[WebSocket] Connecté en mode global"));
        this.socket.on('student-monitoring-update', (data) => this._processIncomingAlert(data));
        this.socket.on('student-waiting', (data) => console.log("[WebSocket] Étudiant en attente:", data.studentName));
    },

    async checkConnection() {
        const statVal = document.querySelector('.stat-card.online .stat-value');
        const statCard = document.querySelector('.stat-card.online');
        try {
            const resp = await fetch(`${API_BASE}/auth/config-test`, { method: 'GET', signal: AbortSignal.timeout(3000) });
            if (resp.ok) {
                statVal.textContent = "En ligne";
                statCard.style.opacity = "1";
            } else throw new Error();
        } catch (e) {
            statVal.textContent = "Hors ligne";
            statVal.style.color = "#ed4245";
            if (statCard) statCard.classList.remove('online');
        }
    }
};
