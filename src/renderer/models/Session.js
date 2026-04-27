/**
 * Model : Session
 * Représente une session d'examen pratique.
 */
class Session {
    constructor(data = {}) {
        this.id          = data._id || data.id || null;
        this.sessionCode = data.sessionCode || '';
        this.testType    = data.testType || 'DESKTOP_APP'; // DESKTOP_APP | WEB_LINK | QUIZ
        this.isActive    = data.isActive !== false && !data.endedAt;
        this.isArchived  = data.isArchived === true;
        this.isPaused    = data.isPaused === true;
        this.duration    = data.duration || data.duree || 60; // minutes
        this.startedAt   = data.startedAt ? new Date(data.startedAt) : null;
        this.endedAt     = data.endedAt   ? new Date(data.endedAt)   : null;
        this.pausedAt    = data.pausedAt  ? new Date(data.pausedAt)  : null;
        this.extendedDuration    = data.extendedDuration    || 0;
        this.totalPausedSeconds  = data.totalPausedSeconds  || 0;
        this.pdfUrl      = data.pdfUrl  || null;
        this.link        = data.link    || null;
        this.quizData    = data.quizData || null;
        this.allowedApps = data.allowedApps || []; // Blacklist
        // Relations
        this.classe      = data.classe      || null;
        this.professors  = data.professors  || [];
        this.students    = data.students    || [];
    }

    /** Titre affiché : "Matière – Classe" ou sessionCode */
    get displayTitle() {
        const matiere = this.classe?.name || this.classe?.nom || '';
        const classe  = this.classe?.niveau || '';
        if (matiere) return classe ? `${matiere} – ${classe}` : matiere;
        return this.sessionCode;
    }
}
