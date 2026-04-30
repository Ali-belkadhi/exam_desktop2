window.SessionVM = class SessionVM {
    constructor(updateViewCallback) {
        this.code = '';
        this.isLoading = false;
        this.error = '';
        this.updateView = updateViewCallback;
        this.API_BASE = window.APP_CONFIG.API_BASE;
        this.heartbeatInterval = null;

        // Auto-resume heartbeat if already in a session (for desktop.html)
        if (sessionStorage.getItem('activeTestId') && sessionStorage.getItem('studentId')) {
            this.startHeartbeat();
        }
    }

    setCode(val) { this.code = val; }

    async join() {
        if (!this.code) {
            this.error = 'Veuillez saisir le code de session.';
            this.updateView();
            return;
        }

        this.isLoading = true;
        this.error = '';
        this.updateView();

        const API_BASE = this.API_BASE;

        try {
            const token = sessionStorage.getItem('accessToken');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const resp = await fetch(`${API_BASE}/practical-tests/code/${this.code}`, {
                headers: headers
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.message || 'Session introuvable ou inactive.');
            }

            const sessionData = await resp.json();

            const courseTitle = sessionData.classe ? (sessionData.classe.nom || sessionData.classe.name) : 'Session Pratique';
            const profName = sessionData.professors && sessionData.professors.length > 0
                ? ((sessionData.professors[0].firstName || sessionData.professors[0].prenom || '') + ' ' + (sessionData.professors[0].lastName || sessionData.professors[0].nom || ''))
                : 'Enseignant';

            sessionStorage.setItem('activeSessionCode', this.code);
            sessionStorage.setItem('sessionCourse', courseTitle);
            sessionStorage.setItem('sessionProf', profName);

            const studentId = sessionStorage.getItem('studentId');
            const testId = sessionData._id || sessionData.id;
            sessionStorage.setItem('activeTestId', testId);

            if (studentId && testId) {
                // Enregistrer avec statut 'waiting' (en attente de l'approbation du professeur)
                const joinResp = await fetch(`${API_BASE}/practical-tests/${testId}/join`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ studentId, status: 'waiting' }),
                    keepalive: true
                });

                // Marquer l'étudiant comme "en attente" dans sessionStorage
                // desktop.html lira ce flag pour afficher l'overlay de salle d'attente
                sessionStorage.setItem('studentWaiting', 'true');

                // —— Partager l'état d'attente via localStorage (même app Electron) ——
                // Le professeur lira cette clé pour détecter les étudiants en attente
                try {
                    const prenom = sessionStorage.getItem('studentPrenom') || '';
                    const nom    = sessionStorage.getItem('studentNom') || '';
                    const waitingKey = `_waiting_${testId}`;
                    const existing = JSON.parse(localStorage.getItem(waitingKey) || '[]');
                    const alreadyIn = existing.some(e => e.studentId === studentId);
                    if (!alreadyIn) {
                        existing.push({ studentId, studentName: [prenom, nom].filter(Boolean).join(' ') });
                        localStorage.setItem(waitingKey, JSON.stringify(existing));
                    }
                } catch(e) { /* silent */ }

                // NOTE: Ne pas démarrer le socket WebSocket ICI.
                // La page va changer (window.location.href) dans 50ms,
                // ce qui détruirait le socket immédiatement.
                // Le socket sera créé dans desktop.html via le constructor.
            }

            // 🔥 Synchroniser l'état initial
            this._updateLocalSessionState(sessionData);

            window.location.href = './desktop.html';

        } catch (e) {
            console.error('[SessionVM] join error:', e);
            this.isLoading = false;
            this.error = e.message;
            this.updateView();
        }
    }

    /**
     * Met à jour sessionStorage avec les dernières données du serveur
     * @param {Object} data Données JSON
     * @param {String} serverDateHeader Date brute du header HTTP (pour la synchronisation d'horloge)
     */
    _updateLocalSessionState(data, serverDateHeader) {
        if (!data) return;

        // Synchronisation du temps (Clock Calibration)
        let serverMs = null;
        if (data.serverTime) {
            serverMs = new Date(data.serverTime).getTime();
        } else if (serverDateHeader) {
            serverMs = new Date(serverDateHeader).getTime();
        }

        if (serverMs) {
            const localMs = Date.now();
            const offset = serverMs - localMs;
            sessionStorage.setItem('sessionClockOffset', offset);
        }

        // Temps & Timer
        sessionStorage.setItem('sessionDuree', data.duration || data.duree || 60);
        sessionStorage.setItem('sessionStartedAt', data.startedAt || new Date().toISOString());
        if (data.scheduledStartTime) sessionStorage.setItem('sessionScheduledStartAt', data.scheduledStartTime);
        else sessionStorage.removeItem('sessionScheduledStartAt');

        // Convertir explicitement en booléen car le storage ne stocke que des strings
        const isPaused = data.isPaused === true || data.isPaused === 'true';
        sessionStorage.setItem('sessionIsPaused', isPaused ? 'true' : 'false');

        // Toujours stocker le pausedAt même si nul pour forcer le nettoyage si on reprend
        sessionStorage.setItem('sessionPausedAt', data.pausedAt || '');
        sessionStorage.setItem('sessionTotalPausedSeconds', data.totalPausedSeconds || 0);
        sessionStorage.setItem('sessionExtendedDuration', data.extendedDuration || 0);

        // Contenu (PDF / Lien)
        if (data.pdfUrl) sessionStorage.setItem('sessionPdfUrl', data.pdfUrl);
        else sessionStorage.removeItem('sessionPdfUrl');

        if (data.link) sessionStorage.setItem('sessionLink', data.link);
        else sessionStorage.removeItem('sessionLink');

        // Statut global (pour arrêter l'examen si terminé)
        const isActive = data.isActive !== false && !data.endedAt;
        sessionStorage.setItem('sessionIsActive', isActive ? 'true' : 'false');

        sessionStorage.setItem('sessionTestType', data.testType || 'DESKTOP_APP');
        if (data.quizData) {
            const quizVal = typeof data.quizData === 'string' ? data.quizData : JSON.stringify(data.quizData);
            sessionStorage.setItem('sessionQuizData', quizVal);
        } else {
            sessionStorage.removeItem('sessionQuizData');
        }

        // Traceur de battement pour le UI
        sessionStorage.setItem('lastHeartbeatAt', Date.now());
        sessionStorage.setItem('lastHeartbeatAttemptAt', Date.now());
    }

    async _sendPing() {
        const testId = sessionStorage.getItem('activeTestId');
        const studentId = sessionStorage.getItem('studentId');
        const code = sessionStorage.getItem('activeSessionCode');
        const API_BASE = this.API_BASE;

        // Un ping est possible si on a soit le TestId (préféré) soit le Code
        if (!testId && !code) {
            sessionStorage.setItem('heartbeatError', 'IDs manquants (T/C)');
            return;
        }

        sessionStorage.setItem('lastHeartbeatAttemptAt', Date.now());

        try {
            const token = sessionStorage.getItem('accessToken');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            // Si on a un studentId, on utilise l'endpoint /join (comportement étudiant standard)
            // Sinon, on fait un simple fetch de statut (comportement professeur/moniteur)
            let url;
            let method = 'GET';
            let body = null;

            if (studentId && testId) {
                url = `${API_BASE}/practical-tests/${testId}/join`;
                method = 'POST';
                body = JSON.stringify({ studentId });
            } else {
                // Mode moniteur (Professeur)
                url = testId
                    ? `${API_BASE}/practical-tests/${testId}`
                    : `${API_BASE}/practical-tests/code/${code}`;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const resp = await fetch(url, {
                method: method,
                headers: headers,
                body: body,
                signal: controller.signal,
                keepalive: true
            });
            clearTimeout(timeoutId);

            if (resp.ok) {
                const freshData = await resp.json();

                // Extraction du header "Date" pour calibration automatique
                const serverDateHeader = resp.headers.get('Date');
                this._updateLocalSessionState(freshData, serverDateHeader);

                sessionStorage.removeItem('heartbeatError');
                this.isPaused = sessionStorage.getItem('sessionIsPaused') === 'true';
                window.dispatchEvent(new CustomEvent('session-updated'));
            } else {
                const errorData = await resp.json().catch(() => ({}));
                const msg = errorData.message || `Défaut Srv (${resp.status})`;
                sessionStorage.setItem('heartbeatError', msg);
            }
        } catch (e) {
            const msg = e.name === 'AbortError' ? 'Erreur: Timeout Réseau' : `Erreur: ${e.message}`;
            sessionStorage.setItem('heartbeatError', msg);
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

        // Use a persistent interval that survives context
        this.heartbeatInterval = setInterval(() => {
            this._sendPing();
        }, 1000); // 1 second for "Real Time" sync

        // Immediate ping after setting interval (to avoid race conditions)
        this._sendPing();
    }

    async leaveSession() {
        const testId = sessionStorage.getItem('activeTestId');
        const studentId = sessionStorage.getItem('studentId');
        const API_BASE = this.API_BASE;

        if (testId && studentId) {
            try {
                // 1. D'abord, envoyer HTTP /leave (garanti même si le WebSocket échoue)
                const token = sessionStorage.getItem('accessToken');
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                await fetch(`${API_BASE}/practical-tests/${testId}/leave`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ studentId }),
                    keepalive: true
                });
                console.log("[SessionVM] Participation retirée via HTTP");
            } catch (e) {
                console.error("[SessionVM] Erreur retrait HTTP:", e);
            }
        }

        // 2. Ensuite, couper le WebSocket (le gateway va aussi notifier les profs)
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}
