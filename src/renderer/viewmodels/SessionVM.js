window.SessionVM = class SessionVM {
    constructor(updateViewCallback) {
        this.code = '';
        this.isLoading = false;
        this.error = '';
        this.updateView = updateViewCallback;
        this.API_BASE = window.APP_CONFIG.API_BASE;
        this.heartbeatInterval = null;
        this._heartbeatInFlight = false;

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
                sessionStorage.setItem('accessApproved', 'false');

                // —— Partager l'état d'attente via localStorage (même app Electron) ——
                // Le professeur lira cette clé pour détecter les étudiants en attente
                try {
                    const prenom = sessionStorage.getItem('studentPrenom') || '';
                    const nom    = sessionStorage.getItem('studentNom') || '';
                    const studentCardNumber = sessionStorage.getItem('studentCardNumber') || '';
                    const waitingKey = `_waiting_${testId}`;
                    const existing = JSON.parse(localStorage.getItem(waitingKey) || '[]');
                    const idx = existing.findIndex(e => e.studentId === studentId);
                    if (idx >= 0) {
                        existing[idx].studentName = [prenom, nom].filter(Boolean).join(' ');
                        existing[idx].studentCardNumber = studentCardNumber;
                    } else {
                        existing.push({
                            studentId,
                            studentName: [prenom, nom].filter(Boolean).join(' '),
                            studentCardNumber
                        });
                    }
                    localStorage.setItem(waitingKey, JSON.stringify(existing));
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

        // Check our own participant status if we are in the waiting room!
        const sid = sessionStorage.getItem('studentId');
        if (sid && data.participants) {
            const me = data.participants.find(p => {
                const pid = p.student?._id || p.student?.id || p.student || p._id || p.id;
                return pid?.toString() === sid.toString();
            });
            if (me) {
                const isWaiting = sessionStorage.getItem('studentWaiting') === 'true';
                if (isWaiting && me.status === 'actif') {
                    // The backend says we are actif, but we are still waiting locally!
                    console.log('[Heartbeat] Le serveur indique un statut ACTIF. Déverrouillage salle d\'attente...');
                    if (window._hideWaitingRoom) window._hideWaitingRoom(true);
                } else if (isWaiting && me.status === 'inscrit') {
                    // Denied!
                    console.log('[Heartbeat] Le serveur indique un statut INSCRIT. Accès refusé.');
                    if (window._hideWaitingRoom) window._hideWaitingRoom(false);
                }
            }
        }
    }
    async _sendPing() {
        if (this._heartbeatInFlight) return;
        this._heartbeatInFlight = true;

        const testId = sessionStorage.getItem('activeTestId');
        const studentId = sessionStorage.getItem('studentId');
        const code = sessionStorage.getItem('activeSessionCode');
        const API_BASE = this.API_BASE;

        if (!testId && !code) {
            sessionStorage.setItem('heartbeatError', 'IDs manquants (T/C)');
            this._heartbeatInFlight = false;
            return;
        }

        sessionStorage.setItem('lastHeartbeatAttemptAt', Date.now());

        try {
            const token = sessionStorage.getItem('accessToken');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            let url;
            let method = 'GET';
            let body = null;

            if (studentId && testId) {
                // Use lightweight heartbeat endpoint to avoid heavy populate payload on every pulse
                url = `${API_BASE}/practical-tests/${testId}/heartbeat`;
                method = 'POST';
                const isWaiting = sessionStorage.getItem('studentWaiting') === 'true';
                body = JSON.stringify({ studentId, status: isWaiting ? 'waiting' : 'actif' });
            } else {
                url = testId
                    ? `${API_BASE}/practical-tests/${testId}`
                    : `${API_BASE}/practical-tests/code/${code}`;
            }

            const baseTimeoutMs =
                window.APP_CONFIG?.HEARTBEAT_FETCH_TIMEOUT_MS ||
                window.APP_CONFIG?.FETCH_TIMEOUT_MS ||
                12000;
            const maxAttempts = 2;
            let resp = null;
            let lastErr = null;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const timeoutMs = baseTimeoutMs + (attempt * 4000);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    resp = await fetch(url, {
                        method: method,
                        headers: headers,
                        body: body,
                        signal: controller.signal,
                        keepalive: true
                    });
                    clearTimeout(timeoutId);
                    if (resp.ok) break;
                    if (attempt < maxAttempts - 1 && resp.status >= 500) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }
                    break;
                } catch (e) {
                    clearTimeout(timeoutId);
                    lastErr = e;
                    const retriable = e?.name === 'AbortError' || e?.name === 'TypeError';
                    if (attempt < maxAttempts - 1 && retriable) {
                        await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
                        continue;
                    }
                    throw e;
                }
            }

            if (!resp) throw (lastErr || new Error('No heartbeat response'));

            if (resp.ok) {
                const freshData = await resp.json();
                const serverDateHeader = resp.headers.get('Date');
                this._updateLocalSessionState(freshData, serverDateHeader);

                sessionStorage.removeItem('heartbeatError');
                sessionStorage.removeItem('heartbeatWarn');
                sessionStorage.setItem('heartbeatFailCount', '0');
                this.isPaused = sessionStorage.getItem('sessionIsPaused') === 'true';
                window.dispatchEvent(new CustomEvent('session-updated'));
            } else {
                const errorData = await resp.json().catch(() => ({}));
                const msg = errorData.message || `Defaut Srv (${resp.status})`;
                const fails = parseInt(sessionStorage.getItem('heartbeatFailCount') || '0', 10) + 1;
                sessionStorage.setItem('heartbeatFailCount', String(fails));
                if (fails >= 3) {
                    sessionStorage.setItem('heartbeatError', msg);
                    sessionStorage.removeItem('heartbeatWarn');
                } else {
                    sessionStorage.setItem('heartbeatWarn', 'Reseau lent, resynchronisation...');
                    sessionStorage.removeItem('heartbeatError');
                }
            }
        } catch (e) {
            const fails = parseInt(sessionStorage.getItem('heartbeatFailCount') || '0', 10) + 1;
            sessionStorage.setItem('heartbeatFailCount', String(fails));
            const msg = e.name === 'AbortError' ? 'Erreur: Timeout Reseau' : `Erreur: ${e.message}`;
            if (fails >= 3) {
                sessionStorage.setItem('heartbeatError', msg);
                sessionStorage.removeItem('heartbeatWarn');
            } else {
                sessionStorage.setItem('heartbeatWarn', 'Reseau lent, tentative de reprise...');
                sessionStorage.removeItem('heartbeatError');
            }
        } finally {
            this._heartbeatInFlight = false;
        }
    }
    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        const heartbeatMs = window.APP_CONFIG?.HEARTBEAT_INTERVAL_MS || 4000;

        // Use a persistent interval that survives context
        this.heartbeatInterval = setInterval(() => {
            this._sendPing();
        }, heartbeatMs);

        // Immediate ping after setting interval (to avoid race conditions)
        this._sendPing();
    }

    async leaveSession() {
        const testId = sessionStorage.getItem('activeTestId');
        const studentId = sessionStorage.getItem('studentId');
        const API_BASE = this.API_BASE;
        sessionStorage.setItem('accessApproved', 'false');
        sessionStorage.setItem('studentWaiting', 'true');

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
