/**
 * ViewModel : ProfessorVM (Session History, Creation, Code Generation)
 */
Object.assign(ProfVM, {
    async fetchRecentSessions(force = false) {
        // PERF FIX: Cache session list for 60 seconds to avoid redundant heavy API calls
        const now = Date.now();
        if (!force && this._lastSessionsFetch && (now - this._lastSessionsFetch < 60000)) {
            this.renderSessions();
            return;
        }

        try {
            const token = sessionStorage.getItem('accessToken');
            const el = document.getElementById('sessionsList');
            if (el && !ProfData.sessions?.length) {
                el.innerHTML = `<div style="text-align:center; padding:20px;"><div class="spin-ring" style="width:20px;height:20px;border-width:2px;"></div></div>`;
            }

            const resp = await fetch(`${API_BASE}/practical-tests/professor/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) {
                if (el) el.innerHTML = `<div style="text-align:center; padding:20px; color:#ed4245;">⚠️ Erreur ${resp.status}: Chargement impossible.</div>`;
                return;
            }

            const data = await resp.json();
            this._lastSessionsFetch = Date.now();
            let joined = [];
            try { joined = JSON.parse(localStorage.getItem('joinedSessions') || '[]'); } catch(e) {}
            const dataIds = new Set(data.map(d => d._id));
            const joinedToDisplay = joined.filter(j => !dataIds.has(j._id));
            const allData = [...data, ...joinedToDisplay];

            ProfData.sessions = allData.map(s => {
                let title = _getReadableSessionTitle(s);
                if (!title) title = s.testType === 'WEB_LINK' ? "Lien de redirection" : "Environnement de test";
                const classe = _getClasse(s);
                const displayTitle = _buildSessionTitle(title, classe);
                const mode = s.isJoined ? '🤝 Rejointe' : (s.testType === 'WEB_LINK' ? '🔗 URL' : '🖥️ App');
                const dur = s.duration ? ` · ${_formatDuree(s.duration)}` : '';
                const date = s.startedAt ? new Date(s.startedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Date inconnue';
                const status = s.isActive ? 'active' : 'closed';
                return {
                    id: s._id,
                    code: s.sessionCode || '------',
                    course: displayTitle,
                    meta: `${mode}${dur}`,
                    date,
                    status,
                    isArchived: s.isArchived === true,
                    isJoined: s.isJoined === true,
                    isActive: s.isActive
                };
            });

            if (this.socket && this.socket.connected) {
                ProfData.sessions.forEach(s => {
                    if (s.isActive) this.socket.emit('watchSession', s.id);
                });
            }

            const statCount = document.getElementById('stat-count');
            if (statCount) statCount.textContent = ProfData.sessions.length;
            this.renderSessions();
        } catch (e) {
            console.error('[ProfVM] fetchRecentSessions failed:', e);
            const el = document.getElementById('sessionsList');
            if (el) {
                const msg = (e.message.includes('404')) ? `⚠️ L'historique des sessions n'est pas encore disponible sur ce serveur.` : `⚠️ Impossible de contacter le serveur (${API_BASE}).`;
                el.innerHTML = `<div style="text-align:center; padding:20px; color:#ed4245; font-size:13px;">${msg}<br/><button class="btn btn-ghost" style="margin-top:12px;" onclick="ProfVM.fetchRecentSessions()">🔄 Réessayer</button></div>`;
            }
        }
    },

    renderSessions() {
        const el = document.getElementById('sessionsList');
        if (!el) return;
        if (!ProfData.sessions || ProfData.sessions.length === 0) {
            el.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2); font-size:13px;">Aucune session récente trouvée.</div>`;
            return;
        }
        const filtered = ProfData.sessions.filter(s => this.viewingArchive ? s.isArchived : !s.isArchived);
        if (filtered.length === 0) {
            el.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2); font-size:13px;">Aucune session trouvée dans cette catégorie.</div>`;
            return;
        }
        el.innerHTML = filtered.map(s => `
            <div class="session-row" onclick="ProfVM.showSessionDetails('${s.id}')">
                <div style="flex:1;">
                    <div class="session-code" style="font-size:17px; color:#fff; font-weight:700;">${s.course}</div>
                    <div class="session-meta" style="margin-top:2px;">
                        <strong style="color:var(--primary); font-size:13.5px; font-family:monospace; letter-spacing:1px;">CODE: ${s.code}</strong><br/>
                        <small style="color:rgba(255,255,255,.45); font-size:11.5px;">${s.meta} · ${s.date}</small>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:15px;">
                    ${!this.viewingArchive && !s.isJoined ? `<button class="btn btn-ghost" style="padding:4px 8px; font-size:11px; height:26px;" onclick="event.stopPropagation(); ProfVM.archiveSession('${s.id}')">🗃️ Archiver</button>` : ''}
                    ${!s.isJoined ? `<button class="btn btn-ghost" style="padding:4px 8px; font-size:11px; height:26px; color:#ff7b7b;" onclick="event.stopPropagation(); ProfVM.deleteSession('${s.id}')">🗑️ Supprimer</button>` : ''}
                    <span class="session-badge ${s.status}">${s.status === 'active' ? '🟢 Active' : '⚫ Terminée'}</span>
                </div>
            </div>`).join('');
    },

    async archiveSession(id) {
        if (!confirm('Voulez-vous archiver cette session ?')) return;
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/${id}/archive`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) this.fetchRecentSessions();
            else alert("Erreur lors de l'archivage.");
        } catch (e) { alert("Erreur réseau"); }
    },

    async deleteSession(id) {
        if (!confirm("⚠️ Voulez-vous vraiment supprimer cette session ?\n\nCette action est définitive.")) return;
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                if (ProfData.currentSessionDetails && (ProfData.currentSessionDetails._id === id || ProfData.currentSessionDetails.id === id)) this.closeDetailsModal();
                this.fetchRecentSessions();
            } else {
                const err = await resp.json().catch(() => ({}));
                alert("Erreur lors de la suppression: " + (err.message || "Erreur inconnue"));
            }
        } catch (e) { alert("Erreur réseau"); }
    },

    toggleSessions(mode = 'recent') {
        const wantsArchive = mode === 'archive';
        if (this.sessionsOpen && this.viewingArchive === wantsArchive) this.sessionsOpen = false;
        else { this.sessionsOpen = true; this.viewingArchive = wantsArchive; }
        const card = document.getElementById('sessionsCard');
        if (card) {
            card.classList.toggle('visible', this.sessionsOpen);
            card.style.display = this.sessionsOpen ? 'block' : 'none';
            if (this.sessionsOpen) {
                document.getElementById('sessionsCardTitle').innerHTML = wantsArchive ? '🗄️ Mes sessions archivées' : '📋 Mes sessions récentes';
                this.fetchRecentSessions();
                window.requestAnimationFrame(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }));
            }
        }
    },

    openCreateModal() {
        this.sharedUrls = [];
        this.selectedExam = null;
        this.quizQuestions = [];
        const gc = document.getElementById('generatedCode');
        if (gc) { gc.style.display = 'none'; gc.textContent = ''; }
        const sum = document.getElementById('codeSummary');
        if (sum) sum.style.display = 'none';
        const urlList = document.getElementById('urlList');
        if (urlList) urlList.innerHTML = '';
        const urlInput = document.getElementById('urlInput');
        if (urlInput) urlInput.value = '';
        const modalError = document.getElementById('modalError');
        if (modalError) modalError.style.display = 'none';
        const autoFields = document.getElementById('autoFilledFields');
        if (autoFields) autoFields.style.display = 'none';
        const examSearch = document.getElementById('examSearch');
        if (examSearch) examSearch.value = '';
        const modalActions = document.getElementById('modalActions');
        if (modalActions) {
            modalActions.innerHTML = `<button class="btn btn-ghost" onclick="ProfVM.closeCreateModal()">Annuler</button><button class="btn btn-indigo" onclick="ProfVM.generateCode()">🎲 Générer le code session</button>`;
        }
        this.setMode('existant');
        document.getElementById('createModal').classList.add('open');
        const pdfFile = document.getElementById('pdfFile');
        if (pdfFile) pdfFile.value = '';
        const pdfFileName = document.getElementById('pdfFileName');
        if (pdfFileName) pdfFileName.textContent = 'Aucun fichier sélectionné';
        this.fetchExams();
        this.fetchClasses();
    },

    closeCreateModal() {
        const modal = document.getElementById('createModal');
        if (modal) modal.classList.remove('open');
    },

    async fetchClasses() {
        try {
            const token = sessionStorage.getItem('accessToken');
            if (!token) return;
            const resp = await fetch(`${API_BASE}/classe`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) return;
            const classes = await resp.json();
            ProfData.allClasses = Array.isArray(classes) ? classes : [];
            this.renderClassDropdown(ProfData.allClasses);
        } catch (e) { console.error('[ProfVM] fetchClasses failed:', e); }
    },

    renderClassDropdown(list) {
        const el = document.getElementById('n_classe');
        if (!el) return;
        let html = '<option value="">— Sélectionner —</option>';
        list.forEach(c => {
            const label = c.nom || c.name || c.code || 'Classe sans nom';
            const val = (typeof c._id === 'object' && c._id.$oid) ? c._id.$oid : (c._id || c.id);
            html += `<option value="${val}">${label}</option>`;
        });
        el.innerHTML = html;
    },

    onPdfSelected(input) {
        const fileName = input.files[0] ? input.files[0].name : 'Aucun fichier sélectionné';
        const el = document.getElementById('pdfFileName');
        if (el) {
            el.textContent = fileName;
            el.style.color = input.files[0] ? '#5865f2' : 'rgba(255,255,255,.45)';
        }
    },

    setMode(mode) {
        this.mode = mode;
        const eM = document.getElementById('modeExistant');
        const nM = document.getElementById('modeNouveau');
        const zE = document.getElementById('zoneExistant');
        const zN = document.getElementById('zoneNouveau');
        if (eM) eM.classList.toggle('active', mode === 'existant');
        if (nM) nM.classList.toggle('active', mode === 'nouveau');
        if (zE) zE.style.display = mode === 'existant' ? 'grid' : 'none';
        if (zN) zN.style.display = mode === 'nouveau' ? 'grid' : 'none';
        if (mode === 'nouveau') {
            const dInput = document.getElementById('n_date');
            if (dInput) dInput.value = new Date().toISOString().split('T')[0];
        }
    },

    _expandBlacklistKeywords(list) {
        const browsers = ['chrome', 'msedge', 'firefox', 'opera', 'brave', 'safari', 'iexplore', 'vivaldi'];
        const ides = ['code', 'visual studio', 'vanguard', 'intellij', 'pycharm', 'webstorm', 'phpstorm', 'sublime', 'atom', 'eclipse', 'netbeans', 'devcpp', 'qtcreator'];
        const social = ['discord', 'whatsapp', 'telegram', 'messenger', 'slack', 'teams', 'zoom', 'skype'];
        const fun = ['steam', 'epicgames', 'riot', 'battle.net', 'origin', 'spotify', 'netflix'];
        let result = [...list];
        list.forEach(k => {
            const kw = k.toLowerCase().trim();
            if (kw === 'browser' || kw === 'navigateur' || kw === 'internet') result = [...result, ...browsers];
            if (kw === 'ide' || kw === 'editeur' || kw === 'code') result = [...result, ...ides];
            if (kw === 'social' || kw === 'chat' || kw === 'message') result = [...result, ...social];
            if (kw === 'fun' || kw === 'game' || kw === 'entertainment') result = [...result, ...fun];
        });
        return [...new Set(result)];
    },

    async generateCode() {
        if (!this.validate()) return;
        const modalError = document.getElementById('modalError');
        if (modalError) modalError.style.display = 'none';
        let apiSessionCode = null, data = null, courseLabel, classeLabel, dateLabel, dureeLabel, startLabel;
        const btnGen = document.querySelector('#modalActions .btn-indigo') || document.querySelector('#modalActions .btn-green') || document.querySelector('#modalActions .btn-primary');
        const oriHtml = btnGen ? btnGen.innerHTML : '🎲 Générer le code session';

        if (this.mode === 'existant') {
            try {
                const token = sessionStorage.getItem('accessToken');
                const e = this.selectedExam;
                const isMongoId = id => id && /^[0-9a-f]{24}$/i.test(String(id));
                let classId = null;
                if (e.classe) classId = (typeof e.classe === 'object') ? (e.classe._id || e.classe.id) : (isMongoId(e.classe) ? e.classe : null);
                if (!classId && e.matiere?.classe) classId = (typeof e.matiere.classe === 'object') ? (e.matiere.classe._id || e.matiere.classe.id) : (isMongoId(e.matiere.classe) ? e.matiere.classe : null);
                if (!classId) throw new Error("ID de classe non trouvé.");
                courseLabel = _resolveStr(e.matiere, 'nom', 'code', 'name') || _resolveStr(e.subject) || _resolveStr(e.title) || 'Examen';
                classeLabel = (document.getElementById('af_classe')?.value || _getClasse(e) || '').trim() || '—';
                let parsedDuree = parseInt(e.duree || e.durationMinutes || 120, 10);
                const examDateSource = _resolveStr(e.scheduledStartTime) || _resolveStr(e.date) || _resolveStr(e.examDate) || _resolveStr(e.scheduledAt);
                const examStartRaw = document.getElementById('af_start')?.value || '';
                const scheduledStartIso = _toIsoFromDateAndTime(examDateSource, examStartRaw);
                const scheduledEndIso = _addMinutesToIso(scheduledStartIso, parsedDuree);
                let urlToLink = this.sharedUrls?.length ? this.sharedUrls[0] : null;
                const manualUrlBody = document.getElementById('urlInput')?.value.trim();
                if (!urlToLink && manualUrlBody) urlToLink = manualUrlBody.startsWith('http') ? manualUrlBody : 'https://' + manualUrlBody;
                const customWhitelist = (document.getElementById('af_whitelist')?.value || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
                const finalAllowedApps = this._expandBlacklistKeywords(customWhitelist);
                const formData = new FormData();
                formData.append('classe', classId);
                formData.append('examId', e._id);
                formData.append('subject', courseLabel);
                formData.append('classLabel', classeLabel);
                formData.append('duration', parsedDuree.toString());
                formData.append('testType', 'DESKTOP_APP');
                if (scheduledStartIso) formData.append('scheduledStartTime', scheduledStartIso);
                if (scheduledEndIso) formData.append('scheduledEndTime', scheduledEndIso);
                if (finalAllowedApps.length) formData.append('allowedApps', JSON.stringify(finalAllowedApps));
                if (urlToLink) formData.append('link', urlToLink);
                const pdfInput = document.getElementById('pdfFile');
                if (pdfInput?.files?.[0]) formData.append('pdfFile', pdfInput.files[0]);
                if (btnGen) { btnGen.innerHTML = '<div class="spin-ring" style="width:14px;height:14px;border-width:2px;margin-right:6px;"></div> Patientez...'; btnGen.disabled = true; }
                const resp = await fetch(`${API_BASE}/practical-tests`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
                data = await resp.json();
                if (btnGen) { btnGen.innerHTML = oriHtml; btnGen.disabled = false; }
                if (!resp.ok) throw new Error(data.message || 'Erreur communication serveur.');
                apiSessionCode = data.sessionCode;
                const dr = e.date || e.examDate || e.scheduledAt;
                dateLabel = dr ? new Date(dr).toLocaleDateString('fr-FR') : '—';
                dureeLabel = _formatDuree(parsedDuree);
                startLabel = examStartRaw || '—';
            } catch (err) {
                if (btnGen) { btnGen.innerHTML = oriHtml; btnGen.disabled = false; }
                if (modalError) { modalError.innerHTML = `<strong>Échec:</strong> ${err.message}`; modalError.style.display = 'block'; }
                return;
            }
        } else {
            // Mode Nouveau
            try {
                const token = sessionStorage.getItem('accessToken');
                const classId = document.getElementById('n_classe')?.value;
                const subjectValue = document.getElementById('n_matiere')?.value.trim();
                const dureeRaw = document.getElementById('n_duree')?.value || '120';
                if (!/^[0-9a-f]{24}$/i.test(String(classId))) throw new Error("Veuillez sélectionner une classe valide.");
                let duration = 90;
                if (dureeRaw.includes('h')) { const parts = dureeRaw.split('h'); duration = (parseInt(parts[0] || 0) * 60) + (parseInt(parts[1] || 0)); }
                else { duration = parseInt(dureeRaw) || 90; }
                const nDate = document.getElementById('n_date')?.value;
                const nStart = document.getElementById('n_start')?.value;
                const scheduledStartIso = _toIsoFromDateAndTime(nDate, nStart);
                const scheduledEndIso = _addMinutesToIso(scheduledStartIso, duration);
                const formData = new FormData();
                formData.append('classe', classId);
                formData.append('duration', duration.toString());
                if (scheduledStartIso) formData.append('scheduledStartTime', scheduledStartIso);
                if (scheduledEndIso) formData.append('scheduledEndTime', scheduledEndIso);
                const sel = document.getElementById('n_classe');
                classeLabel = sel.options[sel.selectedIndex].text;
                formData.append('classLabel', classeLabel);
                const isQuiz = this.quizQuestions.length > 0;
                formData.append('testType', isQuiz ? 'QUIZ' : 'DESKTOP_APP');
                if (isQuiz) formData.append('quizData', JSON.stringify({ questions: this.quizQuestions }));
                formData.append('subject', subjectValue);
                const customWhitelist = (document.getElementById('n_whitelist')?.value || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
                const finalAllowedApps = this._expandBlacklistKeywords(customWhitelist);
                if (finalAllowedApps.length) formData.append('allowedApps', JSON.stringify(finalAllowedApps));
                let urlToLink = this.sharedUrls?.length ? this.sharedUrls[0] : null;
                const manualUrlBody = document.getElementById('urlInput')?.value.trim();
                if (!urlToLink && manualUrlBody) urlToLink = manualUrlBody.startsWith('http') ? manualUrlBody : 'https://' + manualUrlBody;
                if (urlToLink) formData.append('link', urlToLink);
                const pdfInput = document.getElementById('pdfFile');
                if (pdfInput?.files?.[0]) formData.append('pdfFile', pdfInput.files[0]);
                if (btnGen) { btnGen.innerHTML = '<div class="spin-ring" style="width:14px;height:14px;border-width:2px;margin-right:6px;"></div> Patientez...'; btnGen.disabled = true; }
                const resp = await fetch(`${API_BASE}/practical-tests`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
                data = await resp.json();
                if (btnGen) { btnGen.innerHTML = oriHtml; btnGen.disabled = false; }
                if (!resp.ok) throw new Error(data.message || 'Erreur API création rapide.');
                apiSessionCode = data.sessionCode;
                courseLabel = subjectValue || 'Session rapide';
                dateLabel = nDate;
                dureeLabel = dureeRaw;
                startLabel = nStart || '—';
            } catch (err) {
                if (btnGen) { btnGen.innerHTML = oriHtml; btnGen.disabled = false; }
                if (modalError) { modalError.innerHTML = `<strong>Échec:</strong> ${err.message}`; modalError.style.display = 'block'; }
                return;
            }
        }

        if (!data) return;
        const code = apiSessionCode;
        const testId = data._id || data.id;
        sessionStorage.setItem('activeSessionCode', code);
        sessionStorage.setItem('activeTestId', testId);
        sessionStorage.setItem('sessionCourse', courseLabel);
        sessionStorage.setItem('sessionClasse', classeLabel);
        sessionStorage.setItem('sessionDate', dateLabel);
        sessionStorage.setItem('sessionDuree', dureeLabel);
        sessionStorage.setItem('sessionStart', startLabel);
        const selectedWhitelist = this.selectedExam ? (document.getElementById('af_whitelist')?.value || '') : (document.getElementById('n_whitelist')?.value || '');
        sessionStorage.setItem('allowedIDEs', selectedWhitelist.trim() || 'Non défini');
        sessionStorage.setItem('sharedFiles', JSON.stringify(this.sharedFiles.map(f => f.name)));
        sessionStorage.setItem('sharedUrls', JSON.stringify(this.sharedUrls));

        const gc = document.getElementById('generatedCode');
        if (gc) { gc.style.display = 'block'; gc.textContent = code; }
        const sum = document.getElementById('codeSummary');
        if (sum) {
            sum.style.display = 'block';
            const classeDisplay = (!classeLabel || classeLabel === '—' || /^[0-9a-f]{24}$/i.test(classeLabel)) ? '' : ` · ${classeLabel}`;
            sum.innerHTML = `${courseLabel}${classeDisplay} · ${dureeLabel} · [${startLabel}]`;
        }

        ProfData.sessions.unshift({ code, course: _buildSessionTitle(courseLabel, classeLabel), date: 'À l\'instant', status: 'active', id: testId, isActive: true });
        const statCount = document.getElementById('stat-count');
        if (statCount) statCount.textContent = ProfData.sessions.length;
        this.renderSessions();

        const mActions = document.getElementById('modalActions');
        if (mActions) {
            mActions.innerHTML = `<button class="btn btn-ghost" onclick="ProfVM.closeCreateModal()">Fermer</button><button class="btn btn-ghost" id="copyBtn" onclick="navigator.clipboard.writeText('${code}').then(()=>document.getElementById('copyBtn').textContent='✅ Copié!')">📋 Copier</button>`;
        }
    },

    launchSession(code, testId) {
        sessionStorage.setItem('activeSessionCode', code);
        if (testId) sessionStorage.setItem('activeTestId', testId);
        this.closeCreateModal();
        window.location.href = './desktop.html';
    },

    addUrl() {
        const input = document.getElementById('urlInput');
        let url = input ? input.value.trim() : '';
        if (!url) return;
        if (!url.startsWith('http')) url = 'https://' + url;
        this.sharedUrls.push(url);
        if (input) input.value = '';
        this.renderUrls();
    },

    removeUrl(idx) {
        this.sharedUrls.splice(idx, 1);
        this.renderUrls();
    },

    renderUrls() {
        const el = document.getElementById('urlList');
        if (!el) return;
        el.innerHTML = this.sharedUrls.map((u, i) => `<div class="url-chip"><span>${u}</span><button onclick="ProfVM.removeUrl(${i})">×</button></div>`).join('');
    },

    async fetchExams() {
        try {
            const token = sessionStorage.getItem('accessToken');
            const resp = await fetch(`${API_BASE}/practical-tests/professor/exams`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) return;
            const data = await resp.json();
            ProfData.allExams = Array.isArray(data) ? data : [];
            ProfData.filteredExams = [...ProfData.allExams];
            this.renderExams();
        } catch (e) { console.error('[ProfVM] fetchExams failed:', e); }
    },

    renderExams() {
        const el = document.getElementById('examsGrid');
        if (!el) return;
        if (!ProfData.filteredExams || ProfData.filteredExams.length === 0) {
            el.innerHTML = `<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2); grid-column:1/-1;">Aucun examen trouvé.</div>`;
            return;
        }
        el.innerHTML = ProfData.filteredExams.map(e => {
            const title = _resolveStr(e.matiere, 'nom', 'code', 'name') || _resolveStr(e.subject) || _resolveStr(e.title) || 'Examen';
            const classe = _getClasse(e);
            const date = e.date || e.examDate || e.scheduledAt || e.scheduledStartTime;
            const dateStr = date ? new Date(date).toLocaleDateString('fr-FR') : 'Date non définie';
            const isActive = this.selectedExam && (this.selectedExam._id === e._id);
            return `
                <div class="exam-card ${isActive ? 'active' : ''}" onclick="ProfVM.selectExam('${e._id}')">
                    <div class="exam-card-title">${_escapeHtml(title)}</div>
                    <div class="exam-card-meta">
                        <span>👥 ${_escapeHtml(classe)}</span>
                        <span>📅 ${dateStr}</span>
                    </div>
                </div>`;
        }).join('');
    },

    selectExam(id) {
        const e = ProfData.allExams.find(x => x._id === id);
        if (!e) return;
        this.selectedExam = e;
        this.renderExams();
        const autoFields = document.getElementById('autoFilledFields');
        if (autoFields) autoFields.style.display = 'block';
        const af_classe = document.getElementById('af_classe');
        if (af_classe) af_classe.value = _getClasse(e);
        const af_start = document.getElementById('af_start');
        if (af_start) {
            const start = e.scheduledStartTime || e.startTime || '';
            af_start.value = start ? new Date(start).toTimeString().slice(0, 5) : '';
        }
        const af_whitelist = document.getElementById('af_whitelist');
        if (af_whitelist) af_whitelist.value = Array.isArray(e.allowedApps) ? e.allowedApps.join(', ') : '';
    },

    validate() {
        if (this.mode === 'existant') {
            if (!this.selectedExam) { alert("Veuillez sélectionner un examen."); return false; }
        } else {
            const subject = document.getElementById('n_matiere')?.value.trim();
            const classe = document.getElementById('n_classe')?.value;
            if (!subject || !classe) { alert("Veuillez remplir le sujet et sélectionner une classe."); return false; }
        }
        return true;
    }
});
