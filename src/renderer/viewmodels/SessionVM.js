class SessionVM {
    constructor(updateViewCallback) {
        this.code = '';
        this.isLoading = false;
        this.error = '';
        this.updateView = updateViewCallback;
        this.API_BASE = localStorage.getItem('apiBase') || 'https://safe-exam-db.onrender.com';
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
            
            const courseTitle = sessionData.classe ? sessionData.classe.nom : 'Session Pratique';
            const profName = sessionData.professors && sessionData.professors.length > 0 
                ? (sessionData.professors[0].firstName + ' ' + sessionData.professors[0].lastName)
                : 'Enseignant';

            sessionStorage.setItem('activeSessionCode', this.code);
            sessionStorage.setItem('sessionCourse', courseTitle);
            sessionStorage.setItem('sessionProf', profName);
            
            const studentId = sessionStorage.getItem('studentId');
            const testId = sessionData._id || sessionData.id;
            sessionStorage.setItem('activeTestId', testId);
            
            if (studentId && testId) {
                // First join
                await fetch(`${API_BASE}/practical-tests/${testId}/join`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ studentId }),
                    keepalive: true
                });
                
                // Start heartbeat for continuous "Online" status
                this.startHeartbeat();
            }
            
            if (sessionData.duration) {
                sessionStorage.setItem('sessionDuree', sessionData.duration);
                sessionStorage.setItem('sessionStartedAt', sessionData.startedAt || new Date().toISOString());
            }

            if (sessionData.pdfUrl) {
                sessionStorage.setItem('sessionPdfUrl', sessionData.pdfUrl);
            } else {
                sessionStorage.removeItem('sessionPdfUrl');
            }

            window.location.href = './desktop.html';

        } catch (e) {
            console.error('[SessionVM] join error:', e);
            this.isLoading = false;
            this.error = e.message;
            this.updateView();
        }
    }

    async _sendPing() {
        const testId = sessionStorage.getItem('activeTestId');
        const studentId = sessionStorage.getItem('studentId');
        const API_BASE = this.API_BASE;
        
        if (testId && studentId) {
            try {
                const token = sessionStorage.getItem('accessToken');
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                await fetch(`${API_BASE}/practical-tests/${testId}/join`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ studentId }),
                    keepalive: true
                });
            } catch (e) {
                console.warn("Ping failed", e);
            }
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        // Immediate ping
        this._sendPing();
        
        // Use a persistent interval that survives context
        this.heartbeatInterval = setInterval(() => {
            this._sendPing();
        }, 10000); // 10 seconds
    }

    async leaveSession() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        const testId = sessionStorage.getItem('activeTestId');
        const studentId = sessionStorage.getItem('studentId');
        const API_BASE = this.API_BASE;
        
        if (testId && studentId) {
            try {
                const token = sessionStorage.getItem('accessToken');
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                
                await fetch(`${API_BASE}/practical-tests/${testId}/leave`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ studentId }),
                    keepalive: true
                });
                console.log("[SessionVM] Participation retirée");
            } catch (e) {
                console.error("[SessionVM] Erreur retrait:", e);
            }
        }
    }
}
