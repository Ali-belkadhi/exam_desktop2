class SessionVM {
    constructor(updateViewCallback) {
        this.code = '';
        this.isLoading = false;
        this.error = '';
        this.updateView = updateViewCallback;
    }

    setCode(val) { this.code = val; }

    async join() {
        this.isLoading = true;
        this.error = '';
        this.updateView();

        const API_BASE = 'https://safe-exam-db.onrender.com';

        try {
            // 1. Vérifier l'existence et le statut de la session sur le BACKEND
            console.log(`[SessionVM] Vérification du code : ${this.code}`);
            
            // Le jeton est nécessaire car le contrôleur est gardé par JwtAuthGuard
            const token = sessionStorage.getItem('accessToken');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const resp = await fetch(`${API_BASE}/practical-tests/code/${this.code}`, {
                headers: headers
            });
            
            if (!resp.ok) {
                if (resp.status === 404) {
                    throw new Error("Désolé, cette session n'existe pas ou est arrêtée.");
                } else if (resp.status === 401 || resp.status === 403) {
                    throw new Error("Session expirée. Veuillez vous reconnecter.");
                } else {
                    throw new Error("Erreur de connexion : le serveur a répondu avec le statut " + resp.status);
                }
            }

            const sessionData = await resp.json();
            
            // 2. Si OK, appeler l'IPC pour verrouiller la fenêtre et préparer l'environnement
            const api = window.electronAPI;
            if (!api) throw new Error("API système non disponible");

            // Préparer les libellés pour l'affichage
            const courseTitle = sessionData.classe?.name || "Session Pratique";
            const profName = sessionData.professors && sessionData.professors[0] 
                ? (sessionData.professors[0].lastName || "Professeur")
                : "Professeur";

            const res = await api.joinSession({ 
                code: this.code,
                title: courseTitle,
                prof: profName
            });

            if (res.success) {
                // Stocker les infos pour le bureau
                sessionStorage.setItem('activeSessionCode', this.code);
                sessionStorage.setItem('sessionCourse', courseTitle);
                sessionStorage.setItem('sessionProf', profName);
                
                // Données temporelles pour le décompte
                if (sessionData.duration) {
                    sessionStorage.setItem('sessionDuree', sessionData.duration); // en minutes
                }
                if (sessionData.startedAt) {
                    sessionStorage.setItem('sessionStartedAt', sessionData.startedAt);
                }
                if (sessionData.link) {
                    sessionStorage.setItem('sessionLink', sessionData.link);
                }

                // Activer le mode examen (Kiosque Fullscreen)
                await api.setLocked(true);

                // Redirection vers le bureau sécurisé
                window.location.href = './desktop.html';
            } else {
                throw new Error(res.error || "Échec de l'initialisation système");
            }
        } catch (e) {
            console.error('[SessionVM] Join Error:', e);
            this.isLoading = false;
            this.error = e.message;
            this.updateView();
        }
    }
}
