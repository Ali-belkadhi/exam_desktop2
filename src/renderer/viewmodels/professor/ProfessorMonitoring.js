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
                        const icon = entry.level === 'high' ? '🔴' : '🟡';
                        const alertEl = document.createElement('div');
                        alertEl.className = `pm-alert-item ${alertClass}`;
                        alertEl.innerHTML = `<span>${icon}</span><div><strong>${entry.studentName}</strong> — ${entry.message}<br><span style="font-size:9px;opacity:.6;">${entry.time}</span></div>`;
                        alertsBox.appendChild(alertEl);
                        const sid = entry.studentId?.toString() || '';
                        if (sid) {
                            const prevRisk = this._studentRiskMap[sid] || 'low';
                            if (entry.level === 'high' || (entry.level === 'medium' && prevRisk === 'low')) this._studentRiskMap[sid] = entry.level;
                        }
                    });
                }
            }
        } catch(e) { 
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
                } catch(e) {}
            }, 10000); // 10s is enough for local fallback
            this.socket.on('studentPresenceChanged', () => this.refreshSessionDetails(id, true));
            this.socket.on('student-waiting', (data) => {
                if (data.studentId) this._waitingStudentsSet.add(data.studentId.toString());
                try {
                    const key = `_waiting_${id}`;
                    const existing = JSON.parse(localStorage.getItem(key) || '[]');
                    const sid = data.studentId ? data.studentId.toString() : '';
                    if (sid && !existing.some(e => e.studentId === sid)) {
                        existing.push({ studentId: sid, studentName: data.studentName || '' });
                        localStorage.setItem(key, JSON.stringify(existing));
                    }
                } catch(e) {}
                this.refreshSessionDetails(id, true);
            });
        }
        if (ProfData.detailsInterval) clearInterval(ProfData.detailsInterval);
        ProfData.detailsInterval = setInterval(() => this.refreshSessionDetails(id, true), 30000);
    },

    _rerenderParticipantsFromCache(id) {
        if (ProfData.currentSessionDetails && (ProfData.currentSessionDetails._id === id || ProfData.currentSessionDetails.id === id)) {
            this.refreshSessionDetails(id, true);
        }
    },

    async refreshSessionDetails(id, isSilent = false, _retryCount = 0) {
        // PERF FIX: Prevent multiple concurrent refreshes and throttle frequency
        if (this._pmIsRefreshing) return;
        const now = Date.now();
        if (isSilent && this._pmLastRefresh && (now - this._pmLastRefresh < 5000)) return; // Throttle silent refreshes to 5s min

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
            subheader.textContent = `Session ${data.sessionCode} ${data.classe?.nom ? '· ' + data.classe.nom : ''}`;
            if (data.isActive !== false && !data.endedAt) {
                controls.style.display = 'block';
                const pauseLabel = data.isPaused ? '▶️ Reprendre' : '⏸️ Mettre en pause';
                controls.innerHTML = `<div class="control-panel">
                    <button class="cp-btn ${data.isPaused ? 'resume' : 'pause'}" onclick="ProfVM.togglePause('${id}', ${data.isPaused})">${pauseLabel}</button>
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
            } catch(e) {}

            const normalizeName = (v) => (v || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
            const waitingByName = new Map();
            waitingEntries.forEach(entry => {
                const key = normalizeName(entry?.studentName);
                if (key && entry?.studentId && !waitingByName.has(key)) waitingByName.set(key, entry.studentId.toString());
            });
            const matchedWaitingIds = new Set();

            let countActif = 0, countInactif = 0;
            if (students.length === 0) {
                participantsList.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">📭 Aucun étudiant inscrit.</div>`;
            } else {
                let html = '';
                students.forEach(st => {
                    // st can be a string ID or a populated object
                    const sRaw = st._id || st.id || st;
                    const sidStr = sRaw ? (typeof sRaw === 'object' && sRaw.$oid ? sRaw.$oid : sRaw.toString()) : '';
                    const pObj = participantMap.get(sidStr);
                    
                    // Robust student data: try to get names from pObj or st
                    const sRef = (pObj && pObj.student) ? pObj.student : (typeof st === 'object' ? st : {});
                    const prenom = sRef.prenom || '';
                    const nom = sRef.nom || '';
                    const displayName = (prenom || nom) ? `${prenom} ${nom}`.trim() : `Étudiant (${sidStr.substring(sidStr.length - 4)})`;
                    const initials = (prenom && nom) ? (prenom[0] + nom[0]).toUpperCase() : (prenom ? prenom[0] : (nom ? nom[0] : '?')).toUpperCase();
                    const nc = sRef.studentCardNumber || 'N/A';

                    const waitingIdByName = waitingByName.get(normalizeName(displayName)) || null;
                    const waitingControlId = waitingIdByName || sidStr;
                    if (waitingIdByName) matchedWaitingIds.add(waitingIdByName);

                    const hasGranted = localStorage.getItem('_accessGranted_' + waitingControlId) === '1';
                    const hasDenied = localStorage.getItem('_accessDenied_' + waitingControlId) === '1';

                    // Online status from backend (pObj exists if they are in the participants list)
                    const isOnline = !!pObj;
                    
                    // A student is waiting if they have 'waiting' status in DB OR if we received a WebSocket signal
                    // We don't strictly require isOnline here to be more resilient to heartbeat lag
                    const isWaiting = (
                        pObj?.status === 'waiting' ||
                        this._waitingStudentsSet.has(sidStr) ||
                        (waitingIdByName && this._waitingStudentsSet.has(waitingIdByName))
                    ) && !hasGranted && !hasDenied;
                    
                    // A student is actif ONLY if they are online AND (have 'actif' status OR have been granted access)
                    const isActif = isOnline && !isWaiting && !hasDenied && (hasGranted || pObj.status === 'actif');

                    if (isActif) countActif++; else countInactif++; // Simplified counting
                    const riskLevel = isActif ? (this._studentRiskMap[sidStr] || 'low') : 'inactive';
                    const avatarBg = isActif ? 'background:linear-gradient(135deg,#10b981,#059669);' : (isWaiting ? 'background:linear-gradient(135deg,#f59e0b,#d97706);' : '');
                    html += `<div class="pm-student-item" id="pm-student-${sidStr}">
                        <div class="pm-student-avatar" style="${avatarBg}">${initials}<div class="pm-risk-dot ${riskLevel}"></div></div>
                        <div class="pm-student-info"><div class="pm-student-name">${displayName}</div><div class="pm-student-nc">NC: ${nc}</div></div>
                        <div class="pm-student-actions">
                            ${isWaiting ? `<button class="pm-action-btn" onclick="ProfVM.grantAccess('${id}', '${waitingControlId}')">✔️</button><button class="pm-action-btn" onclick="ProfVM.denyAccess('${id}', '${waitingControlId}')">❌</button>` : ''}
                            ${isActif ? `<button class="pm-action-btn" onclick="ProfVM.viewStudentScreenInPanel('${sidStr}','${displayName}')">📺</button><button class="pm-action-btn" onclick="ProfVM.openMonitorModal('${sidStr}','${displayName}')">🔍</button><button class="pm-action-btn" onclick="ProfVM.openMessageModal('${sidStr}','${displayName}')">💬</button>` : ''}
                            ${pObj?.quizResult ? `<span class="pm-student-badge actif">✓ ${pObj.quizResult.score}/${pObj.quizResult.maxScore}</span>` : ''}
                            <span class="pm-student-badge ${isActif ? 'actif' : (isWaiting ? 'waiting' : '')}">${isActif ? 'Actif' : (isWaiting ? 'En attente' : 'Inscrit')}</span>
                        </div>
                    </div>`;
                });

                // Some waiting students can use an ID that differs from classe.students IDs.
                // Add fallback rows so professor can always accept/refuse immediately.
                waitingEntries.forEach((entry) => {
                    const waitingId = entry?.studentId ? entry.studentId.toString() : '';
                    if (!waitingId || matchedWaitingIds.has(waitingId)) return;

                    const hasGranted = localStorage.getItem('_accessGranted_' + waitingId) === '1';
                    const hasDenied = localStorage.getItem('_accessDenied_' + waitingId) === '1';
                    const isWaiting = this._waitingStudentsSet.has(waitingId) && !hasGranted && !hasDenied;
                    if (!isWaiting) return;

                    const displayName = (entry?.studentName || '').toString().trim() || `Étudiant (${waitingId.slice(-4)})`;
                    const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
                    const riskLevel = 'inactive';
                    countInactif++;

                    html += `<div class="pm-student-item" id="pm-student-${waitingId}">
                        <div class="pm-student-avatar" style="background:linear-gradient(135deg,#f59e0b,#d97706);">${initials}<div class="pm-risk-dot ${riskLevel}"></div></div>
                        <div class="pm-student-info"><div class="pm-student-name">${displayName}</div><div class="pm-student-nc">NC: N/A</div></div>
                        <div class="pm-student-actions">
                            <button class="pm-action-btn" onclick="ProfVM.grantAccess('${id}', '${waitingId}')">✔️</button>
                            <button class="pm-action-btn" onclick="ProfVM.denyAccess('${id}', '${waitingId}')">❌</button>
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
                participantsList.innerHTML = `<div style="text-align:center;padding:40px;color:#ed4245;">⚠️ ${e.message}<br><button onclick="ProfVM.refreshSessionDetails('${id}')" style="margin-top:12px;">🔄 Réessayer</button></div>`;
                subheader.textContent = 'Erreur';
            }
        } finally {
            this._pmIsRefreshing = false;
        }
    },

    async grantAccess(testId, studentId) {
        this._waitingStudentsSet.delete(studentId.toString());
        try {
            const key = `_waiting_${testId}`;
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            const updated = list.filter(e => e.studentId !== studentId.toString());
            if (updated.length) localStorage.setItem(key, JSON.stringify(updated)); else localStorage.removeItem(key);
        } catch(e) {}

        if (this.socket) this.socket.emit('grant-student-access', { testId, studentId });
        localStorage.setItem('_accessGranted_' + studentId, '1');
        localStorage.removeItem('_accessDenied_' + studentId);
        
        // Force DB status update immediately to 'actif'
        try {
            const token = sessionStorage.getItem('accessToken');
            await fetch(`${window.APP_CONFIG.API_BASE}/practical-tests/${testId}/participants/${studentId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: 'actif' })
            }).catch(() => {});
        } catch(e) {}

        this.refreshSessionDetails(testId, true);
    },

    async denyAccess(testId, studentId) {
        this._waitingStudentsSet.delete(studentId.toString());
        try {
            const key = `_waiting_${testId}`;
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            const updated = list.filter(e => e.studentId !== studentId.toString());
            if (updated.length) localStorage.setItem(key, JSON.stringify(updated)); else localStorage.removeItem(key);
        } catch(e) {}

        if (this.socket) this.socket.emit('deny-student-access', { testId, studentId });
        localStorage.setItem('_accessDenied_' + studentId, '1');
        localStorage.removeItem('_accessGranted_' + studentId);
        
        // Force DB status update immediately to 'inscrit'
        try {
            const token = sessionStorage.getItem('accessToken');
            await fetch(`${window.APP_CONFIG.API_BASE}/practical-tests/${testId}/participants/${studentId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: 'inscrit' })
            }).catch(() => {});
        } catch(e) {}

        this.refreshSessionDetails(testId, true);
    },

    viewStudentScreenInPanel(studentId, studentName) {
        const container = document.getElementById('pm-screen-container');
        const nameLabel = document.getElementById('pm-screen-student-name');
        const btnFullscreen = document.getElementById('pm-btn-fullscreen');
        if (!container) return;
        if (nameLabel) nameLabel.textContent = studentName;
        if (btnFullscreen) btnFullscreen.style.display = 'flex';
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
        
        // PERF FIX: Ignore repeated alerts from the same student within 3 seconds
        if (sid) {
            const lastAlertTime = this._lastAlertTimes?.[sid] || 0;
            if (now - lastAlertTime < 3000) return;
            if (!this._lastAlertTimes) this._lastAlertTimes = {};
            this._lastAlertTimes[sid] = now;
        }

        const procs = data.processes || [];
        let globalRisk = 'low';
        procs.forEach(p => {
            const risk = this._getRisk(p);
            if (risk === 'HIGH') { globalRisk = 'high'; this.addGlobalAlert(data.studentName || 'Étudiant', data.studentId, `Application suspecte : ${p.Name}`, 'high'); }
            else if (risk === 'MEDIUM' && globalRisk !== 'high') { globalRisk = 'medium'; this.addGlobalAlert(data.studentName || 'Étudiant', data.studentId, `Risque moyen : ${p.Name}`, 'medium'); }
        });
    },

    addGlobalAlert(studentName, studentId, message, level = 'high') {
        const time = new Date().toLocaleTimeString('fr-FR');
        this._pmAlertCount++;
        
        // PERF FIX: Prune report log to keep it under 500 items
        if (this._reportLog.length > 500) {
            this._reportLog = this._reportLog.slice(-450);
        }

        this._reportLog.push({ time, studentName: studentName || 'Étudiant', studentId: studentId || '', message, level });
        
        // PERF FIX: Debounced save to localStorage
        if (ProfData.currentSessionDetails?._id) {
            if (this._alertSaveTimeout) clearTimeout(this._alertSaveTimeout);
            this._alertSaveTimeout = setTimeout(() => {
                try { 
                    localStorage.setItem('alerts_' + ProfData.currentSessionDetails._id, JSON.stringify(this._reportLog)); 
                } catch(e) {}
            }, 2000); // Wait 2s before saving to Disk
        }

        this.showGlobalToast(studentName, message, level);
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            if (level === 'high') { osc.type = 'triangle'; osc.frequency.setValueAtTime(600, ctx.currentTime); osc.frequency.setValueAtTime(800, ctx.currentTime + 0.15); gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4); osc.start(); osc.stop(ctx.currentTime + 0.4); }
            else { osc.type = 'sine'; osc.frequency.value = 440; gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25); osc.start(); osc.stop(ctx.currentTime + 0.25); }
        } catch(e) {}
        const sid = studentId?.toString() || '';
        const prevRisk = this._studentRiskMap[sid] || 'low';
        if (level === 'high' || (level === 'medium' && prevRisk === 'low')) {
            this._studentRiskMap[sid] = level;
            const dot = document.getElementById(`pm-student-${sid}`)?.querySelector('.pm-risk-dot');
            if (dot) dot.className = `pm-risk-dot ${level}`;
        }
        const alertsBox = document.getElementById('pm-global-alerts');
        if (alertsBox) {
            const alertEl = document.createElement('div'); alertEl.className = `pm-alert-item ${level === 'high' ? '' : 'medium'}`;
            alertEl.innerHTML = `<span>${level === 'high' ? '🔴' : '🟡'}</span><div><strong>${studentName}</strong> — ${message}<br><span style="font-size:9px;opacity:.6;">${new Date().toLocaleTimeString()}</span></div>`;
            const ph = alertsBox.querySelector('[style*="Aucune alerte"]'); if (ph) ph.remove();
            alertsBox.insertBefore(alertEl, alertsBox.firstChild);
            if (alertsBox.children.length > 50) alertsBox.lastChild.remove();
        }
        const badge = document.getElementById('pm-alerts-count'); if (badge) { badge.style.display = 'inline'; badge.textContent = this._pmAlertCount; }
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
        toast.innerHTML = `<div style="font-size:24px;">${isHigh ? '🚨' : '⚠️'}</div><div><div style="font-size:10px; font-weight:800; opacity:0.7;">Alerte de sécurité</div><div style="font-size:14px; font-weight:700;"><span style="color:${isHigh ? '#fca5a5' : '#fcd34d'}">${studentName}</span></div><div style="font-size:13px; opacity:0.9;">${message}</div></div>`;
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
        ProfData.monitoringStudentId = sid;
        const modal = document.getElementById('monitorModal'); if (!modal) return;
        modal.classList.add('open');
        document.getElementById('monitorTitle').textContent = `Activités : ${name}`;
        this.fetchStudentMonitoring(sid);
    },

    closeMonitorModal() { document.getElementById('monitorModal')?.classList.remove('open'); },

    async fetchStudentMonitoring(sid) {
        const list = document.getElementById('monitorList'); if (!list) return;
        list.innerHTML = `<div style="text-align:center;padding:20px;"><div class="spin-ring" style="width:20px;height:20px;"></div></div>`;
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/monitoring/student/${sid}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) throw new Error();
            const data = await resp.json();
            const procs = Array.isArray(data.processes) ? data.processes : [];
            if (!procs.length) list.innerHTML = `<div style="text-align:center;padding:20px;opacity:0.5;">Aucun processus détecté.</div>`;
            else {
                list.innerHTML = `<table style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead><tr style="text-align:left; opacity:0.5; border-bottom:1px solid rgba(255,255,255,0.1);"><th style="padding:8px;">Processus</th><th>Statut</th><th>Risque</th></tr></thead>
                    <tbody>${procs.map(p => {
                        const risk = this._getRisk(p);
                        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:8px;">${p.Name}</td><td>En cours</td><td><span class="risk-badge ${risk.toLowerCase()}">${risk}</span></td></tr>`;
                    }).join('')}</tbody></table>`;
            }
        } catch(e) { list.innerHTML = `<div style="color:#ed4245;padding:20px;">Erreur réseau</div>`; }
    },

    _getRisk(p) {
        const name = (p.Name || '').toLowerCase();
        const suspicious = ['chrome', 'firefox', 'msedge', 'opera', 'brave', 'anydesk', 'teamviewer', 'discord', 'skype', 'whatsapp', 'telegram'];
        if (suspicious.some(s => name.includes(s))) return 'HIGH';
        const medium = ['cmd', 'powershell', 'terminal', 'code', 'visual studio', 'calculator'];
        if (medium.some(s => name.includes(s))) return 'MEDIUM';
        return 'LOW';
    },

    openMessageModal(sid, name) {
        ProfData.messageStudentId = sid;
        const modal = document.getElementById('messageModal'); if (!modal) return;
        modal.classList.add('open');
        document.getElementById('messageTitle').textContent = `Message à ${name}`;
        const input = document.getElementById('messageInput'); if (input) input.value = '';
    },

    closeMessageModal() { document.getElementById('messageModal')?.classList.remove('open'); },

    async sendMessage() {
        const text = document.getElementById('messageInput')?.value.trim();
        if (!text) return;
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/message`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: ProfData.messageStudentId, message: text, testId: ProfData.currentSessionDetails?._id })
            });
            if (resp.ok) { this.closeMessageModal(); alert("Message envoyé."); }
            else alert("Erreur envoi.");
        } catch(e) { alert("Erreur réseau"); }
    },

    async togglePause(id, isPaused) {
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/${id}/${isPaused ? 'resume' : 'pause'}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` } });
            if (resp.ok) this.refreshSessionDetails(id, true);
            else alert("Erreur serveur lors de la mise en pause.");
        } catch(e) { alert("Erreur réseau : " + e.message); }
    },

    async endSession(id) {
        if (!confirm("Terminer cette session ?")) return;
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/${id}/end`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` } });
            if (resp.ok) this.refreshSessionDetails(id, true);
            else alert("Erreur serveur lors de la clôture.");
        } catch(e) { alert("Erreur réseau : " + e.message); }
    },

    async extendSession(id, mins) {
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/${id}/extend`, {
                method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ minutes: mins })
            });
            if (resp.ok) this.refreshSessionDetails(id, true);
            else alert("Erreur serveur lors de la prolongation.");
        } catch(e) { alert("Erreur réseau : " + e.message); }
    },

    async generatePDFReport() {
        const s = ProfData.currentSessionDetails;
        if (!s) return;
        const logs = this._reportLog || [];
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(22); doc.setTextColor(40, 44, 52); doc.text("Rapport d'Anomalies de Session", 20, 20);
        doc.setFontSize(10); doc.setTextColor(100); doc.text(`Généré le : ${new Date().toLocaleString()}`, 20, 28);
        doc.setDrawColor(200); doc.line(20, 32, 190, 32);
        doc.setFontSize(12); doc.setTextColor(0); doc.text("Informations Session", 20, 42);
        doc.setFontSize(10);
        doc.text(`Sujet: ${s.subject || 'N/A'}`, 25, 50);
        doc.text(`Classe: ${s.classe?.nom || 'N/A'}`, 25, 56);
        doc.text(`Code: ${s.sessionCode || 'N/A'}`, 25, 62);
        doc.text(`Date: ${new Date(s.startedAt).toLocaleDateString()}`, 25, 68);
        const tableData = logs.map(l => [l.time, l.studentName, l.level === 'high' ? 'Élevé' : 'Moyen', l.message]);
        doc.autoTable({ startY: 80, head: [['Heure', 'Étudiant', 'Risque', 'Description']], body: tableData, headStyles: { fillColor: [88, 101, 242] }, alternateRowStyles: { fillColor: [245, 245, 255] } });
        doc.save(`Rapport_${s.sessionCode}.pdf`);
    }
});
