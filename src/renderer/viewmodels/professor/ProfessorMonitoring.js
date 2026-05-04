/**
 * ViewModel : ProfessorVM (Monitoring, Real-time Alerts, Access Control, Reports)
 */
Object.assign(ProfVM, {
    async showSessionDetails(id) {
        const modal = document.getElementById('detailsModal');
        if (modal) modal.classList.add('open');
        this._pmIsRefreshing = false; // Initialize flag
        this._pmLastRefresh = 0;      // Initialize timestamp
        this._lastAlertTimes = {};    // Initialize alert throttle map
        this._pmAlerts = [];
        this._pmAlertCount = 0;
        this._studentRiskMap = {};
        const alertsBox = document.getElementById('pm-global-alerts');
        const countBadge = document.getElementById('pm-alerts-count');
        if (countBadge) { countBadge.style.display = 'none'; countBadge.textContent = '0'; }
        if (alertsBox) alertsBox.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,.2); font-size:11px;">Aucune alerte détectée</div>';
        try {
            const savedAlerts = localStorage.getItem('alerts_' + id);
            // PERF FIX: Avoid parsing massive strings that could hang the UI
            if (savedAlerts && savedAlerts.length > 2000000) { // > 2MB is way too much
                console.warn("[Perf] Alerts log too large, pruning...");
                this._reportLog = [];
                localStorage.removeItem('alerts_' + id);
            } else {
                this._reportLog = savedAlerts ? JSON.parse(savedAlerts) : [];
                // Limit to 500 items if we over-saved before the fix
                if (this._reportLog.length > 500) this._reportLog = this._reportLog.slice(-500);
            }

            if (this._reportLog?.length > 0) {
                this._pmAlertCount = this._reportLog.length;
                if (countBadge) { countBadge.style.display = 'inline'; countBadge.textContent = this._pmAlertCount; }
                if (alertsBox) {
                    alertsBox.innerHTML = '';
                    this._reportLog.slice(-50).reverse().forEach(entry => {
                        const alertClass = entry.level === 'high' ? '' : 'medium';
                        const icon = entry.level === 'high' ? 'ðŸ”´' : 'ðŸŸ¡';
                        const alertEl = document.createElement('div');
                        alertEl.className = `pm-alert-item ${alertClass}`;
                        alertEl.innerHTML = `<span>${icon}</span><div><strong>${entry.studentName}</strong> â€” ${entry.message}<br><span style="font-size:9px;opacity:.6;">${entry.time}</span></div>`;
                        alertsBox.appendChild(alertEl);
                        const sid = entry.studentId?.toString() || '';
                        if (sid) {
                            const prevRisk = this._studentRiskMap[sid] || 'low';
                            if (entry.level === 'high' || (entry.level === 'medium' && prevRisk === 'low')) this._studentRiskMap[sid] = entry.level;
                        }
                    });
                }
            }
        } catch (e) {
            console.error("[Perf] Failed to load alerts from storage:", e);
            this._reportLog = [];
        }
        await this.refreshSessionDetails(id);
        if (window.io) {
            const emitWatch = () => { if (this.socket) this.socket.emit('watchSession', id); };
            if (this.socket?.connected) emitWatch();
            else {
                this.initSocket();
                if (this.socket) {
                    this.socket.off('connect', emitWatch);
                    this.socket.on('connect', emitWatch);
                }
            }
            if (this._waitingPollInterval) clearInterval(this._waitingPollInterval);
            this._waitingPollInterval = setInterval(() => {
                try {
                    const list = JSON.parse(localStorage.getItem(`_waiting_${id}`) || '[]');
                    let changed = false;
                    list.forEach(entry => {
                        if (entry.studentId && !this._waitingStudentsSet.has(entry.studentId.toString())) { this._waitingStudentsSet.add(entry.studentId.toString()); changed = true; }
                    });
                    if (changed) this._rerenderParticipantsFromCache(id);
                } catch (e) { }
            }, 10000); // 10s is enough for local fallback
            this.socket.on('studentPresenceChanged', () => this.refreshSessionDetails(id, true, 0, true));
            this.socket.on('student-waiting', (data) => {
                if (data?.testId && data.testId.toString() !== id.toString()) return;
                if (data.studentId) this._waitingStudentsSet.add(data.studentId.toString());
                try {
                    const key = `_waiting_${id}`;
                    const existing = JSON.parse(localStorage.getItem(key) || '[]');
                    const sid = data.studentId ? data.studentId.toString() : '';
                    if (sid) {
                        // New waiting request must clear stale local decision flags
                        localStorage.removeItem(`_accessGranted_${id}_${sid}`);
                        localStorage.removeItem(`_accessDenied_${id}_${sid}`);
                        localStorage.removeItem('_accessGranted_' + sid);
                        localStorage.removeItem('_accessDenied_' + sid);

                        const idx = existing.findIndex(e => e.studentId === sid);
                        if (idx >= 0) {
                            existing[idx].studentName = data.studentName || existing[idx].studentName || '';
                            existing[idx].studentCardNumber = data.studentCardNumber || existing[idx].studentCardNumber || '';
                        } else {
                            existing.push({
                                studentId: sid,
                                studentName: data.studentName || '',
                                studentCardNumber: data.studentCardNumber || ''
                            });
                        }
                        localStorage.setItem(key, JSON.stringify(existing));
                    }
                } catch (e) { }
                this.refreshSessionDetails(id, true, 0, true);
            });
        }
        if (ProfData.detailsInterval) clearInterval(ProfData.detailsInterval);
        ProfData.detailsInterval = setInterval(() => this.refreshSessionDetails(id, true), 5000);
    },

    _rerenderParticipantsFromCache(id) {
        if (ProfData.currentSessionDetails && (ProfData.currentSessionDetails._id === id || ProfData.currentSessionDetails.id === id)) {
            this.refreshSessionDetails(id, true, 0, true);
        }
    },

    async refreshSessionDetails(id, isSilent = false, _retryCount = 0, force = false) {
        // PERF FIX: Prevent multiple concurrent refreshes and throttle frequency
        if (this._pmIsRefreshing) {
            if (force) this._pmPendingForcedRefreshId = id;
            return;
        }
        const now = Date.now();
        if (!force && isSilent && this._pmLastRefresh && (now - this._pmLastRefresh < 5000)) return; // Throttle silent refreshes to 5s min

        const participantsList = document.getElementById('participantsList');
        const subheader = document.getElementById('detailsSubheader');
        const controls = document.getElementById('sessionControls');
        if (!participantsList || !subheader || !controls) {
            console.error("[Perf] Missing DOM elements for monitoring:", { participantsList, subheader, controls });
            return;
        }

        this._pmIsRefreshing = true;
        if (!isSilent) {
            participantsList.innerHTML = `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:120px;gap:10px;"><div class="spin-ring" style="width:24px;height:24px;"></div></div>`;
            controls.style.display = 'none';
            subheader.textContent = 'Récupération des données...';
        }
        try {
            const token = sessionStorage.getItem('accessToken');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000); // Shorter timeout
            let resp;
            try {
                resp = await fetch(`${API_BASE}/practical-tests/${id}`, { headers: { 'Authorization': `Bearer ${token}` }, signal: controller.signal });
            } finally { clearTimeout(timeout); }
            if (!resp.ok) throw new Error("Erreur serveur.");
            const data = await resp.json();

            this._pmLastRefresh = Date.now();
            ProfData.currentSessionDetails = data;
            subheader.textContent = `Session ${data.sessionCode} ${data.classe?.nom ? '- ' + data.classe.nom : ''}`;
            if (data.isActive !== false && !data.endedAt) {
                controls.style.display = 'block';
                const pauseLabel = data.isPaused ? 'Reprendre' : 'Mettre en pause';
                controls.innerHTML = `<div class="control-panel">
                    <button class="cp-btn ${data.isPaused ? 'resume' : 'pause'}" onclick="ProfVM.togglePause('${id}', ${data.isPaused})">
                        ${data.isPaused ? '▶️ Reprendre' : '⏸️ Mettre en pause'}
                    </button>
                    <button class="cp-btn end" onclick="ProfVM.endSession('${id}')">⏹️ Terminer</button>
                    <button class="cp-btn extend" onclick="ProfVM.generatePDFReport()" style="background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:#818cf8;">📄 Rapport</button>
                    <button class="cp-btn extend" onclick="ProfVM.extendSession('${id}', 10)">➕ 10 min</button>
                   
                </div>`;
            } else {
                controls.style.display = 'block';
                controls.innerHTML = `<div class="control-panel" style="justify-content:flex-end;"><button class="cp-btn extend" onclick="ProfVM.generatePDFReport()" style="background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:#818cf8;">📄 Rapport</button></div>`;
            }
            const students = data.classe?.students || [];
            const participants = data.participants || [];

            // PERF FIX: Create a Map of participants for O(1) lookup instead of O(N) .find()
            const participantMap = new Map();
            participants.forEach(p => {
                // Normalize student ID from participant object
                const sRaw = p.student?._id || p.student?.id || p.student || p._id || p.id;
                const sid = sRaw ? (typeof sRaw === 'object' && sRaw.$oid ? sRaw.$oid : sRaw.toString()) : null;
                if (sid) participantMap.set(sid, p);
            });

            let waitingEntries = [];
            try {
                waitingEntries = JSON.parse(localStorage.getItem(`_waiting_${id}`) || '[]');
                waitingEntries.forEach(entry => { if (entry.studentId) this._waitingStudentsSet.add(entry.studentId.toString()); });
            } catch (e) { }

            const normalizeName = (v) => (v || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
            const waitingByName = new Map();
            waitingEntries.forEach(entry => {
                const key = normalizeName(entry?.studentName);
                if (key && entry?.studentId && !waitingByName.has(key)) waitingByName.set(key, entry.studentId.toString());
            });
            const matchedWaitingIds = new Set();

            let countActif = 0, countInactif = 0;
            const nowTs = Date.now();
            const onlineWindowMs = 8000;
            if (students.length === 0) {
                participantsList.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">Aucun étudiant inscrit.</div>`;
            } else {
                let html = '';
                const matchedStudentIds = new Set();
                students.forEach(st => {
                    // st can be a string ID or a populated object
                    const sRaw = st._id || st.id || st;
                    const sidStr = sRaw ? (typeof sRaw === 'object' && sRaw.$oid ? sRaw.$oid : sRaw.toString()) : '';
                    if (sidStr) matchedStudentIds.add(sidStr);
                    const pObj = participantMap.get(sidStr);

                    // Robust student data: try to get names from pObj or st
                    const sRef = (pObj && pObj.student) ? pObj.student : (typeof st === 'object' ? st : {});
                    const prenom = sRef.prenom || '';
                    const nom = sRef.nom || '';
                    const waitingEntryById = waitingEntries.find(e => (e?.studentId || '').toString() === sidStr);
                    const displayName = (prenom || nom)
                        ? `${prenom} ${nom}`.trim()
                        : ((waitingEntryById?.studentName || '').toString().trim() || `Étudiant (${sidStr.substring(sidStr.length - 4)})`);
                    const initials = (prenom && nom) ? (prenom[0] + nom[0]).toUpperCase() : (prenom ? prenom[0] : (nom ? nom[0] : '?')).toUpperCase();
                    const nc = sRef.studentCardNumber || waitingEntryById?.studentCardNumber || 'N/A';

                    const waitingIdByName = waitingByName.get(normalizeName(displayName)) || null;
                    const waitingControlId = waitingIdByName || sidStr;
                    if (waitingIdByName) matchedWaitingIds.add(waitingIdByName);

                    const hasGranted = (
                        localStorage.getItem(`_accessGranted_${id}_${waitingControlId}`) === '1' ||
                        localStorage.getItem('_accessGranted_' + waitingControlId) === '1'
                    );
                    const hasDenied = (
                        localStorage.getItem(`_accessDenied_${id}_${waitingControlId}`) === '1' ||
                        localStorage.getItem('_accessDenied_' + waitingControlId) === '1'
                    );

                    const pLastSeenTs = pObj?.lastSeen ? new Date(pObj.lastSeen).getTime() : 0;
                    const isFresh = Number.isFinite(pLastSeenTs) && pLastSeenTs > 0 && (nowTs - pLastSeenTs) <= onlineWindowMs;
                    // Do not trust status alone; require fresh lastSeen.
                    const isOnline = !!pObj && pObj.status !== 'inscrit' && isFresh;

                    // A student is waiting if they have 'waiting' status in DB OR if we received a WebSocket signal
                    // We don't strictly require isOnline here to be more resilient to heartbeat lag
                    const isWaiting = (
                        pObj?.status === 'waiting' ||
                        this._waitingStudentsSet.has(sidStr) ||
                        (waitingIdByName && this._waitingStudentsSet.has(waitingIdByName))
                    ) && !hasGranted && !hasDenied;

                    // A student is actif only when explicitly actif, or just granted while backend sync is pending.
                    const isActif = isOnline && !isWaiting && !hasDenied && (pObj.status === 'actif' || (hasGranted && pObj.status !== 'inscrit'));

                    if (isActif) countActif++; else countInactif++; // Simplified counting
                    const riskLevel = isActif ? (this._studentRiskMap[sidStr] || 'low') : 'inactive';
                    const avatarBg = isActif ? 'background:linear-gradient(135deg,#10b981,#059669);' : (isWaiting ? 'background:linear-gradient(135deg,#f59e0b,#d97706);' : '');
                    html += `<div class="pm-student-item" id="pm-student-${sidStr}">
                        <div class="pm-student-avatar" style="${avatarBg}">${initials}<div class="pm-risk-dot ${riskLevel}"></div></div>
                        <div class="pm-student-info"><div class="pm-student-name">${displayName}</div><div class="pm-student-nc">NC: ${nc}</div></div>
                        <div class="pm-student-actions">
                            ${isWaiting ? `<button class="pm-action-btn" title="Accepter" onclick="ProfVM.grantAccess('${id}', '${waitingControlId}')">✔️</button><button class="pm-action-btn" title="Refuser" onclick="ProfVM.denyAccess('${id}', '${waitingControlId}')">❌</button>` : ''}
                            ${isActif ? `<button class="pm-action-btn" title="Écran" onclick="ProfVM.viewStudentScreenInPanel('${sidStr}','${displayName}')">📺</button><button class="pm-action-btn" title="Contrôle" onclick="ProfVM.openMonitorModal('${sidStr}','${displayName}')">🔍</button><button class="pm-action-btn" title="Message" onclick="ProfVM.openMessageModal('${sidStr}','${displayName}')">💬</button>` : ''}
                            ${pObj?.quizResult ? `<span class="pm-student-badge actif">Score ${pObj.quizResult.score}/${pObj.quizResult.maxScore}</span>` : ''}
                            <span class="pm-student-badge ${isActif ? 'actif' : (isWaiting ? 'waiting' : '')}">${isActif ? 'Actif' : (isWaiting ? 'En attente' : 'Inscrit')}</span>
                        </div>
                    </div>`;
                });

                // Add participant rows that are not in classe.students (ID mismatch / external join)
                participants.forEach((pObj) => {
                    const sRaw = pObj?.student?._id || pObj?.student?.id || pObj?.student;
                    const sidStr = sRaw ? (typeof sRaw === 'object' && sRaw.$oid ? sRaw.$oid : sRaw.toString()) : '';
                    if (!sidStr || matchedStudentIds.has(sidStr)) return;

                    const hasGranted = (
                        localStorage.getItem(`_accessGranted_${id}_${sidStr}`) === '1' ||
                        localStorage.getItem('_accessGranted_' + sidStr) === '1'
                    );
                    const hasDenied = (
                        localStorage.getItem(`_accessDenied_${id}_${sidStr}`) === '1' ||
                        localStorage.getItem('_accessDenied_' + sidStr) === '1'
                    );
                    const pLastSeenTs = pObj?.lastSeen ? new Date(pObj.lastSeen).getTime() : 0;
                    const isFresh = Number.isFinite(pLastSeenTs) && pLastSeenTs > 0 && (nowTs - pLastSeenTs) <= onlineWindowMs;
                    const isWaiting = (pObj?.status === 'waiting' || this._waitingStudentsSet.has(sidStr)) && !hasGranted && !hasDenied;
                    const isActif = isFresh && !isWaiting && !hasDenied && (pObj?.status === 'actif' || (hasGranted && pObj?.status !== 'inscrit'));
                    if (!isWaiting && !isActif) return; // hide ghost "inscrit" rows not in class
                    if (isWaiting) matchedWaitingIds.add(sidStr);

                    if (isActif) countActif++; else countInactif++;

                    const fromWaiting = waitingEntries.find(e => (e?.studentId || '').toString() === sidStr);
                    const pRef = (pObj && typeof pObj.student === 'object') ? pObj.student : {};
                    const pPrenom = pRef.prenom || '';
                    const pNom = pRef.nom || '';
                    const displayName = (pPrenom || pNom) ? `${pPrenom} ${pNom}`.trim() : ((fromWaiting?.studentName || '').toString().trim() || `Étudiant (${sidStr.slice(-4)})`);
                    const nc = pRef.studentCardNumber || fromWaiting?.studentCardNumber || 'N/A';
                    const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
                    const riskLevel = isActif ? (this._studentRiskMap[sidStr] || 'low') : 'inactive';
                    const avatarBg = isActif ? 'background:linear-gradient(135deg,#10b981,#059669);' : (isWaiting ? 'background:linear-gradient(135deg,#f59e0b,#d97706);' : '');

                    html += `<div class="pm-student-item" id="pm-student-${sidStr}">
                        <div class="pm-student-avatar" style="${avatarBg}">${initials}<div class="pm-risk-dot ${riskLevel}"></div></div>
                        <div class="pm-student-info"><div class="pm-student-name">${displayName}</div><div class="pm-student-nc">NC: ${nc}</div></div>
                        <div class="pm-student-actions">
                            ${isWaiting ? `<button class="pm-action-btn" title="Accepter" onclick="ProfVM.grantAccess('${id}', '${sidStr}')">✔️</button><button class="pm-action-btn" title="Refuser" onclick="ProfVM.denyAccess('${id}', '${sidStr}')">❌</button>` : ''}
                            ${isActif ? `<button class="pm-action-btn" title="Écran" onclick="ProfVM.viewStudentScreenInPanel('${sidStr}','${displayName}')">📺</button><button class="pm-action-btn" title="Contrôle" onclick="ProfVM.openMonitorModal('${sidStr}','${displayName}')">🔍</button><button class="pm-action-btn" title="Message" onclick="ProfVM.openMessageModal('${sidStr}','${displayName}')">💬</button>` : ''}
                            <span class="pm-student-badge ${isActif ? 'actif' : (isWaiting ? 'waiting' : '')}">${isActif ? 'Actif' : (isWaiting ? 'En attente' : 'Inscrit')}</span>
                        </div>
                    </div>`;
                });

                // Some waiting students can use an ID that differs from classe.students IDs.
                // Add fallback rows so professor can always accept/refuse immediately.
                waitingEntries.forEach((entry) => {
                    const waitingId = entry?.studentId ? entry.studentId.toString() : '';
                    if (!waitingId || matchedWaitingIds.has(waitingId)) return;

                    const hasGranted = (
                        localStorage.getItem(`_accessGranted_${id}_${waitingId}`) === '1' ||
                        localStorage.getItem('_accessGranted_' + waitingId) === '1'
                    );
                    const hasDenied = (
                        localStorage.getItem(`_accessDenied_${id}_${waitingId}`) === '1' ||
                        localStorage.getItem('_accessDenied_' + waitingId) === '1'
                    );
                    const isWaiting = this._waitingStudentsSet.has(waitingId) && !hasGranted && !hasDenied;
                    if (!isWaiting) return;

                    const displayName = (entry?.studentName || '').toString().trim() || `Étudiant (${waitingId.slice(-4)})`;
                    const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
                    const riskLevel = 'inactive';
                    const nc = (entry?.studentCardNumber || '').toString().trim() || 'N/A';
                    countInactif++;

                    html += `<div class="pm-student-item" id="pm-student-${waitingId}">
                        <div class="pm-student-avatar" style="background:linear-gradient(135deg,#f59e0b,#d97706);">${initials}<div class="pm-risk-dot ${riskLevel}"></div></div>
                        <div class="pm-student-info"><div class="pm-student-name">${displayName}</div><div class="pm-student-nc">NC: ${nc}</div></div>
                        <div class="pm-student-actions">
                            <button class="pm-action-btn" title="Accepter" onclick="ProfVM.grantAccess('${id}', '${waitingId}')">✔️</button>
                            <button class="pm-action-btn" title="Refuser" onclick="ProfVM.denyAccess('${id}', '${waitingId}')">❌</button>
                            <span class="pm-student-badge waiting">En attente</span>
                        </div>
                    </div>`;
                });
                participantsList.innerHTML = html;
            }
            const cA = document.getElementById('pm-count-actif'); if (cA) cA.textContent = countActif;
            const cI = document.getElementById('pm-count-inactif'); if (cI) cI.textContent = countInactif;
        } catch (e) {
            if (_retryCount < 2) setTimeout(() => this.refreshSessionDetails(id, isSilent, _retryCount + 1), 2000);
            else if (!isSilent) {
                participantsList.innerHTML = `<div style="text-align:center;padding:40px;color:#ed4245;">${e.message}<br><button onclick="ProfVM.refreshSessionDetails('${id}')" style="margin-top:12px;">Réessayer</button></div>`;
                subheader.textContent = 'Erreur';
            }
        } finally {
            this._pmIsRefreshing = false;
            if (this._pmPendingForcedRefreshId === id) {
                this._pmPendingForcedRefreshId = null;
                setTimeout(() => this.refreshSessionDetails(id, true, 0, true), 50);
            }
        }
    },

    async grantAccess(testId, studentId) {
        this._waitingStudentsSet.delete(studentId.toString());
        try {
            const key = `_waiting_${testId}`;
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            const updated = list.filter(e => e.studentId !== studentId.toString());
            if (updated.length) localStorage.setItem(key, JSON.stringify(updated)); else localStorage.removeItem(key);
        } catch (e) { }

        if (this.socket) this.socket.emit('grant-student-access', { testId, studentId });
        localStorage.setItem(`_accessGranted_${testId}_${studentId}`, '1');
        localStorage.setItem('_accessGranted_' + studentId, '1');
        localStorage.removeItem(`_accessDenied_${testId}_${studentId}`);
        localStorage.removeItem('_accessDenied_' + studentId);

        // Force DB status update immediately to 'actif'
        try {
            const token = sessionStorage.getItem('accessToken');
            await fetch(`${window.APP_CONFIG.API_BASE}/practical-tests/${testId}/participants/${studentId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: 'actif' })
            }).catch(() => { });
        } catch (e) { }

        this.refreshSessionDetails(testId, true, 0, true);
    },

    async denyAccess(testId, studentId) {
        this._waitingStudentsSet.delete(studentId.toString());
        try {
            const key = `_waiting_${testId}`;
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            const updated = list.filter(e => e.studentId !== studentId.toString());
            if (updated.length) localStorage.setItem(key, JSON.stringify(updated)); else localStorage.removeItem(key);
        } catch (e) { }

        if (this.socket) this.socket.emit('deny-student-access', { testId, studentId });
        localStorage.setItem(`_accessDenied_${testId}_${studentId}`, '1');
        localStorage.setItem('_accessDenied_' + studentId, '1');
        localStorage.removeItem(`_accessGranted_${testId}_${studentId}`);
        localStorage.removeItem('_accessGranted_' + studentId);

        // Force DB status update immediately to 'inscrit'
        try {
            const token = sessionStorage.getItem('accessToken');
            await fetch(`${window.APP_CONFIG.API_BASE}/practical-tests/${testId}/participants/${studentId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: 'inscrit' })
            }).catch(() => { });
        } catch (e) { }

        this.refreshSessionDetails(testId, true, 0, true);
    },

    viewStudentScreenInPanel(studentId, studentName) {
        const container = document.getElementById('pm-screen-container');
        const nameLabel = document.getElementById('pm-screen-student-name');
        const btnFullscreen = document.getElementById('pm-btn-fullscreen');
        if (!container) return;
        if (nameLabel) nameLabel.textContent = studentName;
        if (btnFullscreen) {
            btnFullscreen.style.display = 'flex';
            btnFullscreen.innerHTML = '⛶';
        }
        container.innerHTML = `<div id="pm-screen-loading" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;"><div class="spin-ring" style="width:36px;height:36px;border-width:3px;margin-bottom:12px;"></div><p>Flux de ${studentName}...</p></div><img id="pm-screen-img" style="display:none;width:100%;height:100%;object-fit:contain;" src="" onclick="ProfVM.toggleScreenFullscreen()" />`;
        ProfData.watchingStudentId = studentId;
        if (this.socket) {
            this.socket.emit('request-screen-start', { studentId });
            this.socket.off('student-screen-frame');
            this.socket.on('student-screen-frame', (data) => {
                if (data.studentId === ProfData.watchingStudentId) {
                    const loading = document.getElementById('pm-screen-loading'); if (loading) loading.style.display = 'none';
                    const img = document.getElementById('pm-screen-img'); if (img) { img.src = data.frame || data.imageBase64; img.style.display = 'block'; }
                }
            });
        }
    },

    toggleScreenFullscreen() {
        const container = document.getElementById('pm-screen-container');
        if (!container) return;
        const isFS = container.classList.toggle('pm-screen-fullscreen');
        const btn = document.getElementById('pm-btn-fullscreen');
        if (btn) btn.innerHTML = isFS ? '✖' : '⛶';
    },
    _processIncomingAlert(data) {
        const sid = data.studentId?.toString();
        const now = Date.now();

        // Keep latest monitoring payload for modal rendering.
        if (!this._monitorLiveData) this._monitorLiveData = {};
        if (sid) this._monitorLiveData[sid] = data;

        // Update monitor modal immediately when the selected student pushes data.
        if (sid && ProfData.monitoringStudentId && sid === ProfData.monitoringStudentId.toString()) {
            this._renderMonitorData(data);
        }

        const procs = Array.isArray(data.processes) ? data.processes : [];
        const baseAlerts = Array.isArray(data.alerts) ? data.alerts : [];
        const generatedAlerts = [];

        if (!this._riskAlertCooldownMap) this._riskAlertCooldownMap = {};

        // Build a compact risky process list (dedup by normalized process label)
        const risky = [];
        const seen = new Set();
        for (const p of procs) {
            if (sid && this._isIgnoredProcessForStudent(sid, p)) continue;
            const risk = this._getRisk(p);
            if (risk === 'LOW') continue;
            const label = this._extractProcessLabel(p);
            const key = `${risk}:${label}`;
            if (seen.has(key)) continue;
            seen.add(key);
            risky.push({ p, risk, label });
        }

        risky.sort((a, b) => {
            const wa = a.risk === 'HIGH' ? 2 : 1;
            const wb = b.risk === 'HIGH' ? 2 : 1;
            return wb - wa;
        });

        // Emit at most 2 new alerts per payload, with per-process cooldown
        for (const item of risky) {
            const cooldownMs = item.risk === 'HIGH' ? 20000 : 30000;
            const ckey = `${sid || 'unknown'}|${item.risk}|${item.label}`;
            const last = this._riskAlertCooldownMap[ckey] || 0;
            if ((now - last) < cooldownMs) continue;
            this._riskAlertCooldownMap[ckey] = now;

            const msg = item.risk === 'HIGH'
                ? `Application suspecte : ${item.label}`
                : `Risque moyen : ${item.label}`;
            this.addGlobalAlert(data.studentName || 'Etudiant', data.studentId, msg, item.risk === 'HIGH' ? 'high' : 'medium');
            generatedAlerts.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
            if (generatedAlerts.length >= 2) break;
        }

        // Feed monitor alert panel with both local detection and source alerts
        data.alerts = [...baseAlerts.slice(-15), ...generatedAlerts].slice(-20);

        // Refresh modal once alerts are augmented so the right panel updates immediately.
        if (sid && ProfData.monitoringStudentId && sid === ProfData.monitoringStudentId.toString()) {
            this._renderMonitorData(data);
        }
    },
    addGlobalAlert(studentName, studentId, message, level = 'high') {
        const time = new Date().toLocaleTimeString('fr-FR');
        this._pmAlertCount++;

        // PERF FIX: Prune report log to keep it under 500 items
        if (this._reportLog.length > 500) {
            this._reportLog = this._reportLog.slice(-450);
        }

        this._reportLog.push({ time, studentName: studentName || 'Etudiant', studentId: studentId || '', message, level });

        // PERF FIX: Debounced save to localStorage
        if (ProfData.currentSessionDetails?._id) {
            if (this._alertSaveTimeout) clearTimeout(this._alertSaveTimeout);
            this._alertSaveTimeout = setTimeout(() => {
                try {
                    localStorage.setItem('alerts_' + ProfData.currentSessionDetails._id, JSON.stringify(this._reportLog));
                } catch (e) { }
            }, 2000);
        }

        this.showGlobalToast(studentName, message, level);

        try {
            // Audio spam protection: one beep max every 1.5s.
            const nowMs = Date.now();
            this._lastAlertBeepAt = this._lastAlertBeepAt || 0;
            if ((nowMs - this._lastAlertBeepAt) > 1500) {
                this._lastAlertBeepAt = nowMs;
                if (!this._alertAudioCtx) this._alertAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const ctx = this._alertAudioCtx;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                if (level === 'high') {
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(600, ctx.currentTime);
                    osc.frequency.setValueAtTime(800, ctx.currentTime + 0.15);
                    gain.gain.setValueAtTime(0.1, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.4);
                } else {
                    osc.type = 'sine';
                    osc.frequency.value = 440;
                    gain.gain.setValueAtTime(0.08, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.25);
                }
            }
        } catch (e) { }

        const sid = studentId?.toString() || '';
        const prevRisk = this._studentRiskMap[sid] || 'low';
        if (level === 'high' || (level === 'medium' && prevRisk === 'low')) {
            this._studentRiskMap[sid] = level;
            const dot = document.getElementById(`pm-student-${sid}`)?.querySelector('.pm-risk-dot');
            if (dot) dot.className = `pm-risk-dot ${level}`;
        }

        const alertsBox = document.getElementById('pm-global-alerts');
        if (alertsBox) {
            const alertEl = document.createElement('div');
            alertEl.className = `pm-alert-item ${level === 'high' ? '' : 'medium'}`;
            alertEl.innerHTML = `<span>${level === 'high' ? 'ALERTE' : 'WARN'}</span><div><strong>${studentName}</strong> - ${message}<br><span style="font-size:9px;opacity:.6;">${new Date().toLocaleTimeString()}</span></div>`;
            const ph = alertsBox.querySelector('[style*="Aucune alerte"]');
            if (ph) ph.remove();
            alertsBox.insertBefore(alertEl, alertsBox.firstChild);
            if (alertsBox.children.length > 50) alertsBox.lastChild.remove();
        }

        const badge = document.getElementById('pm-alerts-count');
        if (badge) {
            badge.style.display = 'inline';
            badge.textContent = this._pmAlertCount;
        }
    },
    showGlobalToast(studentName, message, level) {
        const container = document.getElementById('global-toast-container') || (() => {
            const c = document.createElement('div'); c.id = 'global-toast-container';
            c.style.cssText = 'position:fixed; top:20px; right:20px; z-index:100000; display:flex; flex-direction:column; gap:12px; pointer-events:none;';
            document.body.appendChild(c); return c;
        })();

        // PERF FIX: Limit number of concurrent toasts to avoid DOM bloat
        if (container.children.length >= 3) {
            container.removeChild(container.firstChild);
        }

        const toast = document.createElement('div'); const isHigh = level === 'high';
        toast.style.cssText = `background:${isHigh ? 'linear-gradient(135deg, #7f1d1d, #b91c1c)' : 'linear-gradient(135deg, #78350f, #d97706)'}; color:white; padding:16px 20px; border-radius:16px; min-width:320px; box-shadow:0 20px 40px rgba(0,0,0,0.4); display:flex; gap:14px; animation:slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; pointer-events:auto; cursor:pointer; backdrop-filter:blur(10px);`;
        toast.innerHTML = `<div style="font-size:24px;">${isHigh ? 'ðŸš¨' : 'âš ï¸'}</div><div><div style="font-size:10px; font-weight:800; opacity:0.7;">Alerte de sÃ©curitÃ©</div><div style="font-size:14px; font-weight:700;"><span style="color:${isHigh ? '#fca5a5' : '#fcd34d'}">${studentName}</span></div><div style="font-size:13px; opacity:0.9;">${message}</div></div>`;
        toast.onclick = () => { toast.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); };
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) { toast.style.animation = 'fadeOut 0.5s ease forwards'; setTimeout(() => toast.remove(), 500); } }, 7000);
    },

    closeDetailsModal() {
        if (ProfData.detailsInterval) clearInterval(ProfData.detailsInterval);
        if (this._waitingPollInterval) clearInterval(this._waitingPollInterval);
        this._pmAlertCount = 0; this._studentRiskMap = {};
        const badge = document.getElementById('pm-alerts-count'); if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
        const modal = document.getElementById('detailsModal'); if (modal) modal.classList.remove('open');
    },

    openMonitorModal(sid, name) {
        ProfData.monitoringStudentId = sid ? sid.toString() : '';
        const modal = document.getElementById('monitorModal'); if (!modal) return;
        modal.classList.add('open');
        const studentTitle = document.getElementById('monitorStudentName');
        if (studentTitle) studentTitle.textContent = `Surveillance : ${name}`;
        const statusBar = document.getElementById('monitorStatusBar');
        if (statusBar) statusBar.textContent = 'Connexion au flux de surveillance...';

        const activeWindow = document.getElementById('monitorActiveWindow');
        const focusCount = document.getElementById('monitorFocusCount');
        const processCount = document.getElementById('monitorProcessCount');
        const lastUpdate = document.getElementById('monitorLastUpdate');
        const table = document.getElementById('monitorProcessTable');
        const alertList = document.getElementById('monitorAlertList');
        if (activeWindow) activeWindow.textContent = '—';
        if (focusCount) focusCount.textContent = '0';
        if (processCount) processCount.textContent = '0';
        if (lastUpdate) lastUpdate.textContent = '—';
        if (table) table.innerHTML = `<div style="text-align:center; padding:40px; color:rgba(255,255,255,.2);">En attente des données de surveillance...</div>`;
        if (alertList) alertList.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,.2); font-size:11px;">Aucune alerte</div>`;

        if (!this._lockedStudentsSet) this._lockedStudentsSet = new Set();
        this._updateMonitorLockButtons(this._lockedStudentsSet.has(ProfData.monitoringStudentId));
        this.fetchStudentMonitoring(ProfData.monitoringStudentId);
    },

    closeMonitorModal() {
        ProfData.monitoringStudentId = null;
        document.getElementById('monitorModal')?.classList.remove('open');
    },

    async fetchStudentMonitoring(sid) {
        const sidStr = sid ? sid.toString() : '';
        if (!sidStr) return;
        const cached = this._monitorLiveData?.[sidStr];
        if (cached) this._renderMonitorData(cached);
    },

    lockdownStudent() {
        const sid = ProfData.monitoringStudentId ? ProfData.monitoringStudentId.toString() : '';
        if (!sid) { alert("Aucun étudiant sélectionné."); return; }
        if (!this.socket) this.initSocket();
        if (!this.socket) { alert("WebSocket indisponible."); return; }

        this.socket.emit('lockdown-student', { studentId: sid });
        if (!this._lockedStudentsSet) this._lockedStudentsSet = new Set();
        this._lockedStudentsSet.add(sid);
        this._updateMonitorLockButtons(true);
        const statusBar = document.getElementById('monitorStatusBar');
        if (statusBar) statusBar.textContent = 'Commande envoyée: verrouillage demandé.';
    },

    unlockStudent() {
        const sid = ProfData.monitoringStudentId ? ProfData.monitoringStudentId.toString() : '';
        if (!sid) { alert("Aucun étudiant sélectionné."); return; }
        if (!this.socket) this.initSocket();
        if (!this.socket) { alert("WebSocket indisponible."); return; }

        this.socket.emit('unlock-student', { studentId: sid });
        if (!this._lockedStudentsSet) this._lockedStudentsSet = new Set();
        this._lockedStudentsSet.delete(sid);
        this._updateMonitorLockButtons(false);
        const statusBar = document.getElementById('monitorStatusBar');
        if (statusBar) statusBar.textContent = 'Commande envoyée: déverrouillage demandé.';
    },

    _updateMonitorLockButtons(isLocked) {
        const lockBtn = document.getElementById('monitorLockBtn');
        const unlockBtn = document.getElementById('monitorUnlockBtn');
        if (lockBtn) lockBtn.style.display = isLocked ? 'none' : 'inline-flex';
        if (unlockBtn) unlockBtn.style.display = isLocked ? 'inline-flex' : 'none';
    },

    _renderMonitorData(data) {
        const sid = data?.studentId ? data.studentId.toString() : '';
        const selectedSid = ProfData.monitoringStudentId ? ProfData.monitoringStudentId.toString() : '';
        if (!sid || sid !== selectedSid) return;

        const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const procs = Array.isArray(data.processes) ? data.processes : [];
        const activeWindow = (data.activeWindow || '—').toString();
        const focusChanges = Number.isFinite(Number(data.focusChanges)) ? Number(data.focusChanges) : 0;
        const statusBar = document.getElementById('monitorStatusBar');
        const activeWindowEl = document.getElementById('monitorActiveWindow');
        const focusCountEl = document.getElementById('monitorFocusCount');
        const processCountEl = document.getElementById('monitorProcessCount');
        const lastUpdateEl = document.getElementById('monitorLastUpdate');
        const riskBadgeEl = document.getElementById('monitorRiskBadge');
        const processTableEl = document.getElementById('monitorProcessTable');
        const alertListEl = document.getElementById('monitorAlertList');

        if (statusBar) statusBar.textContent = `Flux actif pour ${data.studentName || 'étudiant'}`;
        if (activeWindowEl) activeWindowEl.textContent = activeWindow || '—';
        if (focusCountEl) focusCountEl.textContent = String(focusChanges);
        if (processCountEl) processCountEl.textContent = String(procs.length);
        if (lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString('fr-FR');

        let risk = 'LOW';
        for (const p of procs) {
            const r = this._getRiskForStudent(p, sid);
            if (r === 'HIGH') { risk = 'HIGH'; break; }
            if (r === 'MEDIUM' && risk !== 'HIGH') risk = 'MEDIUM';
        }
        if (focusChanges >= 5 && risk !== 'HIGH') risk = 'MEDIUM';

        if (riskBadgeEl) {
            if (risk === 'HIGH') {
                riskBadgeEl.textContent = '⛔ ÉLEVÉ';
                riskBadgeEl.style.background = 'rgba(239,68,68,0.15)';
                riskBadgeEl.style.color = '#ef4444';
                riskBadgeEl.style.borderColor = 'rgba(239,68,68,0.35)';
            } else if (risk === 'MEDIUM') {
                riskBadgeEl.textContent = '⚠️ MOYEN';
                riskBadgeEl.style.background = 'rgba(245,158,11,0.15)';
                riskBadgeEl.style.color = '#f59e0b';
                riskBadgeEl.style.borderColor = 'rgba(245,158,11,0.35)';
            } else {
                riskBadgeEl.textContent = '✅ FAIBLE';
                riskBadgeEl.style.background = 'rgba(34,197,94,0.15)';
                riskBadgeEl.style.color = '#22c55e';
                riskBadgeEl.style.borderColor = 'rgba(34,197,94,0.3)';
            }
        }
        if (processTableEl) {
            if (!procs.length) {
                processTableEl.innerHTML = `<div style="text-align:center; padding:40px; color:rgba(255,255,255,.25);">Aucun processus detecte</div>`;
            } else {
                const riskWeight = (r) => r === 'HIGH' ? 2 : (r === 'MEDIUM' ? 1 : 0);
                const sortedProcs = [...procs].sort((a, b) => {
                    const ra = this._getRiskForStudent(a, sid);
                    const rb = this._getRiskForStudent(b, sid);
                    const rw = riskWeight(rb) - riskWeight(ra);
                    if (rw !== 0) return rw;
                    const ma = Number(a?.Memory || 0);
                    const mb = Number(b?.Memory || 0);
                    return mb - ma;
                });

                processTableEl.innerHTML = sortedProcs.slice(0, 120).map((p) => {
                    const name = esc(p.Name || p.ProcessName || '-');
                    const pid = esc(p.Id || p.PID || '-');
                    const mem = esc((p.Memory !== undefined && p.Memory !== null) ? `${p.Memory} MB` : (p.WorkingSet || '-'));
                    const title = esc(p.WindowTitle || p.MainWindowTitle || '');
                    const r = this._getRiskForStudent(p, sid);
                    const color = r === 'HIGH' ? '#ef4444' : (r === 'MEDIUM' ? '#f59e0b' : '#22c55e');
                    const rowBg = r === 'HIGH'
                        ? 'background:rgba(239,68,68,0.09);'
                        : (r === 'MEDIUM' ? 'background:rgba(245,158,11,0.08);' : '');
                    const label = this._extractProcessLabel(p);
                    const jsLabel = label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    const ignored = this._isIgnoredProcessForStudent(sid, p);
                    const btnBg = ignored ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.08)';
                    const btnBorder = ignored ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.15)';
                    const btnColor = ignored ? '#34d399' : 'rgba(255,255,255,0.8)';
                    return `<div style="display:grid;grid-template-columns:2fr 60px 70px 2fr 90px 88px;padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.04);align-items:center;${rowBg}">
                        <span style="color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
                        <span style="color:rgba(255,255,255,.65);">${pid}</span>
                        <span style="color:rgba(255,255,255,.65);">${mem}</span>
                        <span style="color:rgba(255,255,255,.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title || '-'}</span>
                        <span style="font-weight:700;color:${color};">${r}</span>
                        <button title="${ignored ? 'Retirer ignore' : 'Ignorer cette application'}" onclick="ProfVM.toggleIgnoreProcess('${sid}', '${jsLabel}')" style="height:24px;border-radius:6px;border:1px solid ${btnBorder};background:${btnBg};color:${btnColor};font-size:10px;font-weight:700;cursor:pointer;">${ignored ? 'Ignore' : 'Ignorer'}</button>
                    </div>`;
                }).join('');
            }
        }
        if (alertListEl) {
            const alerts = Array.isArray(data.alerts) ? data.alerts.slice(-20) : [];
            if (!alerts.length) {
                alertListEl.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,.2); font-size:11px;">Aucune alerte</div>`;
            } else {
                alertListEl.innerHTML = alerts.reverse().map(a => {
                    const txt = String(a || '');
                    const isHigh = /application suspecte|high|suspecte/i.test(txt);
                    const border = isHigh ? 'rgba(239,68,68,.35)' : 'rgba(245,158,11,.25)';
                    const bg = isHigh ? 'rgba(239,68,68,.10)' : 'rgba(245,158,11,.08)';
                    const color = isHigh ? '#fecaca' : '#fcd34d';
                    return `<div style="padding:8px 10px;margin-bottom:6px;border:1px solid ${border};background:${bg};border-radius:8px;font-size:11px;color:${color};">${esc(txt)}</div>`;
                }).join('');
            }
        }
    },

    _extractProcessLabel(p) {
        const raw = String(p?.Name || p?.ProcessName || p?.WindowTitle || p?.MainWindowTitle || 'process').toLowerCase().trim();
        const cleaned = raw.replace(/\.exe$/i, '').replace(/_crashpad(_handler|_reporter)?$/i, '').replace(/-crashpad(_handler|_reporter)?$/i, '');
        return cleaned || 'process';
    },

    _getIgnoreStorageKey(studentId) {
        const testId = (ProfData.currentSessionDetails?._id || ProfData.currentSessionDetails?.id || 'session').toString();
        const sid = (studentId || '').toString();
        return `_monitor_ignored_${testId}_${sid}`;
    },

    _getIgnoredAppsForStudent(studentId) {
        const sid = (studentId || '').toString();
        if (!sid) return new Set();
        if (!this._ignoredAppsByStudent) this._ignoredAppsByStudent = {};
        if (this._ignoredAppsByStudent[sid]) return this._ignoredAppsByStudent[sid];
        const key = this._getIgnoreStorageKey(sid);
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { arr = []; }
        const set = new Set((arr || []).map(v => String(v || '').toLowerCase()).filter(Boolean));
        this._ignoredAppsByStudent[sid] = set;
        return set;
    },

    _isIgnoredProcessForStudent(studentId, p) {
        const sid = (studentId || '').toString();
        if (!sid) return false;
        const label = this._extractProcessLabel(p);
        return this._getIgnoredAppsForStudent(sid).has(label);
    },

    _getRiskForStudent(p, studentId) {
        if (this._isIgnoredProcessForStudent(studentId, p)) return 'LOW';
        return this._getRisk(p);
    },

    toggleIgnoreProcess(studentId, processLabel) {
        const sid = (studentId || '').toString();
        const label = String(processLabel || '').toLowerCase().trim();
        if (!sid || !label) return;
        const set = this._getIgnoredAppsForStudent(sid);
        if (set.has(label)) set.delete(label);
        else set.add(label);

        try {
            localStorage.setItem(this._getIgnoreStorageKey(sid), JSON.stringify(Array.from(set)));
        } catch (_) { }

        if (ProfData.monitoringStudentId && ProfData.monitoringStudentId.toString() === sid) {
            const payload = this._monitorLiveData?.[sid];
            if (payload) this._renderMonitorData(payload);
        }
    },

    _getRisk(p) {
        const name = (p.Name || p.ProcessName || '').toLowerCase();
        const title = (p.WindowTitle || p.MainWindowTitle || '').toLowerCase();
        const haystack = `${name} ${title}`;
        const suspicious = ['chrome', 'firefox', 'msedge', 'opera', 'brave', 'anydesk', 'teamviewer', 'discord', 'skype', 'whatsapp', 'telegram'];
        if (suspicious.some(s => haystack.includes(s))) return 'HIGH';
        const medium = ['cmd', 'powershell', 'terminal', 'code', 'visual studio', 'calculator'];
        if (medium.some(s => haystack.includes(s))) return 'MEDIUM';
        return 'LOW';
    },
    openMessageModal(sid, name) {
        ProfData.messageStudentId = sid ? sid.toString() : '';
        const modal = document.getElementById('privateMsgModal') || document.getElementById('messageModal');
        if (!modal) {
            const quickText = prompt(`Message a ${name}:`);
            if (quickText && quickText.trim()) this.sendPrivateMessage(quickText.trim());
            return;
        }
        modal.classList.add('open');

        const privateTargetEl = document.getElementById('privateMsgTarget');
        if (privateTargetEl) privateTargetEl.textContent = `A ${name}`;

        const legacyTitleEl = document.getElementById('messageTitle');
        if (legacyTitleEl) legacyTitleEl.textContent = `Message a ${name}`;

        const statusEl = document.getElementById('privateMsgStatus');
        if (statusEl) statusEl.textContent = '';

        const input = document.getElementById('privateMsgInput') || document.getElementById('messageInput');
        if (input) { input.value = ''; input.focus(); }
    },

    closeMessageModal() {
        document.getElementById('privateMsgModal')?.classList.remove('open');
        document.getElementById('messageModal')?.classList.remove('open');
    },

    async sendPrivateMessage(forcedText = null) {
        const input = document.getElementById('privateMsgInput') || document.getElementById('messageInput');
        const text = (forcedText !== null ? String(forcedText) : (input?.value || '')).trim();
        if (!text) return;

        const studentId = ProfData.messageStudentId ? ProfData.messageStudentId.toString() : '';
        if (!studentId) {
            alert('Aucun etudiant selectionne.');
            return;
        }

        const sendBtn = document.getElementById('privateMsgSendBtn');
        const statusEl = document.getElementById('privateMsgStatus');
        if (sendBtn) sendBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Envoi en cours...';

        try {
            // Preferred path: backend WebSocket event supported by PracticalTestGateway.
            if (!this.socket) this.initSocket();
            if (this.socket) {
                if (!this.socket.connected && typeof this.socket.connect === 'function') this.socket.connect();
                if (!this.socket.connected) {
                    await new Promise((resolve, reject) => {
                        const to = setTimeout(() => reject(new Error('Socket connection timeout')), 2500);
                        const onConnect = () => { clearTimeout(to); this.socket.off('connect_error', onErr); resolve(); };
                        const onErr = (err) => { clearTimeout(to); this.socket.off('connect', onConnect); reject(err || new Error('Socket connect error')); };
                        this.socket.once('connect', onConnect);
                        this.socket.once('connect_error', onErr);
                    });
                }
                this.socket.emit('send-private-message', { studentId, message: text });
                if (statusEl) statusEl.textContent = 'Message envoye.';
                this.closeMessageModal();
                alert('Message envoye.');
                return;
            }

            // Fallback path for older deployments exposing HTTP.
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/message`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId, message: text, testId: ProfData.currentSessionDetails?._id })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            if (statusEl) statusEl.textContent = 'Message envoye.';
            this.closeMessageModal();
            alert('Message envoye.');
        } catch (e) {
            if (statusEl) statusEl.textContent = 'Echec de l envoi.';
            alert('Erreur d envoi du message.');
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    },

    async sendMessage() { return this.sendPrivateMessage(); },

    async togglePause(id, isPaused) {
        try {
            const token = sessionStorage.getItem('accessToken');
            // Backend uses one POST endpoint that toggles pause/resume state.
            const resp = await fetch(`${API_BASE}/practical-tests/${id}/pause`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            if (resp.ok) this.refreshSessionDetails(id, true, 0, true);
            else alert(`Erreur serveur lors de la ${isPaused ? 'reprise' : 'mise en pause'}.`);
        } catch (e) { alert("Erreur rÃ©seau : " + e.message); }
    },

    async endSession(id) {
        if (!confirm("Terminer cette session ?")) return;
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/${id}/end`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            if (resp.ok) this.refreshSessionDetails(id, true, 0, true);
            else alert("Erreur serveur lors de la clÃ´ture.");
        } catch (e) { alert("Erreur rÃ©seau : " + e.message); }
    },

    async extendSession(id, mins) {
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/${id}/extend`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ minutes: mins })
            });
            if (resp.ok) this.refreshSessionDetails(id, true, 0, true);
            else alert("Erreur serveur lors de la prolongation.");
        } catch (e) { alert("Erreur rÃ©seau : " + e.message); }
    },

    async generatePDFReport() {
        const s = ProfData.currentSessionDetails;
        if (!s) return;
        const logs = this._reportLog || [];
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(22); doc.setTextColor(40, 44, 52); doc.text("Rapport d'Anomalies de Session", 20, 20);
        doc.setFontSize(10); doc.setTextColor(100); doc.text(`GÃ©nÃ©rÃ© le : ${new Date().toLocaleString()}`, 20, 28);
        doc.setDrawColor(200); doc.line(20, 32, 190, 32);
        doc.setFontSize(12); doc.setTextColor(0); doc.text("Informations Session", 20, 42);
        doc.setFontSize(10);
        doc.text(`Sujet: ${s.subject || 'N/A'}`, 25, 50);
        doc.text(`Classe: ${s.classe?.nom || 'N/A'}`, 25, 56);
        doc.text(`Code: ${s.sessionCode || 'N/A'}`, 25, 62);
        doc.text(`Date: ${new Date(s.startedAt).toLocaleDateString()}`, 25, 68);
        const tableData = logs.map(l => [l.time, l.studentName, l.level === 'high' ? 'Ã‰levÃ©' : 'Moyen', l.message]);
        doc.autoTable({ startY: 80, head: [['Heure', 'Ã‰tudiant', 'Risque', 'Description']], body: tableData, headStyles: { fillColor: [88, 101, 242] }, alternateRowStyles: { fillColor: [245, 245, 255] } });
        doc.save(`Rapport_${s.sessionCode}.pdf`);
    }
});

