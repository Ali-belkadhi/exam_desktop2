/**
 * ViewModel : ProfessorVM (ProfVM + ProfData)
 * Extrait de professor.html — architecture MVVM
 * Config : window.APP_CONFIG
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

        // ── Helpers de décodage des champs populés par MongoDB ──────────────
        /**
         * Résout un champ qui peut être :
         *   - un objet populé  { _id, nom, code, ... }
         *   - une string ObjectId brute
         *   - une valeur primitive normale
         * Retourne la valeur lisible (string) ou le fallback.
         */
        function _resolveStr(field, ...keys) {
            if (field === null || field === undefined) return null;

            // Gestion du format MongoDB brute {$oid: "..."} ou {$date: "..."}
            if (typeof field === 'object' && field.$oid) return String(field.$oid);
            if (typeof field === 'object' && field.$date) return String(field.$date);

            if (typeof field === 'object' && !Array.isArray(field)) {
                for (const k of keys) {
                    if (field[k] !== undefined && field[k] !== null) {
                        // Récursivité si la clé elle-même est un objet MongoDB ($oid)
                        return _resolveStr(field[k], ...keys);
                    }
                }
                // Fallbacks ID
                if (field._id) return _resolveStr(field._id);
                if (field.id) return _resolveStr(field.id);
                return null;
            }
            return String(field);
        }

        /**
         * Formate une durée :
         *   - Si c'est un number (minutes venant du backend) → "2h", "1h30", "45 min"
         *   - Si c'est déjà une string → retourne telle quelle
         */
        function _formatDuree(duree) {
            if (duree === null || duree === undefined || duree === '') return '—';
            const n = Number(duree);
            if (!isNaN(n) && n > 0) {
                const h = Math.floor(n / 60);
                const m = n % 60;
                if (h === 0) return `${m} min`;
                return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
            }
            return String(duree); // déjà formatée (ex: "1h30" en mode démo)
        }

        function _toIsoFromDateAndTime(dateInput, timeInput) {
            const rawDate = (dateInput || '').toString().trim();
            const rawTime = (timeInput || '').toString().trim();
            if (!rawDate) return null;

            let d = null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                d = new Date(`${rawDate}T00:00:00`);
            } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDate)) {
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
                hh = parseInt(hStr, 10);
                mi = parseInt(mStr, 10);
            }

            d.setHours(hh, mi, 0, 0);
            if (isNaN(d.getTime())) return null;
            return d.toISOString();
        }

        function _addMinutesToIso(isoStart, minutes) {
            if (!isoStart) return null;
            const start = new Date(isoStart);
            if (isNaN(start.getTime())) return null;
            const mins = Number(minutes);
            if (!Number.isFinite(mins) || mins <= 0) return null;
            return new Date(start.getTime() + mins * 60 * 1000).toISOString();
        }

        /** 
         * Récupère le nom lisible de la classe avec fallbacks intelligents
         */
        function _getClasse(e) {
            if (!e) return '';
            const explicitLabel = _resolveStr(e.classLabel, 'nom', 'name', 'code', 'label')
                || _resolveStr(e.classeLabel, 'nom', 'name', 'code', 'label');
            if (explicitLabel && !_looksLikeObjectId(explicitLabel)) return explicitLabel;

            const c = e.classe || (e.examId ? e.examId.classe : null);
            if (!c) return '';

            // 1. Tenter de résoudre via l'objet lui-même (si populé)
            const resolved = _resolveStr(c, 'nom', 'name', 'code', 'label');

            // 2. Si c'est un ID, tenter de trouver le nom dans la liste globale des classes
            if (resolved && (resolved.length === 24 || resolved.match(/^[0-9a-fA-F]{24}$/))) {
                const found = ProfData.allClasses && ProfData.allClasses.find(cl => {
                    const id = _resolveStr(cl._id);
                    return id === resolved;
                });
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
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        const ProfData = {
            sessions: [],
            allExams: [],
            filteredExams: [],
            detailsInterval: null,
            currentSessionDetails: null,
            workFolders: [],
            workCurrentClass: null
        };

        const ProfVM = {
            sessionsOpen: false,
            viewingArchive: false,
            sharedFiles: [],
            sharedUrls: [],
            mode: 'existant',
            selectedExam: null,

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

                // Gestionnaire global pour quitter le plein écran du screen avec Échap
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        const container = document.getElementById('pm-screen-container');
                        if (container && container.classList.contains('pm-screen-fullscreen')) {
                            this.toggleScreenFullscreen();
                        }
                    }
                });
            },

            async joinSessionByCode() {
                const codeInput = document.getElementById('topbarSessionCode');
                const code = codeInput ? codeInput.value.trim() : '';
                if (!code) return;
                
                try {
                    const token = sessionStorage.getItem('accessToken');
                    const resp = await fetch(`${API_BASE}/practical-tests/code/${code}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (resp.ok) {
                        const session = await resp.json();
                        if (session && session._id) {
                            if (codeInput) codeInput.value = '';
                            
                            // Sauvegarder dans le localStorage
                            let joined = JSON.parse(localStorage.getItem('joinedSessions') || '[]');
                            const existsIndex = joined.findIndex(s => s._id === session._id);
                            session.isJoined = true;
                            if (existsIndex >= 0) {
                                joined[existsIndex] = session;
                            } else {
                                joined.push(session);
                            }
                            localStorage.setItem('joinedSessions', JSON.stringify(joined));
                            
                            this.fetchRecentSessions();
                            this.showSessionDetails(session._id);
                        } else {
                            alert("Code session invalide ou introuvable.");
                        }
                    } else {
                        alert("Erreur: Session introuvable.");
                    }
                } catch(e) {
                    alert("Erreur réseau");
                }
            },

            async checkConnection() {
                const statVal = document.querySelector('.stat-card.online .stat-value');
                const statCard = document.querySelector('.stat-card.online');
                try {
                    const resp = await fetch(`${API_BASE}/auth/config-test`, { method: 'GET', signal: AbortSignal.timeout(3000) });
                    if (resp.ok) {
                        statVal.textContent = "En ligne";
                        statCard.style.opacity = "1";
                    } else {
                        throw new Error();
                    }
                } catch (e) {
                    statVal.textContent = "Hors ligne";
                    statVal.style.color = "#ed4245";
                    statCard.classList.remove('online');
                }
            },

            openWorkModal() {
                ProfData.workCurrentClass = null;
                const modal = document.getElementById('workModal');
                if (modal) modal.classList.add('open');
                this.fetchWorkFolders();
            },

            closeWorkModal() {
                const modal = document.getElementById('workModal');
                if (modal) modal.classList.remove('open');
            },

            goBackWorkClasses() {
                ProfData.workCurrentClass = null;
                this.renderWorkExplorer();
            },

            openWorkClass(encodedClassName) {
                ProfData.workCurrentClass = decodeURIComponent(encodedClassName || '');
                this.renderWorkExplorer();
            },

            async fetchWorkFolders() {
                const explorer = document.getElementById('workExplorer');
                if (explorer) {
                    explorer.innerHTML = `<div style="text-align:center; padding:40px; color:rgba(255,255,255,.5); grid-column:1/-1;"><div class="spin-ring" style="width:22px;height:22px;border-width:2px; margin:0 auto 12px;"></div>Chargement des travaux...</div>`;
                }

                try {
                    const token = sessionStorage.getItem('accessToken');
                    if (!token) throw new Error('Session expirée');

                    const resp = await fetch(`${API_BASE}/practical-tests/professor/work-folders`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!resp.ok) throw new Error(`Erreur ${resp.status}`);

                    const data = await resp.json();
                    ProfData.workFolders = Array.isArray(data) ? data : [];
                    this.renderWorkExplorer();

                    const classesCount = ProfData.workFolders.length;
                    const filesCount = ProfData.workFolders.reduce((acc, c) => acc + (c.totalFiles || 0), 0);
                    const stat = document.getElementById('stat-work-count');
                    if (stat) stat.textContent = `${filesCount} fichier(s) · ${classesCount} classe(s)`;
                } catch (e) {
                    if (explorer) {
                        explorer.innerHTML = `<div style="text-align:center; padding:40px; color:#ed4245; grid-column:1/-1;">⚠️ ${_escapeHtml(e.message || 'Erreur réseau')}</div>`;
                    }
                }
            },

            renderWorkExplorer() {
                const explorer = document.getElementById('workExplorer');
                const breadcrumb = document.getElementById('workBreadcrumb');
                const backBtn = document.getElementById('workBackBtn');
                if (!explorer || !breadcrumb || !backBtn) return;

                if (!ProfData.workFolders || ProfData.workFolders.length === 0) {
                    breadcrumb.textContent = 'Classes';
                    backBtn.style.display = 'none';
                    explorer.innerHTML = `<div style="text-align:center; padding:40px; color:rgba(255,255,255,.45); grid-column:1/-1;">Aucun travail reçu pour le moment.</div>`;
                    return;
                }

                if (!ProfData.workCurrentClass) {
                    breadcrumb.textContent = 'Classes';
                    backBtn.style.display = 'none';
                    explorer.innerHTML = ProfData.workFolders.map(folder => {
                        const encodedClass = encodeURIComponent(folder.className || 'Classe');
                        return `
                            <div class="work-card folder" onclick="ProfVM.openWorkClass('${encodedClass}')">
                                <div class="work-card-title">
                                    <span style="font-size: 20px;">📁</span> 
                                    ${_escapeHtml(folder.className || 'Classe inconnue')}
                                </div>
                                <div class="work-card-meta" style="margin-top: 4px;">
                                    ${folder.totalFiles || 0} fichier(s) · ${(folder.students || []).length} étudiant(s)
                                </div>
                            </div>
                        `;
                    }).join('');
                    return;
                }

                const selected = ProfData.workFolders.find(c => c.className === ProfData.workCurrentClass);
                breadcrumb.innerHTML = `Classes <span style="margin: 0 4px; opacity: 0.5;">/</span> <span style="color: #fff;">${ProfData.workCurrentClass}</span>`;
                backBtn.style.display = 'inline-flex';

                if (!selected) {
                    explorer.innerHTML = `<div style="text-align:center; padding:40px; color:rgba(255,255,255,.45); grid-column:1/-1;">Classe introuvable.</div>`;
                    return;
                }

                explorer.innerHTML = (selected.students || []).map(student => {
                    const fileRows = (student.files || []).map(file => {
                        const encodedFileName = encodeURIComponent(file.fileName || 'travail.zip');
                        const uploadedAt = file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('fr-FR') : 'Date inconnue';
                        return `
                            <div class="work-file-item">
                                <div>
                                    <div class="work-file-name" title="${_escapeHtml(file.fileName || 'travail.zip')}">
                                        <span style="font-size: 14px;">📦</span> ${_escapeHtml(file.fileName || 'travail.zip')}
                                    </div>
                                    <div class="work-card-meta" style="margin-top: 2px;">
                                        ${_escapeHtml(file.sessionCode || '------')} · ${_escapeHtml(uploadedAt)}
                                    </div>
                                </div>
                                <button class="work-file-btn" onclick="event.stopPropagation(); ProfVM.downloadSubmission('${file.submissionId}', '${encodedFileName}')">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    Télécharger
                                </button>
                            </div>
                        `;
                    }).join('');

                    return `
                        <div class="work-card">
                            <div class="work-card-title">
                                <span style="background: rgba(255,255,255,0.1); border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 14px;">🧑‍🎓</span> 
                                ${_escapeHtml(student.studentName || 'Etudiant')}
                            </div>
                            <div class="work-card-meta">${student.totalFiles || 0} fichier(s) envoyés</div>
                            <div class="work-file-list">${fileRows || '<div class="work-card-meta" style="text-align:center; padding: 10px;">Aucun fichier</div>'}</div>
                        </div>
                    `;
                }).join('');
            },

            async downloadSubmission(submissionId, encodedFileName) {
                try {
                    const token = sessionStorage.getItem('accessToken');
                    if (!token) throw new Error('Session expirée');

                    const fileName = decodeURIComponent(encodedFileName || 'travail.zip');
                    const resp = await fetch(`${API_BASE}/practical-tests/submissions/${submissionId}/download`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        throw new Error(err.message || `Erreur ${resp.status}`);
                    }

                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName || 'travail.zip';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                } catch (e) {
                    alert(`Erreur téléchargement: ${e.message || 'Erreur réseau'}`);
                }
            },

            async fetchRecentSessions() {
                try {
                    const token = sessionStorage.getItem('accessToken');
                    const el = document.getElementById('sessionsList');
                    el.innerHTML = `<div style="text-align:center; padding:20px;"><div class="spin-ring" style="width:20px;height:20px;border-width:2px;"></div></div>`;

                    const resp = await fetch(`${API_BASE}/practical-tests/professor/history`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!resp.ok) {
                        el.innerHTML = `<div style="text-align:center; padding:20px; color:#ed4245;">⚠️ Erreur ${resp.status}: Chargement impossible.</div>`;
                        return;
                    }

                    const data = await resp.json();

                    let joined = [];
                    try {
                        joined = JSON.parse(localStorage.getItem('joinedSessions') || '[]');
                    } catch(e) {}
                    const dataIds = new Set(data.map(d => d._id));
                    const joinedToDisplay = joined.filter(j => !dataIds.has(j._id));
                    const allData = [...data, ...joinedToDisplay];

                    // On mappe les données backend vers le format d'affichage
                    ProfData.sessions = allData.map(s => {
                        // 1. Déterminer le titre (Matière/Examen)
                        let title = _getReadableSessionTitle(s);
                        if (!title) title = s.testType === 'WEB_LINK' ? "Lien de redirection" : "Environnement de test";

                        // 2. Déterminer la classe
                        const classe = _getClasse(s);
                        const displayTitle = _buildSessionTitle(title, classe);

                        // 3. Métadonnées (Mode, Durée)
                        const mode = s.isJoined ? '🤝 Rejointe' : (s.testType === 'WEB_LINK' ? '🔗 URL' : '🖥️ App');
                        const dur = s.duration ? ` · ${_formatDuree(s.duration)}` : '';

                        const date = s.startedAt
                            ? new Date(s.startedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : 'Date inconnue';

                        const status = s.isActive ? 'active' : 'closed';
                        return {
                            id: s._id,
                            code: s.sessionCode || '------',
                            course: displayTitle,
                            meta: `${mode}${dur}`,
                            date,
                            status,
                            isArchived: s.isArchived === true,
                            isJoined: s.isJoined === true
                        };
                    });

                    document.getElementById('stat-count').textContent = ProfData.sessions.length;
                    this.renderSessions();
                } catch (e) {
                    console.error('[ProfVM] fetchRecentSessions failed:', e);
                    const el = document.getElementById('sessionsList');
                    // Gérer le cas où le serveur est injoignable ou l'endpoint n'existe pas
                    const msg = (e.message.includes('404'))
                        ? `⚠️ L'historique des sessions n'est pas encore disponible sur ce serveur.`
                        : `⚠️ Impossible de contacter le serveur (${API_BASE}).`;

                    el.innerHTML = `
                    <div style="text-align:center; padding:20px; color:#ed4245; font-size:13px; background:rgba(237,66,69,0.05); border-radius:12px; border:1px solid rgba(237,66,69,0.15);">
                        ${msg}<br/>
                        <button class="btn btn-ghost" style="margin-top:12px; font-size:11px; height:30px; margin-left:auto; margin-right:auto;" onclick="ProfVM.fetchRecentSessions()">🔄 Réessayer</button>
                    </div>`;
                }
            },

            renderSessions() {
                const el = document.getElementById('sessionsList');
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
                <div class="session-row" onclick="ProfVM.showSessionDetails('${s.id}')" style="cursor:pointer; transition: transform .2s, background-color .2s;">
                    <div style="flex:1;">
                        <div class="session-code" style="font-family: inherit; font-size: 17px; letter-spacing: normal; color: #fff; text-transform: uppercase; font-weight: 700;">${s.course}</div>
                        <div class="session-meta" style="margin-top:2px;">
                            <strong style="color:var(--primary); font-size:13.5px; font-family: monospace; letter-spacing: 1px;">CODE: ${s.code}</strong><br/>
                            <small style="color:rgba(255,255,255,.45); font-size:11.5px;">${s.meta} · ${s.date}</small>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap: 15px;">
                        ${!this.viewingArchive && !s.isJoined ? `<button class="btn btn-ghost" style="padding:4px 8px; font-size:11px; height: 26px; border-color: rgba(255,255,255,.2);" onclick="event.stopPropagation(); ProfVM.archiveSession('${s.id}')">🗃️ Archiver</button>` : ''}
                        ${!s.isJoined ? `<button class="btn btn-ghost" style="padding:4px 8px; font-size:11px; height:26px; color:#ff7b7b; border-color:rgba(255,123,123,.35);" onclick="event.stopPropagation(); ProfVM.deleteSession('${s.id}')">🗑️ Supprimer</button>` : ''}
                        <span class="session-badge ${s.status}" style="font-weight:600;">${s.status === 'active' ? '🟢 Active' : '⚫ Terminée'}</span>
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
                    if (resp.ok) {
                        this.fetchRecentSessions();
                    } else {
                        alert("Erreur lors de l'archivage.");
                    }
                } catch (e) {
                    console.error(e);
                    alert("Erreur réseau");
                }
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
                        if (ProfData.currentSessionDetails && (ProfData.currentSessionDetails._id === id || ProfData.currentSessionDetails.id === id)) {
                            this.closeDetailsModal();
                        }
                        this.fetchRecentSessions();
                    } else {
                        const err = await resp.json().catch(() => ({}));
                        alert("Erreur lors de la suppression: " + (err.message || "Erreur inconnue"));
                    }
                } catch (e) {
                    console.error("Delete session failed:", e);
                    alert("Erreur réseau");
                }
            },

            toggleSessions(mode = 'recent') {
                const wantsArchive = mode === 'archive';
                if (this.sessionsOpen && this.viewingArchive === wantsArchive) {
                    this.sessionsOpen = false;
                } else {
                    this.sessionsOpen = true;
                    this.viewingArchive = wantsArchive;
                }

                const card = document.getElementById('sessionsCard');
                card.classList.toggle('visible', this.sessionsOpen);
                card.style.display = this.sessionsOpen ? 'block' : 'none';

                if (this.sessionsOpen) {
                    document.getElementById('sessionsCardTitle').innerHTML = wantsArchive ? '🗄️ Mes sessions archivées' : '📋 Mes sessions récentes';
                    this.fetchRecentSessions();
                    window.requestAnimationFrame(() => {
                        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
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
                    modalActions.innerHTML = `
                    <button class="btn btn-ghost" onclick="ProfVM.closeCreateModal()">Annuler</button>
                    <button class="btn btn-indigo" onclick="ProfVM.generateCode()">🎲 Générer le code session</button>`;
                }
                this.setMode('existant');
                document.getElementById('createModal').classList.add('open');

                // Reset PDF field
                document.getElementById('pdfFile').value = '';
                document.getElementById('pdfFileName').textContent = 'Aucun fichier sélectionné';

                this.fetchExams();
                this.fetchClasses();
            },

            async fetchClasses() {
                try {
                    const token = sessionStorage.getItem('accessToken');
                    if (!token) return;
                    const resp = await fetch(`${API_BASE}/classe`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!resp.ok) return;
                    const classes = await resp.json();
                    ProfData.allClasses = Array.isArray(classes) ? classes : [];
                    this.renderClassDropdown(ProfData.allClasses);
                } catch (e) {
                    console.error('[ProfVM] fetchClasses failed:', e);
                }
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
                document.getElementById('pdfFileName').textContent = fileName;
                if (input.files[0]) {
                    document.getElementById('pdfFileName').style.color = '#5865f2';
                } else {
                    document.getElementById('pdfFileName').style.color = 'rgba(255,255,255,.45)';
                }
            },

            closeCreateModal() {
                document.getElementById('createModal').classList.remove('open');
            },

            async showSessionDetails(id) {
                const modal = document.getElementById('detailsModal');
                modal.classList.add('open');

                // Reset alerts panel
                this._pmAlerts = [];
                this._pmAlertCount = 0;
                this._studentRiskMap = {};

                // Fetch first time
                await this.refreshSessionDetails(id);

                // Then auto-refresh via WebSocket
                if (window.io) {
                    if (this.socket) this.socket.disconnect();
                    this.socket = window.io(API_BASE);

                    this.socket.on('connect', () => {
                        this.socket.emit('watchSession', id);
                    });

                    // ── Polling localStorage toutes les 3s pour détecter les étudiants en attente ──
                    // FIX PERF #3 : Le polling NE DÉCLENCHE PLUS d'appel API.
                    // Il met à jour le Set local puis re-rendu l'UI depuis le cache.
                    if (this._waitingPollInterval) clearInterval(this._waitingPollInterval);
                    this._waitingPollInterval = setInterval(() => {
                        try {
                            const waitingKey = `_waiting_${id}`;
                            const list = JSON.parse(localStorage.getItem(waitingKey) || '[]');
                            let changed = false;
                            list.forEach(entry => {
                                if (entry.studentId && !this._waitingStudentsSet.has(entry.studentId.toString())) {
                                    this._waitingStudentsSet.add(entry.studentId.toString());
                                    changed = true;
                                }
                            });
                            if (changed) {
                                console.log('[Prof] Polling: nouveau(x) étudiant(s) en attente détecté(s) — re-rendu UI uniquement');
                                // Re-rendu léger depuis le cache (PAS d'appel API)
                                this._rerenderParticipantsFromCache(id);
                            }
                        } catch(e) { /* silencieux */ }
                    }, 3000);

                    this.socket.on('studentPresenceChanged', () => {
                        this.refreshSessionDetails(id, true);
                    });

                    // ── Étudiant en salle d'attente ── (nouveau)
                    this.socket.on('student-waiting', (data) => {
                        console.log('[Prof] Étudiant en attente (WebSocket):', data.studentId, data.studentName);
                        if (data.studentId) {
                            this._waitingStudentsSet.add(data.studentId.toString());
                        }
                        this.refreshSessionDetails(id, true);
                    });

                    // ── Écoute localStorage pour détecter nouveaux étudiants en attente (même app Electron) ──
                    if (!this._storageListenerActive) {
                        this._storageListenerActive = true;
                        window.addEventListener('storage', (event) => {
                            if (event.key && event.key.startsWith('_waiting_')) {
                                const testIdFromKey = event.key.replace('_waiting_', '');
                                console.log('[Prof] localStorage changé - étudiant en attente pour test:', testIdFromKey);
                                try {
                                    const list = JSON.parse(event.newValue || '[]');
                                    list.forEach(entry => {
                                        if (entry.studentId) this._waitingStudentsSet.add(entry.studentId.toString());
                                    });
                                } catch(e) { /* silent */ }
                                // Rafraîchir si c'est la session actuelle
                                if (testIdFromKey === id) {
                                    this.refreshSessionDetails(id, true);
                                }
                            }
                        });
                    }

                    // ── Écouter les alertes monitoring de tous les étudiants ──
                    this.socket.on('student-monitoring-update', (data) => {
                        // Only process if we're not already in the monitor modal for this student
                        const procs = data.processes || [];
                        // Filtrer pour ne garder que les "Applications" (avec titre de fenêtre) ou les risques connus
                        const visible = procs.filter(p => {
                            const risk = this._getRisk(p);
                            return risk !== 'OK'; // Ne garder que ce qui est potentiellement suspect
                        });

                        let globalRisk = 'low';
                        visible.forEach(p => {
                            const risk = this._getRisk(p);
                            if (risk === 'HIGH') {
                                globalRisk = 'high';
                                const msg = `Application suspecte : ${p.Name}`;
                                this.addGlobalAlert(data.studentName || 'Étudiant', data.studentId, msg, 'high');
                            } else if (risk === 'MEDIUM' && globalRisk !== 'high') {
                                globalRisk = 'medium';
                                const msg = `Application risque moyen : ${p.Name}`;
                                this.addGlobalAlert(data.studentName || 'Étudiant', data.studentId, msg, 'medium');
                            }
                        });

                        // Update risk dot for this student
                        const sid = data.studentId ? data.studentId.toString() : '';
                        if (sid && globalRisk !== 'low') {
                            this._studentRiskMap[sid] = globalRisk;
                            const studentEl = document.getElementById(`pm-student-${sid}`);
                            if (studentEl) {
                                const dot = studentEl.querySelector('.pm-risk-dot');
                                if (dot) dot.className = `pm-risk-dot ${globalRisk}`;
                            }
                        }
                    });
                }

                // FIX PERF #4 : Fallback à 30s (au lieu de 15s) pour réduire la charge serveur
                if (ProfData.detailsInterval) clearInterval(ProfData.detailsInterval);
                ProfData.detailsInterval = setInterval(() => {
                    this.refreshSessionDetails(id, true);
                }, 30000);
            },

            // ── Carte des risques par étudiant (mis à jour via monitoring) ──
            _studentRiskMap: {}, // { studentId: 'high'|'medium'|'low'|'inactive' }

            // ── Set des étudiants EN ATTENTE d'accès (géré localement, indépendant de l'API) ──
            _waitingStudentsSet: new Set(), // Set<studentId string>

            /**
             * FIX PERF #3 — Re-rendu léger de la liste des étudiants depuis le CACHE mémoire.
             * Ne fait AUCUN appel API. Met à jour uniquement les badges "En attente"
             * pour les nouveaux étudiants détectés via localStorage polling.
             * @param {string} id - session ID (pour contexte)
             */
            _rerenderParticipantsFromCache(id) {
                const data = ProfData.currentSessionDetails;
                if (!data) return; // Pas encore de données chargées → attendre le prochain refresh API

                const students = data.classe && data.classe.students ? data.classe.students : [];
                const participants = data.participants || [];
                if (students.length === 0) return;

                let countActif = 0;
                let countInactif = 0;
                let html = '';

                students.forEach(st => {
                    const sid = st._id || st.id || st;
                    const pObj = participants.find(p => {
                        let pid = '';
                        if (p.student) {
                            pid = (typeof p.student === 'object') ? (p.student._id || p.student.id) : p.student;
                        } else {
                            pid = p._id || p.id || p;
                        }
                        return pid && sid && pid.toString() === sid.toString();
                    });

                    const sidStr = sid ? sid.toString() : '';
                    const isWaiting = sidStr && this._waitingStudentsSet.has(sidStr);
                    const isActif = !isWaiting && (pObj ? (pObj.status === 'actif') : false);
                    const hasNote = pObj && pObj.quizResult;

                    if (isActif) countActif++; else countInactif++;

                    const riskLevel = isActif ? (this._studentRiskMap[sidStr] || 'low') : 'inactive';
                    const avatarBg = isActif
                        ? 'background:linear-gradient(135deg,#10b981,#059669);'
                        : (isWaiting ? 'background:linear-gradient(135deg,#f59e0b,#d97706);' : '');

                    const screenBtn = isActif
                        ? `<button class="pm-action-btn" title="Voir l'écran" onclick="ProfVM.viewStudentScreenInPanel('${sid}','${st.prenom} ${st.nom}')">📺</button>`
                        : '';
                    const monitorBtn = isActif
                        ? `<button class="pm-action-btn" title="Surveiller" style="border-color:rgba(249,115,22,.4);color:#f97316;" onclick="ProfVM.openMonitorModal('${sid}','${st.prenom} ${st.nom}')">🔍</button>`
                        : '';
                    const msgBtn = isActif
                        ? `<button class="pm-action-btn" title="Message privé" style="border-color:rgba(99,102,241,.4);color:#818cf8;" onclick="ProfVM.openMessageModal('${sid}','${st.prenom} ${st.nom}')">💬</button>`
                        : '';
                    const acceptBtn = isWaiting
                        ? `<button class="pm-action-btn" title="Accorder l'accès" style="border-color:rgba(16,185,129,.5); background:rgba(16,185,129,.1); color:#10b981;" onclick="ProfVM.grantAccess('${id}', '${sid}')">✔️</button>
                           <button class="pm-action-btn" title="Refuser l'accès" style="border-color:rgba(239,68,68,.5); background:rgba(239,68,68,.1); color:#ef4444;" onclick="ProfVM.denyAccess('${id}', '${sid}')">❌</button>`
                        : '';
                    const noteHtml = hasNote
                        ? `<span style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; font-size:10px; padding:2px 8px; border-radius:8px; font-weight:800; white-space:nowrap; flex-shrink:0;">✓ ${pObj.quizResult.score}/${pObj.quizResult.maxScore}</span>`
                        : '';

                    let badgeHtml = `<span class="pm-student-badge">Inscrit</span>`;
                    if (isActif) {
                        badgeHtml = `<span class="pm-student-badge actif">Actif</span>`;
                    } else if (isWaiting) {
                        badgeHtml = `<span class="pm-student-badge" style="color:#f59e0b; border-color:rgba(245,158,11,.3); background:rgba(245,158,11,.1);">En attente</span>`;
                    }

                    html += `
                        <div class="pm-student-item" id="pm-student-${sid}">
                            <div class="pm-student-avatar" style="${avatarBg}">
                                ${(st.prenom && st.nom) ? (st.prenom[0] + st.nom[0]).toUpperCase() : '??'}
                                <div class="pm-risk-dot ${riskLevel}"></div>
                            </div>
                            <div class="pm-student-info">
                                <div class="pm-student-name" style="white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.1;">${st.prenom} ${st.nom}</div>
                                <div class="pm-student-nc">NC: ${st.studentCardNumber || 'N/A'}</div>
                            </div>
                            <div class="pm-student-actions" style="display:flex; gap:6px; align-items:center;">
                                ${acceptBtn}${screenBtn}${monitorBtn}${msgBtn}${noteHtml}${badgeHtml}
                            </div>
                        </div>
                    `;
                });

                const participantsList = document.getElementById('participantsList');
                if (participantsList) participantsList.innerHTML = html;

                const cA = document.getElementById('pm-count-actif');
                const cI = document.getElementById('pm-count-inactif');
                if (cA) cA.textContent = countActif;
                if (cI) cI.textContent = countInactif;
            },

            async refreshSessionDetails(id, isSilent = false, _retryCount = 0) {
                const participantsList = document.getElementById('participantsList');
                const controls = document.getElementById('sessionControls');
                const subheader = document.getElementById('detailsSubheader');

                if (!isSilent) {
                    participantsList.innerHTML = `
                        <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:120px;gap:10px;">
                            <div class="spin-ring" style="width:24px;height:24px;"></div>
                            ${_retryCount > 0 ? `<span style="font-size:11px;color:rgba(255,255,255,.4);">Tentative ${_retryCount + 1}/3...</span>` : ''}
                        </div>
                    `;
                    controls.style.display = 'none';
                    subheader.textContent = _retryCount > 0 ? `Reconnexion en cours...` : 'Récupération des données...';
                }

                try {
                    const token = sessionStorage.getItem('accessToken');
                    const controller = new AbortController();
                    // FIX PERF #5 : Timeout réduit à 8s (au lieu de 15s) pour éviter de bloquer l'UI 27s
                    const timeout = setTimeout(() => controller.abort(), 8000);
                    let resp;
                    try {
                        resp = await fetch(`${API_BASE}/practical-tests/${id}`, {
                            headers: { 'Authorization': `Bearer ${token}` },
                            signal: controller.signal
                        });
                    } finally {
                        clearTimeout(timeout);
                    }

                    if (!resp.ok) throw new Error("Erreur serveur lors de la récupération des détails.");
                    const data = await resp.json();
                    ProfData.currentSessionDetails = data;

                    if (data.classe && data.classe.nom) {
                        subheader.textContent = `Session ${data.sessionCode} · ${data.classe.nom}`;
                    } else {
                        subheader.textContent = `Session ${data.sessionCode}`;
                    }

                    // ── Injecter les contrôles de session active ──
                    if (data.isActive !== false && !data.endedAt) {
                        controls.style.display = 'block';
                        const pauseLabel = data.isPaused ? '▶️ Reprendre' : '⏸️ Mettre en pause';
                        const pauseClass = data.isPaused ? 'resume' : 'pause';

                        controls.innerHTML = `
                            <div class="control-panel">
                                <button class="cp-btn ${pauseClass}" onclick="ProfVM.togglePause('${id}', ${data.isPaused})">${pauseLabel}</button>
                                <button class="cp-btn end" onclick="ProfVM.endSession('${id}')">⏹️ Terminer</button>
                                <button class="cp-btn extend" onclick="ProfVM.generatePDFReport()" style="background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.4); color: #818cf8;" title="Générer le rapport PDF des anomalies">📄 Rapport</button>
                                <button class="cp-btn extend" onclick="ProfVM.extendSession('${id}', 10)">➕ 10 min</button>
                                <button class="cp-btn extend" onclick="ProfVM.extendSession('${id}', 30)">➕ 30 min</button>
                            </div>
                        `;
                    } else {
                        controls.style.display = 'none';
                    }

                    const students = data.classe && data.classe.students ? data.classe.students : [];
                    const participants = data.participants || [];

                    // ── Lire les étudiants en attente depuis localStorage (source de vérité) ──
                    try {
                        const waitingKey = `_waiting_${id}`;
                        const waitingList = JSON.parse(localStorage.getItem(waitingKey) || '[]');
                        waitingList.forEach(entry => {
                            if (entry.studentId) {
                                this._waitingStudentsSet.add(entry.studentId.toString());
                            }
                        });
                    } catch(e) { /* silent */ }

                    // ── Calculer actifs / non actifs ──
                    let countActif = 0;
                    let countInactif = 0;

                    if (students.length === 0) {
                        participantsList.innerHTML = `
                            <div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">
                                <span style="font-size:32px;display:block;margin-bottom:12px;">📭</span>
                                Aucun étudiant inscrit dans cette classe.
                            </div>
                        `;
                    } else {
                        let html = '';
                        students.forEach(st => {
                            const sid = st._id || st.id || st;
                            const pObj = participants.find(p => {
                                let pid = '';
                                if (p.student) {
                                    pid = (typeof p.student === 'object') ? (p.student._id || p.student.id) : p.student;
                                } else {
                                    pid = p._id || p.id || p;
                                }
                                return pid && sid && pid.toString() === sid.toString();
                            });
                            // ⚠️ _waitingStudentsSet est la SOURCE DE VÉRITÉ (indépendant de l'API)
                            const sidStr = sid ? sid.toString() : '';
                            const isWaiting = sidStr && this._waitingStudentsSet.has(sidStr);
                            // Un étudiant en attente ne peut pas être "actif" visuellement
                            const isActif = !isWaiting && (pObj ? (pObj.status === 'actif') : false);
                            const hasNote = pObj && pObj.quizResult;

                            if (isActif) countActif++; else countInactif++;

                            // Déterminer le niveau de risque de cet étudiant
                            const riskLevel = isActif
                                ? (this._studentRiskMap[sid.toString()] || 'low')
                                : 'inactive';
                            const riskDotClass = riskLevel; // 'high'|'medium'|'low'|'inactive'

                            const avatarBg = isActif
                                ? 'background:linear-gradient(135deg,#10b981,#059669);'
                                : (isWaiting ? 'background:linear-gradient(135deg,#f59e0b,#d97706);' : '');

                            const screenBtn = isActif
                                ? `<button class="pm-action-btn" title="Voir l'écran" onclick="ProfVM.viewStudentScreenInPanel('${sid}','${st.prenom} ${st.nom}')">📺</button>`
                                : '';
                            const monitorBtn = isActif
                                ? `<button class="pm-action-btn" title="Surveiller" style="border-color:rgba(249,115,22,.4);color:#f97316;" onclick="ProfVM.openMonitorModal('${sid}','${st.prenom} ${st.nom}')">🔍</button>`
                                : '';
                            const msgBtn = isActif
                                ? `<button class="pm-action-btn" title="Message privé" style="border-color:rgba(99,102,241,.4);color:#818cf8;" onclick="ProfVM.openMessageModal('${sid}','${st.prenom} ${st.nom}')">💬</button>`
                                : '';

                            const acceptBtn = isWaiting
                                ? `<button class="pm-action-btn" title="Accorder l'accès" style="border-color:rgba(16,185,129,.5); background:rgba(16,185,129,.1); color:#10b981;" onclick="ProfVM.grantAccess('${id}', '${sid}')">✔️</button>
                                   <button class="pm-action-btn" title="Refuser l'accès" style="border-color:rgba(239,68,68,.5); background:rgba(239,68,68,.1); color:#ef4444;" onclick="ProfVM.denyAccess('${id}', '${sid}')">❌</button>`
                                : '';

                            const noteHtml = hasNote
                                ? `<span style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; font-size:10px; padding:2px 8px; border-radius:8px; font-weight:800; box-shadow: 0 2px 4px rgba(0,0,0,0.1); white-space:nowrap; flex-shrink:0;">✓ ${pObj.quizResult.score}/${pObj.quizResult.maxScore}</span>`
                                : '';

                            let badgeHtml = `<span class="pm-student-badge">Inscrit</span>`;
                            if (isActif) {
                                badgeHtml = `<span class="pm-student-badge actif">Actif</span>`;
                            } else if (isWaiting) {
                                badgeHtml = `<span class="pm-student-badge" style="color:#f59e0b; border-color:rgba(245,158,11,.3); background:rgba(245,158,11,.1);">En attente</span>`;
                            }

                            html += `
                                <div class="pm-student-item" id="pm-student-${sid}">
                                    <div class="pm-student-avatar" style="${avatarBg}">
                                        ${(st.prenom && st.nom) ? (st.prenom[0] + st.nom[0]).toUpperCase() : '??'}
                                        <div class="pm-risk-dot ${riskDotClass}"></div>
                                    </div>
                                    <div class="pm-student-info">
                                        <div class="pm-student-name" style="white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.1;">${st.prenom} ${st.nom}</div>
                                        <div class="pm-student-nc">NC: ${st.studentCardNumber || 'N/A'}</div>
                                    </div>
                                    <div class="pm-student-actions" style="display:flex; gap:6px; align-items:center;">
                                        ${acceptBtn}
                                        ${screenBtn}
                                        ${monitorBtn}
                                        ${msgBtn}
                                        ${noteHtml}
                                        ${badgeHtml}
                                    </div>
                                </div>
                            `;
                        });
                        participantsList.innerHTML = html;
                    }

                    // ── Mettre à jour les compteurs ──
                    const cA = document.getElementById('pm-count-actif');
                    const cI = document.getElementById('pm-count-inactif');
                    if (cA) cA.textContent = countActif;
                    if (cI) cI.textContent = countInactif;

                } catch (e) {
                    // ── Retry logic: retry up to 3 times with increasing delay ──
                    const maxRetries = 3;
                    if (_retryCount < maxRetries - 1) {
                        const delay = ((_retryCount + 1) * 2000); // 2s, 4s, 6s
                        console.warn(`[Session] Fetch failed (attempt ${_retryCount + 1}/${maxRetries}), retrying in ${delay}ms...`, e.message);
                        setTimeout(() => {
                            this.refreshSessionDetails(id, isSilent, _retryCount + 1);
                        }, delay);
                        return; // Don't show error yet
                    }
                    // All retries exhausted — show final error
                    if (!isSilent) {
                        participantsList.innerHTML = `
                            <div style="text-align:center;padding:40px;color:#ed4245;">
                                ⚠️ ${e.message}
                                <div style="margin-top:12px;">
                                    <button onclick="ProfVM.refreshSessionDetails('${id}')" style="background:rgba(237,66,69,0.15);border:1px solid rgba(237,66,69,0.4);color:#ed4245;padding:6px 16px;border-radius:8px;cursor:pointer;font-size:12px;">🔄 Réessayer</button>
                                </div>
                            </div>
                        `;
                        subheader.textContent = 'Erreur de chargement';
                    }
                }
            },

            async grantAccess(testId, studentId) {
                try {
                    // 1. Retirer du set d'attente ET du localStorage (SOURCE DE VÉRITÉ)
                    this._waitingStudentsSet.delete(studentId.toString());
                    try {
                        const waitingKey = `_waiting_${testId}`;
                        const list = JSON.parse(localStorage.getItem(waitingKey) || '[]');
                        const updated = list.filter(e => e.studentId !== studentId.toString());
                        if (updated.length > 0) { localStorage.setItem(waitingKey, JSON.stringify(updated)); }
                        else { localStorage.removeItem(waitingKey); }
                    } catch(e) { /* silent */ }

                    // 2. Mise à jour optimiste de l'UI (côté prof)
                    if (ProfData.currentSessionDetails && ProfData.currentSessionDetails.participants) {
                        const pObj = ProfData.currentSessionDetails.participants.find(p => {
                            const pid = (typeof p.student === 'object') ? (p.student._id || p.student.id) : p.student;
                            return pid && pid.toString() === studentId.toString();
                        });
                        if (pObj) pObj.status = 'actif';
                    }
                    this.refreshSessionDetails(testId, true);

                    // 3. Envoyer via WebSocket → le backend émet 'student-access-granted' à l'étudiant
                    if (this.socket) {
                        this.socket.emit('grant-student-access', { testId, studentId });
                        console.log('[Prof] grant-student-access émis pour:', studentId);
                    } else {
                        console.warn('[Prof] Socket non disponible pour grantAccess');
                    }
                    // 4. Fallback localStorage (même app Electron = même localStorage)
                    localStorage.setItem('_accessGranted_' + studentId, '1');
                } catch(e) {
                    console.error('Error granting access', e);
                }
            },

            async denyAccess(testId, studentId) {
                try {
                    // 1. Retirer du set d'attente ET du localStorage (SOURCE DE VÉRITÉ)
                    this._waitingStudentsSet.delete(studentId.toString());
                    try {
                        const waitingKey = `_waiting_${testId}`;
                        const list = JSON.parse(localStorage.getItem(waitingKey) || '[]');
                        const updated = list.filter(e => e.studentId !== studentId.toString());
                        if (updated.length > 0) { localStorage.setItem(waitingKey, JSON.stringify(updated)); }
                        else { localStorage.removeItem(waitingKey); }
                    } catch(e) { /* silent */ }

                    // 2. Mise à jour optimiste de l'UI (côté prof)
                    if (ProfData.currentSessionDetails && ProfData.currentSessionDetails.participants) {
                        const pObj = ProfData.currentSessionDetails.participants.find(p => {
                            const pid = (typeof p.student === 'object') ? (p.student._id || p.student.id) : p.student;
                            return pid && pid.toString() === studentId.toString();
                        });
                        if (pObj) pObj.status = 'refused';
                    }
                    this.refreshSessionDetails(testId, true);

                    // 3. Envoyer via WebSocket → le backend émet 'student-access-denied' à l'étudiant
                    if (this.socket) {
                        this.socket.emit('deny-student-access', { testId, studentId });
                        console.log('[Prof] deny-student-access émis pour:', studentId);
                    } else {
                        console.warn('[Prof] Socket non disponible pour denyAccess');
                    }
                    // 4. Fallback localStorage (même app Electron = même localStorage)
                    localStorage.setItem('_accessDenied_' + studentId, '1');
                } catch(e) {
                    console.error('Error denying access', e);
                }
            },

            // ── Voir l'écran d'un étudiant DANS le panneau central ──
            viewStudentScreenInPanel(studentId, studentName) {
                const container = document.getElementById('pm-screen-container');
                const nameLabel = document.getElementById('pm-screen-student-name');
                const statusLabel = document.getElementById('pm-screen-status');
                const btnFullscreen = document.getElementById('pm-btn-fullscreen');

                if (!container) return;

                if (nameLabel) nameLabel.textContent = studentName;
                if (statusLabel) statusLabel.style.display = 'inline-flex';
                if (btnFullscreen) btnFullscreen.style.display = 'flex';

                // Highlight selected student
                document.querySelectorAll('.pm-student-item').forEach(el => el.classList.remove('selected'));
                const studentEl = document.getElementById(`pm-student-${studentId}`);
                if (studentEl) studentEl.classList.add('selected');

                container.innerHTML = `
                    <img id="pm-screen-img" class="pm-screen-img" style="display:none;" src="" alt="Écran en direct" onclick="ProfVM.toggleScreenFullscreen()" />
                    <div id="pm-screen-loading" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:rgba(255,255,255,.4);">
                        <div class="spin-ring" style="width:36px;height:36px;border-width:3px;margin-bottom:12px;"></div>
                        <p style="font-size:12px;">Connexion au flux de ${studentName}...</p>
                    </div>
                `;

                ProfData.watchingStudentId = studentId;

                if (this.socket) {
                    this.socket.emit('request-screen-start', { studentId });

                    this.socket.off('student-screen-frame');
                    this.socket.on('student-screen-frame', (data) => {
                        if (data.studentId === ProfData.watchingStudentId) {
                            const loading = document.getElementById('pm-screen-loading');
                            const img = document.getElementById('pm-screen-img');
                            if (loading) loading.style.display = 'none';
                            if (img) {
                                img.src = data.frame || data.imageBase64;
                                img.style.display = 'block';
                            }
                        }
                    });
                }
            },

            toggleScreenFullscreen() {
                const container = document.getElementById('pm-screen-container');
                const btn = document.getElementById('pm-btn-fullscreen');
                if (!container) return;

                const isFS = container.classList.toggle('pm-screen-fullscreen');
                console.log("[ProfVM] Fullscreen toggled:", isFS);

                if (btn) {
                    btn.innerHTML = isFS ? '✖' : '⛶';
                    btn.style.zIndex = "100002"; // Toujours au dessus
                }

                if (isFS) {
                    // Alert pour quitter
                    const tip = document.createElement('div');
                    tip.id = 'fs-tip';
                    tip.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#fff; padding:10px 20px; border-radius:30px; font-size:13px; z-index:100001; pointer-events:none; transition:opacity 0.5s; box-shadow:0 4px 15px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.1);';
                    tip.innerHTML = '✨ <strong>Mode Plein Écran</strong> — Appuyez sur <strong>ÉCHAP</strong> pour quitter';
                    document.body.appendChild(tip);
                    setTimeout(() => { if (tip) tip.style.opacity = '0'; }, 3000);
                    setTimeout(() => { if (tip && tip.parentNode) tip.parentNode.removeChild(tip); }, 3600);
                }
            },

            // ── Ajouter une alerte dans le panneau global ──
            _pmAlerts: [],
            _pmAlertCount: 0,
            _reportLog: [], // Structured log for PDF report: [{time, studentName, studentId, message, level}]

            addGlobalAlert(studentName, studentId, message, level = 'high') {
                this._pmAlertCount++;
                // ── Store in structured report log ──
                this._reportLog.push({
                    time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    studentName: studentName || 'Étudiant',
                    studentId: studentId || '',
                    message,
                    level
                });
                const alertsBox = document.getElementById('pm-global-alerts');
                const countBadge = document.getElementById('pm-alerts-count');
                if (!alertsBox) return;

                // Mise à jour du badge compteur
                if (countBadge) {
                    countBadge.style.display = 'inline';
                    countBadge.textContent = this._pmAlertCount;
                }

                // Mettre à jour le risque dot de l'étudiant
                const sid = studentId ? studentId.toString() : '';
                const prevRisk = this._studentRiskMap[sid] || 'low';
                if (level === 'high' || (level === 'medium' && prevRisk === 'low')) {
                    this._studentRiskMap[sid] = level;
                    // Mettre à jour visuellement le dot
                    const studentEl = document.getElementById(`pm-student-${sid}`);
                    if (studentEl) {
                        const dot = studentEl.querySelector('.pm-risk-dot');
                        if (dot) {
                            dot.className = `pm-risk-dot ${level}`;
                        }
                    }
                }

                const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const alertClass = level === 'high' ? '' : 'medium';
                const icon = level === 'high' ? '🔴' : '🟡';

                const alertEl = document.createElement('div');
                alertEl.className = `pm-alert-item ${alertClass}`;
                alertEl.innerHTML = `<span>${icon}</span><div><strong>${studentName}</strong> — ${message}<br><span style="font-size:9px;opacity:.6;">${now}</span></div>`;

                // Remove placeholder if present
                const placeholder = alertsBox.querySelector('[style*="Aucune alerte"]');
                if (placeholder) placeholder.remove();

                alertsBox.insertBefore(alertEl, alertsBox.firstChild);

                // Limit to 50 alerts
                const items = alertsBox.querySelectorAll('.pm-alert-item');
                if (items.length > 50) items[items.length - 1].remove();
            },

            closeDetailsModal() {
                if (this.socket) {
                    this.socket.disconnect();
                    this.socket = null;
                }
                if (ProfData.detailsInterval) clearInterval(ProfData.detailsInterval);
                // Reset alerts and risk map but KEEP _reportLog until a new session is opened
                this._pmAlerts = [];
                this._pmAlertCount = 0;
                this._studentRiskMap = {};
                const cntBadge = document.getElementById('pm-alerts-count');
                if (cntBadge) { cntBadge.style.display = 'none'; cntBadge.textContent = '0'; }
                document.getElementById('detailsModal').classList.remove('open');
            },


            setMode(mode) {
                this.mode = mode;
                document.getElementById('modeExistant').classList.toggle('active', mode === 'existant');
                document.getElementById('modeNouveau').classList.toggle('active', mode === 'nouveau');
                document.getElementById('zoneExistant').style.display = mode === 'existant' ? 'grid' : 'none';
                document.getElementById('zoneNouveau').style.display = mode === 'nouveau' ? 'grid' : 'none';
                if (mode === 'nouveau') {
                    document.getElementById('n_date').value = new Date().toISOString().split('T')[0];
                }
            },

            quizQuestions: [],
            selectedQuizType: 'QCM',

            toggleQuizType(el) {
                document.querySelectorAll('.quiz-type-chip').forEach(c => c.classList.remove('selected'));
                el.classList.add('selected');
                this.selectedQuizType = el.getAttribute('data-type');
            },

            openAIModal() {
                document.getElementById('aiFileInput').value = '';
                document.getElementById('aiTextInput').value = '';
                document.getElementById('aiLoading').style.display = 'none';
                document.getElementById('aiModal').classList.add('open');
            },

            closeAIModal() {
                document.getElementById('aiModal').classList.remove('open');
            },

            async handleAIFiles(input) {
                const file = input.files[0];
                if (!file) return;

                const ext = file.name.split('.').pop().toLowerCase();
                const reader = new FileReader();

                if (ext === 'txt') {
                    reader.onload = (e) => {
                        document.getElementById('aiTextInput').value = e.target.result;
                    };
                    reader.readAsText(file);
                } else if (ext === 'pdf') {
                    reader.onload = async function () {
                        try {
                            const typedarray = new Uint8Array(this.result);
                            const pdfjsLib = window['pdfjs-dist/build/pdf'];
                            if (!pdfjsLib) { alert("Le module PDF n'est pas prêt."); return; }
                            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

                            const pdf = await pdfjsLib.getDocument(typedarray).promise;
                            let fullText = '';
                            for (let i = 1; i <= pdf.numPages; i++) {
                                const page = await pdf.getPage(i);
                                const textContent = await page.getTextContent();
                                fullText += textContent.items.map(s => s.str).join(' ') + '\n';
                            }
                            document.getElementById('aiTextInput').value = fullText;
                        } catch (e) {
                            alert("Impossible de lire ce PDF: " + e.message);
                        }
                    };
                    reader.readAsArrayBuffer(file);
                } else if (ext === 'doc' || ext === 'docx') {
                    reader.onload = async (e) => {
                        try {
                            if (!window.mammoth) { alert("Le module Word n'est pas prêt."); return; }
                            const arrayBuffer = e.target.result;
                            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
                            document.getElementById('aiTextInput').value = result.value;
                        } catch (err) {
                            alert("Impossible de lire ce Word: " + err.message);
                        }
                    };
                    reader.readAsArrayBuffer(file);
                } else if (ext === 'ppt' || ext === 'pptx') {
                    reader.onload = async (e) => {
                        try {
                            if (!window.JSZip) { alert("Le module JSZip n'est pas prêt."); return; }
                            const zip = await JSZip.loadAsync(e.target.result);
                            let fullText = '';
                            // Les slides PowerPoint sont dans ppt/slides/slide*.xml
                            const slideFiles = Object.keys(zip.files).filter(f => f.match(/ppt\/slides\/slide[0-9]+\.xml/));
                            // On trie par numéro de slide
                            slideFiles.sort((a, b) => {
                                const numA = parseInt(a.replace(/[^0-9]/g, ''));
                                const numB = parseInt(b.replace(/[^0-9]/g, ''));
                                return numA - numB;
                            });
                            for (const slideFile of slideFiles) {
                                const xmlStr = await zip.files[slideFile].async('string');
                                // Extraction du texte des balises <a:t>
                                const matches = xmlStr.match(/\u003ca:t\u003e([^<]+)\u003c\/a:t\u003e/g) || [];
                                const slideText = matches.map(m => m.replace(/\u003c[^>]+\u003e/g, '')).join(' ');
                                fullText += slideText + '\n';
                            }
                            document.getElementById('aiTextInput').value = fullText.trim() || '(Aucun texte extrait du PowerPoint)';
                        } catch (err) {
                            alert("Impossible de lire ce PowerPoint: " + err.message);
                        }
                    };
                    reader.readAsArrayBuffer(file);
                } else {
                    alert("Format non supporté !");
                }
            },

            async generateAIQuiz() {
                const text = document.getElementById('aiTextInput').value.trim();
                const count = parseInt(document.getElementById('aiQuestionCount').value) || 5;

                if (!text) {
                    alert("Veuillez fournir un texte ou importer un document de cours !");
                    return;
                }

                document.getElementById('aiLoading').style.display = 'block';

                try {
                    const token = sessionStorage.getItem('accessToken');
                    const response = await fetch(`${API_BASE}/practical-tests/generate-quiz`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ text, count })
                    });

                    const questions = await response.json();
                    if (!response.ok) throw new Error(questions.message || "Erreur Backend");

                    if (Array.isArray(questions)) {
                        questions.forEach(q => {
                            q.id = Date.now().toString() + Math.random().toString().slice(2, 6);
                            // ensure correct answers is always an array of strings
                            if (q.correctAnswers) {
                                q.correctAnswers = q.correctAnswers.map(ans => ans.toString());
                            } else {
                                q.correctAnswers = ["0"];
                            }
                            this.quizQuestions.push(q);
                        });
                        this.renderQuizQuestions();
                        this.closeAIModal();
                    } else {
                        throw new Error("Le format renvoyé n'est pas un tableau valide.");
                    }
                } catch (err) {
                    console.error("AI Error:", err);
                    alert("Erreur lors de la génération avec l'IA: " + err.message);
                } finally {
                    document.getElementById('aiLoading').style.display = 'none';
                }
            },

            addQuestion() {
                const id = Date.now().toString();
                const type = this.selectedQuizType;
                let q = { id, type, text: '', points: 1, options: [], correctAnswers: [] };

                if (type === 'QCM' || type === 'QCMImage') {
                    q.options = ['', ''];
                    q.correctAnswers = [];
                } else if (type === 'VraiFaux') {
                    q.options = ['Vrai', 'Faux'];
                    q.correctAnswers = ['Vrai'];
                } else if (type === 'Classement') {
                    q.options = ['', ''];
                    q.correctAnswers = []; // Order defined by options order
                }

                this.quizQuestions.push(q);
                this.renderQuizQuestions();
            },

            removeQuestion(id) {
                this.quizQuestions = this.quizQuestions.filter(q => q.id !== id);
                this.renderQuizQuestions();
            },

            renderQuizQuestions() {
                const container = document.getElementById('quizQuestionsContainer');
                if (!container) return;

                container.innerHTML = this.quizQuestions.map((q, idx) => {
                    let optionsHtml = '';
                    if (q.type === 'QCM') {
                        optionsHtml = q.options.map((opt, oIdx) => `
                            <div class="option-row">
                                <input type="checkbox" class="correct-checkbox" ${q.correctAnswers.includes(oIdx.toString()) ? 'checked' : ''} onchange="ProfVM.updateCorrectAnswer('${q.id}', '${oIdx}', this.checked)">
                                <input type="text" placeholder="Option ${oIdx + 1}" value="${opt}" oninput="ProfVM.updateOption('${q.id}', ${oIdx}, this.value)" style="flex:1; height:30px; font-size:12px;">
                                <span class="remove-btn" onclick="ProfVM.removeOption('${q.id}', ${oIdx})">×</span>
                            </div>
                        `).join('') + `<button class="btn btn-ghost" style="height:25px; font-size:10px;" onclick="ProfVM.addOption('${q.id}')">+ Ajouter une option</button>`;
                    } else if (q.type === 'QCMImage') {
                        optionsHtml = `<div style="font-size:11px; color:rgba(255,255,255,0.4); margin-bottom: 5px;">Sélectionnez les images et cochez la (les) bonne(s) réponse(s)</div>` +
                            q.options.map((opt, oIdx) => `
                            <div class="option-row" style="align-items: flex-start; background: rgba(255,255,255,0.02); padding: 5px; border-radius: 8px;">
                                <input type="checkbox" class="correct-checkbox" ${q.correctAnswers.includes(oIdx.toString()) ? 'checked' : ''} onchange="ProfVM.updateCorrectAnswer('${q.id}', '${oIdx}', this.checked)" style="margin-top: 5px;">
                                <div style="flex:1; display:flex; flex-direction:column; gap:5px;">
                                    ${opt ? `<img src="${opt}" style="max-height: 80px; object-fit: contain; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);"/>` : `<div style="height:40px; background:rgba(0,0,0,0.2); border:1px dashed rgba(255,255,255,0.2); border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:10px; color:rgba(255,255,255,0.3);">Aucune image</div>`}
                                    <input type="file" accept="image/*" onchange="ProfVM.handleImageUpload(event, '${q.id}', ${oIdx})" style="font-size: 11px;">
                                </div>
                                <span class="remove-btn" onclick="ProfVM.removeOption('${q.id}', ${oIdx})" style="margin-top: 5px;">×</span>
                            </div>
                        `).join('') + `<button class="btn btn-ghost" style="height:25px; font-size:10px; margin-top:5px;" onclick="ProfVM.addOption('${q.id}')">+ Ajouter une image</button>`;
                    } else if (q.type === 'VraiFaux') {
                        optionsHtml = `
                            <div style="display:flex; gap:20px;">
                                <label style="display:flex; align-items:center; gap:5px; font-size:12px;">
                                    <input type="radio" name="vf_${q.id}" ${q.correctAnswers[0] === 'Vrai' ? 'checked' : ''} onchange="ProfVM.updateCorrectAnswer('${q.id}', 'Vrai', true)"> Vrai
                                </label>
                                <label style="display:flex; align-items:center; gap:5px; font-size:12px;">
                                    <input type="radio" name="vf_${q.id}" ${q.correctAnswers[0] === 'Faux' ? 'checked' : ''} onchange="ProfVM.updateCorrectAnswer('${q.id}', 'Faux', true)"> Faux
                                </label>
                            </div>
                        `;
                    } else if (q.type === 'Libre') {
                        optionsHtml = `<div style="font-size:11px; color:rgba(255,255,255,0.4);">Réponse libre (texte saisi par l'étudiant)</div>`;
                    } else if (q.type === 'Classement') {
                        optionsHtml = `
                            <div style="font-size:11px; color:rgba(255,185,0,.7); margin-bottom:5px;">L'ordre saisi ici est l'ordre correct.</div>
                            ` + q.options.map((opt, oIdx) => `
                            <div class="option-row">
                                <span style="font-size:12px; color:rgba(255,255,255,.4);">${oIdx + 1}.</span>
                                <input type="text" placeholder="Élément" value="${opt}" oninput="ProfVM.updateOption('${q.id}', ${oIdx}, this.value)" style="flex:1; height:30px; font-size:12px;">
                                <span class="remove-btn" onclick="ProfVM.removeOption('${q.id}', ${oIdx})">×</span>
                            </div>
                        `).join('') + `<button class="btn btn-ghost" style="height:25px; font-size:10px;" onclick="ProfVM.addOption('${q.id}')">+ Ajouter un élément</button>`;
                    }

                    return `
                        <div class="question-card">
                            <div class="question-header">
                                <span style="font-size:12px; font-weight:700; color:var(--primary);">#${idx + 1} - ${q.type}</span>
                                <span class="remove-btn" onclick="ProfVM.removeQuestion('${q.id}')">🗑️</span>
                            </div>
                            <div class="question-content">
                                <input type="text" placeholder="Question..." value="${q.text}" oninput="ProfVM.updateQuestionText('${q.id}', this.value)" style="width:100%; height:36px; font-size:13px; font-weight:500;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <label style="font-size:11px; color:rgba(255,255,255,0.4);">Points:</label>
                                    <input type="number" value="${q.points}" oninput="ProfVM.updateQuestionPoints('${q.id}', this.value)" style="width:50px; height:24px; font-size:11px;">
                                </div>
                                <div class="options-container">
                                    ${optionsHtml}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            },

            updateQuestionText(id, text) {
                const q = this.quizQuestions.find(q => q.id === id);
                if (q) q.text = text;
            },

            updateQuestionPoints(id, points) {
                const q = this.quizQuestions.find(q => q.id === id);
                if (q) q.points = parseInt(points) || 1;
            },

            updateOption(id, oIdx, val) {
                const q = this.quizQuestions.find(q => q.id === id);
                if (q) {
                    q.options[oIdx] = val;
                    if (q.type === 'Classement') {
                        q.correctAnswers = [...q.options]; // The correct order is the defined order
                    }
                }
            },

            addOption(id) {
                const q = this.quizQuestions.find(q => q.id === id);
                if (q) {
                    q.options.push('');
                    this.renderQuizQuestions();
                }
            },

            handleImageUpload(event, id, oIdx) {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64 = e.target.result;
                    this.updateOption(id, oIdx, base64);
                    this.renderQuizQuestions(); // Refresh UI to show the image preview
                };
                reader.readAsDataURL(file);
            },

            removeOption(id, oIdx) {
                const q = this.quizQuestions.find(q => q.id === id);
                if (q && q.options.length > 1) {
                    q.options.splice(oIdx, 1);
                    // Update correct answers indices for QCM / QCMImage
                    if (q.type === 'QCM' || q.type === 'QCMImage') {
                        q.correctAnswers = q.correctAnswers
                            .map(a => parseInt(a))
                            .filter(a => a !== oIdx)
                            .map(a => (a > oIdx ? a - 1 : a).toString());
                    }
                    this.renderQuizQuestions();
                }
            },

            updateCorrectAnswer(id, val, isChecked) {
                const q = this.quizQuestions.find(q => q.id === id);
                if (q) {
                    if (q.type === 'QCM' || q.type === 'QCMImage') {
                        if (isChecked) {
                            if (!q.correctAnswers.includes(val)) q.correctAnswers.push(val);
                        } else {
                            q.correctAnswers = q.correctAnswers.filter(a => a !== val);
                        }
                    } else if (q.type === 'VraiFaux') {
                        q.correctAnswers = [val];
                    }
                }
            },

            async fetchExams() {
                document.getElementById('examList').innerHTML = `
                <div class="exam-loading">
                    <div class="spin-ring"></div>Connexion au serveur...
                </div>`;
                try {
                    // ── Étape 0 : Vérifier si l'API est joignable (évite cold start silencieux)
                    const pingCtrl = new AbortController();
                    const pingTimer = setTimeout(() => pingCtrl.abort(), 6000);
                    let pingOk = false;
                    try {
                        const ping = await fetch(`${API_BASE}/auth/config-test`, { signal: pingCtrl.signal });
                        pingOk = ping.ok;
                    } catch (_) { /* timeout ou réseau indispo */ }
                    clearTimeout(pingTimer);
                    if (!pingOk) throw new Error('API injoignable (timeout)');

                    // ── Étape 1 : Obtenir le token service ──────────────────────────────
                    document.getElementById('examList').innerHTML = `
                    <div class="exam-loading"><div class="spin-ring"></div>Authentification...</div>`;

                    const tr = await fetch(`${API_BASE}/auth/login`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: SERVICE_EMAIL, password: SERVICE_PASSWORD }),
                    });
                    if (!tr.ok) throw new Error(`Auth échouée (${tr.status})`);
                    const authData = await tr.json();
                    if (authData.status === 'error') throw new Error('Compte service invalide');
                    const access_token = authData.access_token;
                    if (!access_token) throw new Error('Token absent dans la réponse');

                    // ── Étape 2 : Récupérer les examens ─────────────────────────────────
                    document.getElementById('examList').innerHTML = `
                    <div class="exam-loading"><div class="spin-ring"></div>Chargement des examens...</div>`;

                    const er = await fetch(`${API_BASE}/exams`, {
                        headers: { Authorization: `Bearer ${access_token}` }
                    });
                    if (!er.ok) throw new Error(`/exams non disponible (${er.status})`);
                    const raw = await er.json();
                    const all = Array.isArray(raw) ? raw : (raw.data || raw.items || raw.exams || []);

                    // ── On accepte TOUS les examens pour le test (ou on filtre intelligemment) ──
                    ProfData.allExams = all.filter(e => e.matiere || e.subject || e.title);
                    if (!ProfData.allExams.length) throw new Error("Aucun examen n'est disponible pour le moment.");

                    // ── Trier par nom de classe ──────────────────────────────────────────
                    ProfData.allExams.sort((a, b) => {
                        const ca = (_resolveStr(a.classe, 'nom') || _resolveStr(a.class) || '').toLowerCase();
                        const cb = (_resolveStr(b.classe, 'nom') || _resolveStr(b.class) || '').toLowerCase();
                        return ca.localeCompare(cb);
                    });

                    ProfData.filteredExams = [...ProfData.allExams];
                    this.renderExamList(ProfData.filteredExams);
                } catch (e) {
                    console.error('[ProfVM] fetchExams Error:', e.message);
                    document.getElementById('examList').innerHTML = `
                    <div style="text-align:center; padding:30px; color:#ed4245; font-size:13px;">
                        ⚠️ Impossible de charger les examens :<br>
                        <span style="opacity:0.7;">${e.message}</span><br>
                        <button class="btn btn-ghost" style="margin-top:15px; height:32px; font-size:11px;" onclick="ProfVM.fetchExams()">🔄 Réessayer</button>
                    </div>`;
                }
            },

            renderExamList(list, isDemo = false) {
                const el = document.getElementById('examList');
                if (!list.length) { el.innerHTML = '<div class="exam-loading" style="color:rgba(255,255,255,.3)">Aucun examen disponible</div>'; return; }
                const demo = isDemo
                    ? `<div style="font-size:11px;color:rgba(255,185,0,.7);padding:6px 10px;background:rgba(255,185,0,.07);border-radius:6px;margin-bottom:8px;">⚠ Mode démonstration — API non joignable</div>`
                    : '';
                const icons = { poo: '☕', java: '☕', python: '🐍', web: '🌐', data: '🗄', reseau: '🔌', algo: '📊', reseaux: '🔌' };

                // Stocker dans un Map keyed par _id ─ on passe UNIQUEMENT l'id dans onclick
                // (injecter du JSON dans un attribut HTML plante avec les objets MongoDB)
                ProfData._examMap = {};
                list.forEach(e => {
                    const id = _resolveStr(e._id);
                    if (id) ProfData._examMap[id] = e;
                });

                el.innerHTML = demo + list.map(e => {
                    const title = _resolveStr(e.matiere, 'nom', 'code', 'name')
                        || _resolveStr(e.title) || _resolveStr(e.nom) || '—';
                    const classe = _getClasse(e);
                    const dateRaw = e.date || e.examDate || e.scheduledAt || '';
                    const dateStr = dateRaw ? new Date(dateRaw).toLocaleDateString('fr-FR') : '—';
                    const duree = _formatDuree(e.duree ?? e.durationMinutes ?? e.duration);
                    // Icône 💻 pour examens pratiques
                    const icon = '💻';
                    const sid = _resolveStr(e._id);
                    // Meta : filtre les éléments vides
                    const meta = [classe, dateStr, duree].filter(Boolean).join(' · ');
                    return `
                <div class="exam-card" id="exam-${sid}" data-exam-id="${sid}" onclick="ProfVM.selectExamById('${sid}')">
                    <div class="exam-card-icon">${icon}</div>
                    <div class="exam-card-body">
                        <div class="exam-card-title">${title}</div>
                        <div class="exam-card-meta">${meta}</div>
                    </div>
                    <div class="exam-card-radio"></div>
                </div>`;
                }).join('');
            },

            /** Appelé par onclick — cherche l'examen dans _examMap par son _id */
            selectExamById(id) {
                const exam = ProfData._examMap && ProfData._examMap[id];
                if (!exam) { console.warn('[ProfVM] selectExamById: id inconnu =', id); return; }
                this._applyExamSelection(exam);
            },

            /** Conservé pour compatibilité */
            selectExam(examOrJson) {
                const exam = (typeof examOrJson === 'string') ? JSON.parse(examOrJson) : examOrJson;
                this._applyExamSelection(exam);
            },

            _applyExamSelection(exam) {
                this.selectedExam = exam;
                document.querySelectorAll('.exam-card').forEach(c => c.classList.remove('selected'));
                const card = document.getElementById(`exam-${exam._id}`);
                if (card) card.classList.add('selected');

                const matiereStr = _resolveStr(exam.matiere, 'nom', 'code', 'name')
                    || _resolveStr(exam.subject) || _resolveStr(exam.title) || '—';
                let classeStr = _getClasse(exam) || '—';

                const dateRaw = exam.date || exam.examDate || exam.scheduledAt || '';
                const dateStr = dateRaw
                    ? new Date(dateRaw).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                    : '—';
                const dureeStr = _formatDuree(exam.duree ?? exam.durationMinutes ?? exam.duration);

                document.getElementById('af_matiere').value = matiereStr;
                document.getElementById('af_classe').value = classeStr;
                document.getElementById('af_date').value = dateStr;
                document.getElementById('af_duree').value = dureeStr;

                // Heure de début : priorité à l'heure planifiée, puis startedAt, puis maintenant
                const startRaw = _resolveStr(exam.scheduledStartTime) || _resolveStr(exam.startedAt) || _resolveStr(exam.date) || _resolveStr(exam.examDate);
                const startDate = startRaw ? new Date(startRaw) : new Date();
                const timeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
                document.getElementById('af_start').value = timeStr;

                const noExamMsg = document.getElementById('noExamSelectedMsg');
                if (noExamMsg) noExamMsg.style.display = 'none';

                document.getElementById('autoFilledFields').style.display = 'block';
                // Remove scrollIntoView since right column is sticky/fixed now and won't need scrolling
            },

            filterExams(q) {
                q = q.toLowerCase().trim();
                ProfData.filteredExams = q
                    ? ProfData.allExams.filter(e => {
                        const m = (_resolveStr(e.matiere, 'nom', 'code', 'name') || e.title || '').toLowerCase();
                        const c = _getClasse(e).toLowerCase();
                        return m.includes(q) || c.includes(q);
                    })
                    : [...ProfData.allExams];
                this.renderExamList(ProfData.filteredExams);
            },

            validate() {
                const err = document.getElementById('modalError');
                err.style.display = 'none';
                if (this.mode === 'existant' && !this.selectedExam) {
                    err.textContent = '⚠ Veuillez sélectionner un examen dans la liste.';
                    err.style.display = 'block'; return false;
                }
                if (this.mode === 'nouveau') {
                    if (!document.getElementById('n_matiere').value.trim()) {
                        err.textContent = '⚠ Veuillez saisir la matière / le devoir.';
                        err.style.display = 'block'; return false;
                    }
                    if (!document.getElementById('n_date').value) {
                        err.textContent = '⚠ Veuillez sélectionner une date de début.';
                        err.style.display = 'block'; return false;
                    }
                    if (!document.getElementById('n_start').value) {
                        err.textContent = '⚠ Veuillez sélectionner une heure de début.';
                        err.style.display = 'block'; return false;
                    }
                    if (!document.getElementById('n_classe').value) {
                        err.textContent = '⚠ Veuillez sélectionner une classe.';
                        err.style.display = 'block'; return false;
                    }
                }
                return true;
            },

            async generateCode() {
                if (!this.validate()) return;

                const modalError = document.getElementById('modalError');
                modalError.style.display = 'none';

                let apiSessionCode = null;
                let data = null;
                let courseLabel, classeLabel, dateLabel, dureeLabel, startLabel;

                // On capture le bouton pour pouvoir le réinitialiser en cas d'erreur
                const btnGen = document.querySelector('#modalActions .btn-indigo') ||
                    document.querySelector('#modalActions .btn-green') ||
                    document.querySelector('#modalActions .btn-primary'); // Fallback sur plusieurs classes possibles
                const oriHtml = btnGen ? btnGen.innerHTML : 'Générer le code session';

                // ── 1. Création via le BACKEND (uniquement si examen existant sélectionné) ──
                if (this.mode === 'existant') {
                    try {
                        const token = sessionStorage.getItem('accessToken');
                        if (!token) throw new Error('Session expirée ou token manquant.');

                        const e = this.selectedExam;

                        // Extraire l'ID MongoDB de la classe avec vérification approfondie
                        const isMongoId = id => id && /^[0-9a-f]{24}$/i.test(String(id));
                        let classId = null;

                        // Chercher dans e.classe (_id, id, string brut)
                        if (e.classe) {
                            if (typeof e.classe === 'object') classId = e.classe._id || e.classe.id;
                            else if (isMongoId(e.classe)) classId = e.classe;
                        }

                        // Fallback : Chercher dans e.matiere.classe si non trouvé
                        if (!classId && e.matiere && e.matiere.classe) {
                            if (typeof e.matiere.classe === 'object') classId = e.matiere.classe._id || e.matiere.classe.id;
                            else if (isMongoId(e.matiere.classe)) classId = e.matiere.classe;
                        }

                        if (!classId) {
                            // Au lieu de bloquer, essayons de tricher ou avertissons
                            throw new Error("L'examen sélectionné n'a pas de classe associée avec un ID MongoDB valide dans la base de données. ID trouvé : " + encodeURIComponent(classId || "Aucun"));
                        }

                        courseLabel = _resolveStr(e.matiere, 'nom', 'code', 'name')
                            || _resolveStr(e.subject) || _resolveStr(e.title) || 'Examen';
                        classeLabel = (document.getElementById('af_classe').value || _getClasse(e) || '').trim() || '—';

                        let parsedDuree = 120;
                        if (e.duree) parsedDuree = parseInt(e.duree, 10);
                        if (e.durationMinutes) parsedDuree = parseInt(e.durationMinutes, 10);
                        if (isNaN(parsedDuree)) parsedDuree = 120;

                        const examDateSource = _resolveStr(e.scheduledStartTime) || _resolveStr(e.date) || _resolveStr(e.examDate) || _resolveStr(e.scheduledAt);
                        const examStartRaw = document.getElementById('af_start').value || '';
                        const scheduledStartIso = _toIsoFromDateAndTime(examDateSource, examStartRaw);
                        const scheduledEndIso = _addMinutesToIso(scheduledStartIso, parsedDuree);

                        // S'assurer qu'un lien tapé mais non ajouté via "+" est quand même envoyé
                        let urlToLink = this.sharedUrls && this.sharedUrls.length ? this.sharedUrls[0] : null;
                        const manualUrlBody = document.getElementById('urlInput')?.value.trim();
                        if (!urlToLink && manualUrlBody) {
                            urlToLink = manualUrlBody.startsWith('http') ? manualUrlBody : 'https://' + manualUrlBody;
                        }

                        const customWhitelist = (document.getElementById('af_whitelist')?.value || '').split(',')
                            .map(s => s.trim().toLowerCase())
                            .filter(s => s.length > 0);
                        const finalAllowedApps = [...new Set(customWhitelist)];

                        const formData = new FormData();
                        formData.append('classe', classId);
                        formData.append('examId', e._id);
                        formData.append('subject', courseLabel);
                        formData.append('classLabel', classeLabel);
                        formData.append('duration', parsedDuree.toString());
                        formData.append('testType', 'DESKTOP_APP');
                        if (scheduledStartIso) formData.append('scheduledStartTime', scheduledStartIso);
                        if (scheduledEndIso) formData.append('scheduledEndTime', scheduledEndIso);
                        if (finalAllowedApps.length) {
                            formData.append('allowedApps', JSON.stringify(finalAllowedApps));
                        }

                        if (urlToLink) formData.append('link', urlToLink);

                        const pdfInput = document.getElementById('pdfFile');
                        if (pdfInput.files && pdfInput.files[0]) {
                            formData.append('pdfFile', pdfInput.files[0]);
                        }

                        // Afficher le chargement
                        if (btnGen) {
                            btnGen.innerHTML = '<div class="spin-ring" style="width:14px;height:14px;border-width:2px;margin-right:6px;"></div> Patientez...';
                            btnGen.disabled = true;
                        }

                        // Appel à l'API practical-test
                        const resp = await fetch(`${API_BASE}/practical-tests`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            },
                            body: formData
                        });

                        data = await resp.json();

                        if (btnGen) {
                            btnGen.innerHTML = oriHtml;
                            btnGen.disabled = false;
                        }

                        if (!resp.ok) {
                            let detailedMsg = data.message || 'Erreur lors de la communication avec le serveur.';
                            if (data.errors && Array.isArray(data.errors)) {
                                detailedMsg = data.errors.map(e => e.message).join('<br> • ');
                            }
                            throw new Error(detailedMsg);
                        }

                        // Code 6 chiffres généré par le serveur
                        apiSessionCode = data.sessionCode;

                        // Infos pour affichage local
                        const dr = e.date || e.examDate || e.scheduledAt;
                        dateLabel = dr ? new Date(dr).toLocaleDateString('fr-FR') : '—';
                        dureeLabel = _formatDuree(e.duree ?? e.durationMinutes ?? e.duration);
                        startLabel = document.getElementById('af_start').value || '—';

                    } catch (err) {
                        if (btnGen) {
                            btnGen.innerHTML = oriHtml;
                            btnGen.disabled = false;
                        }
                        modalError.innerHTML = `<strong>Échec:</strong> ${err.message}`;
                        modalError.style.display = 'block';
                        return; // On arrête là si le backend échoue
                    }
                } else {
                    // ── 1.b Mode "Nouveau" (Quick session) ──
                    try {
                        const token = sessionStorage.getItem('accessToken');
                        const classId = document.getElementById('n_classe').value;
                        const subjectValue = document.getElementById('n_matiere').value.trim();
                        const dureeRaw = document.getElementById('n_duree').value;

                        const isMongoId = id => id && /^[0-9a-f]{24}$/i.test(String(id));
                        if (!isMongoId(classId)) {
                            throw new Error("Veuillez sélectionner une classe valide venant de la base de données.");
                        }

                        // Convertir durée "1h30" en minutes
                        let duration = 90;
                        if (dureeRaw.includes('h')) {
                            const parts = dureeRaw.split('h');
                            duration = (parseInt(parts[0] || 0) * 60) + (parseInt(parts[1] || 0));
                        } else if (dureeRaw.includes('min')) {
                            duration = parseInt(dureeRaw);
                        } else if (!isNaN(dureeRaw) && dureeRaw.trim() !== '') {
                            duration = parseInt(dureeRaw);
                        }

                        const nDate = document.getElementById('n_date').value;
                        const nStart = document.getElementById('n_start').value;
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

                        // Decide if it's a QUIZ or DESKTOP_APP
                        const isQuiz = this.quizQuestions.length > 0;
                        formData.append('testType', isQuiz ? 'QUIZ' : 'DESKTOP_APP');

                        if (isQuiz) {
                            formData.append('quizData', JSON.stringify({ questions: this.quizQuestions }));
                        }

                        formData.append('subject', subjectValue);

                        // Ajouter les apps de la whitelist (n_whitelist)
                        const customWhitelist = document.getElementById('n_whitelist').value.split(',')
                            .map(s => s.trim().toLowerCase())
                            .filter(s => s.length > 0);

                        const finalAllowedApps = [...new Set(customWhitelist)];
                        if (finalAllowedApps.length) {
                            formData.append('allowedApps', JSON.stringify(finalAllowedApps));
                        }

                        // S'assurer qu'un lien tapé mais non ajouté via "+" est quand même envoyé
                        let urlToLink = this.sharedUrls && this.sharedUrls.length ? this.sharedUrls[0] : null;
                        const manualUrlBody = document.getElementById('urlInput')?.value.trim();
                        if (!urlToLink && manualUrlBody) {
                            urlToLink = manualUrlBody.startsWith('http') ? manualUrlBody : 'https://' + manualUrlBody;
                        }
                        if (urlToLink) formData.append('link', urlToLink);

                        const pdfInput = document.getElementById('pdfFile');
                        if (pdfInput.files && pdfInput.files[0]) {
                            formData.append('pdfFile', pdfInput.files[0]);
                        }

                        // Afficher le chargement
                        if (btnGen) {
                            btnGen.innerHTML = '<div class="spin-ring" style="width:14px;height:14px;border-width:2px;margin-right:6px;"></div> Patientez...';
                            btnGen.disabled = true;
                        }

                        const resp = await fetch(`${API_BASE}/practical-tests`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            },
                            body: formData
                        });

                        data = await resp.json();

                        if (btnGen) {
                            btnGen.innerHTML = oriHtml;
                            btnGen.disabled = false;
                        }

                        if (!resp.ok) throw new Error(data.message || 'Erreur API création rapide.');

                        apiSessionCode = data.sessionCode;

                        // Infos local
                        courseLabel = subjectValue || 'Session rapide';
                        dateLabel = document.getElementById('n_date').value;
                        dureeLabel = dureeRaw;
                        startLabel = document.getElementById('n_start').value || '—';

                    } catch (err) {
                        if (btnGen) {
                            btnGen.innerHTML = oriHtml;
                            btnGen.disabled = false;
                        }
                        modalError.innerHTML = `<strong>Échec mode rapide:</strong> ${err.message}`;
                        modalError.style.display = 'block';
                        return;
                    }
                }

                // ── 2. Succès : Mise à jour de l'UI avec le code serveur ──
                if (!data) return; // Sécurité

                const code = apiSessionCode;
                const testId = data._id || data.id;

                sessionStorage.setItem('activeSessionCode', code);
                sessionStorage.setItem('activeTestId', testId);
                sessionStorage.setItem('sessionCourse', courseLabel);
                sessionStorage.setItem('sessionClasse', classeLabel);
                sessionStorage.setItem('sessionDate', dateLabel);
                sessionStorage.setItem('sessionDuree', dureeLabel);
                sessionStorage.setItem('sessionStart', startLabel);

                const selectedWhitelist = this.selectedExam
                    ? (document.getElementById('af_whitelist')?.value || '')
                    : (document.getElementById('n_whitelist')?.value || '');
                const allowedAppsLabel = selectedWhitelist.trim() || 'Non défini';
                sessionStorage.setItem('allowedIDEs', allowedAppsLabel);
                sessionStorage.setItem('sharedFiles', JSON.stringify(this.sharedFiles.map(f => f.name)));
                sessionStorage.setItem('sharedUrls', JSON.stringify(this.sharedUrls));

                const gc = document.getElementById('generatedCode');
                if (gc) {
                    gc.style.display = 'block';
                    gc.textContent = code;
                }

                const sum = document.getElementById('codeSummary');
                if (sum) {
                    sum.style.display = 'block';
                    const isRawId = s => /^[0-9a-f]{24}$/i.test(s);
                    const classeDisplay = (!classeLabel || classeLabel === '—' || isRawId(classeLabel)) ? '' : ` · ${classeLabel}`;
                    const timeDisplay = (startLabel !== '—') ? ` · [${startLabel}]` : '';
                    sum.innerHTML = `${courseLabel}${classeDisplay} · ${dureeLabel}${timeDisplay}`;
                }

                ProfData.sessions.unshift({
                    code,
                    course: _buildSessionTitle(courseLabel, classeLabel),
                    date: 'À l\'instant',
                    status: 'active'
                });
                const statCount = document.getElementById('stat-count');
                if (statCount) statCount.textContent = ProfData.sessions.length;

                this.renderSessions();

                const modalActions = document.getElementById('modalActions');
                if (modalActions) {
                    modalActions.innerHTML = `
                    <button class="btn btn-ghost" onclick="ProfVM.closeCreateModal()">Fermer</button>
                    <button class="btn btn-ghost" id="copyBtn"
                        onclick="navigator.clipboard.writeText('${code}').then(()=>document.getElementById('copyBtn').textContent='✅ Copié!')"
                    >📋 Copier</button>`;
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
                let url = input.value.trim();
                if (!url) return;
                // Auto-fix missing protocol
                if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
                if (!this.sharedUrls.includes(url)) {
                    this.sharedUrls.push(url);
                    this.renderUrlList();
                }
                input.value = '';
            },
            removeUrl(url) {
                this.sharedUrls = this.sharedUrls.filter(u => u !== url);
                this.renderUrlList();
            },
            renderUrlList() {
                const el = document.getElementById('urlList');
                if (!el) return;
                el.innerHTML = this.sharedUrls.map(url => `
                <div class="file-item">
                    <div class="file-item-left">
                        <span>🔗</span>
                        <div class="file-item-name" title="${url}">${url}</div>
                    </div>
                    <button class="file-remove" onclick="ProfVM.removeUrl('${url.replace(/'/g, "\\'")}')">✕</button>
                </div>`).join('');
            },

            // ── Contrôles de session en direct ──
            async togglePause(id, isPaused) {
                try {
                    const token = sessionStorage.getItem('accessToken');
                    const resp = await fetch(`${API_BASE}/practical-tests/${id}/pause`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (resp.ok) {
                        this.refreshSessionDetails(id, true);
                    } else {
                        const err = await resp.json();
                        alert("Erreur lors de la pause: " + (err.message || "Erreur inconnue"));
                    }
                } catch (e) {
                    console.error("Pause failed:", e);
                }
            },

            async extendSession(id, minutes) {
                try {
                    const token = sessionStorage.getItem('accessToken');
                    const resp = await fetch(`${API_BASE}/practical-tests/${id}/extend`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ minutes })
                    });
                    if (resp.ok) {
                        this.refreshSessionDetails(id, true);
                    } else {
                        const err = await resp.json();
                        alert("Erreur lors de l'extension: " + (err.message || "Erreur inconnue"));
                    }
                } catch (e) {
                    console.error("Extend failed:", e);
                }
            },

            async endSession(id) {
                if (!confirm("⚠️ Voulez-vous vraiment terminer cette session ?\n\nLes étudiants seront déconnectés et ne pourront plus soumettre leur travail.")) return;
                try {
                    const token = sessionStorage.getItem('accessToken');
                    const resp = await fetch(`${API_BASE}/practical-tests/${id}/end`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (resp.ok) {
                        // Proposer de générer le rapport avant de fermer
                        const hasAlerts = this._reportLog.length > 0;
                        if (hasAlerts && confirm(`✅ Session terminée.\n\n📄 ${this._reportLog.length} anomalie(s) détectée(s) pendant la session.\nVoulez-vous générer le rapport PDF maintenant ?`)) {
                            this.generatePDFReport();
                        }
                        this.closeDetailsModal();
                        this.fetchRecentSessions();
                    } else {
                        const err = await resp.json();
                        alert("Erreur lors de la fermeture: " + (err.message || "Erreur inconnue"));
                    }
                } catch (e) {
                    console.error("End session failed:", e);
                }
            },

            generatePDFReport() {
                const log = this._reportLog;
                const session = ProfData.currentSessionDetails;
                const sessionCode = session ? (session.sessionCode || '——') : '——';
                const sessionTitle = session ? (session.subject || session.classLabel || 'Session') : 'Session';
                const sessionDate = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
                const sessionTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

                if (!window.jspdf) {
                    alert('Librairie PDF non chargée. Vérifiez votre connexion internet.');
                    return;
                }
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

                const W = 210;
                const margin = 18;
                const colW = W - margin * 2;
                let y = 0;

                // ── Header Background ──
                doc.setFillColor(10, 11, 13);
                doc.rect(0, 0, W, 45, 'F');

                // ── Red accent bar ──
                doc.setFillColor(239, 68, 68);
                doc.rect(0, 0, 5, 45, 'F');

                // ── Title ──
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(18);
                doc.setTextColor(255, 255, 255);
                doc.text('RAPPORT ANALYTIQUE DE SESSION', margin + 4, 18);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(200, 200, 200);
                doc.text(`Session : ${sessionTitle}  |  Code : ${sessionCode}  |  ${sessionDate} à ${sessionTime}`, margin + 4, 27);

                doc.setFontSize(9);
                doc.setTextColor(160, 160, 160);
                doc.text(`Généré par l'Espace Professeur — SafeExam`, margin + 4, 35);

                y = 55;

                // ── Summary Box ──
                const highCount = log.filter(a => a.level === 'high').length;
                const medCount = log.filter(a => a.level === 'medium').length;
                const uniqueStudents = [...new Set(log.map(a => a.studentName))].length;

                doc.setFillColor(239, 68, 68, 0.1);
                doc.setDrawColor(239, 68, 68);
                doc.setLineWidth(0.3);
                doc.roundedRect(margin, y, colW, 28, 3, 3, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(239, 68, 68);
                doc.text('RÉSUMÉ DES ANOMALIES', margin + 6, y + 9);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(50, 50, 50);
                doc.text(`Total : ${log.length} anomalie(s)    |    Élevé : ${highCount}    |    Moyen : ${medCount}    |    Étudiants concernés : ${uniqueStudents}`, margin + 6, y + 20);

                y += 36;

                if (log.length === 0) {
                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(12);
                    doc.setTextColor(100, 100, 100);
                    doc.text('✓ Aucune anomalie détectée durant cette session.', margin, y + 10);
                } else {
                    // Group alerts by student
                    const byStudent = {};
                    log.forEach(entry => {
                        const key = entry.studentName;
                        if (!byStudent[key]) byStudent[key] = [];
                        byStudent[key].push(entry);
                    });

                    const pageH = 297;
                    const checkPage = (needed) => {
                        if (y + needed > pageH - 20) {
                            doc.addPage();
                            y = 20;
                        }
                    };

                    Object.entries(byStudent).forEach(([studentName, entries]) => {
                        checkPage(20);

                        // Student header
                        doc.setFillColor(30, 32, 38);
                        doc.roundedRect(margin, y, colW, 11, 2, 2, 'F');
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(10);
                        doc.setTextColor(255, 255, 255);
                        doc.text(`👤  ${studentName}  (${entries.length} anomalie(s))`, margin + 4, y + 7.5);
                        y += 14;

                        entries.forEach(entry => {
                            checkPage(9);
                            const isHigh = entry.level === 'high';
                            doc.setFillColor(isHigh ? 254 : 255, isHigh ? 242 : 251, isHigh ? 242 : 235);
                            doc.setDrawColor(isHigh ? 239 : 245, isHigh ? 68 : 158, isHigh ? 68 : 11);
                            doc.setLineWidth(0.2);
                            doc.rect(margin + 3, y, colW - 3, 8, 'FD');

                            // Risk indicator dot
                            doc.setFillColor(isHigh ? 239 : 245, isHigh ? 68 : 158, isHigh ? 68 : 11);
                            doc.circle(margin + 8, y + 4, 1.5, 'F');

                            doc.setFont('helvetica', 'normal');
                            doc.setFontSize(8.5);
                            doc.setTextColor(40, 40, 40);
                            const label = isHigh ? '[ÉLEVÉ]' : '[MOYEN]';
                            doc.text(`${entry.time}  ${label}  ${entry.message}`, margin + 12, y + 5.5);
                            y += 9;
                        });
                        y += 4;
                    });
                }

                // ── Footer ──
                const totalPages = doc.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(8);
                    doc.setTextColor(180, 180, 180);
                    doc.text(`SafeExam — Rapport confidentiel — Page ${i}/${totalPages}`, margin, 291);
                    doc.setDrawColor(220, 220, 220);
                    doc.setLineWidth(0.2);
                    doc.line(margin, 287, W - margin, 287);
                }

                const filename = `rapport_session_${sessionCode}_${new Date().toISOString().slice(0,10)}.pdf`;
                doc.save(filename);
            },

            // ── Fonctionnalité Visionnage d'écran ──
            viewStudentScreen(studentId, studentName) {
                const modal = document.getElementById('screenModal');
                const title = document.getElementById('screenModalTitle');

                if (modal && title) {
                    title.innerHTML = `📺 Écran en direct de <strong>${studentName}</strong>`;
                    modal.classList.add('open');

                    const screenContainer = document.getElementById('screenVideoContainer');
                    screenContainer.innerHTML = `
                        <img id="studentScreenImage" style="max-width:100%; max-height:100%; object-fit:contain; z-index:10; display:none;" src="" alt="En attente de l'écran..." />
                        <div id="screenLoading" style="position:absolute; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:rgba(255,255,255,0.5);">
                            <div class="spin-ring" style="width:40px; height:40px; border-width:3px; margin-bottom:15px;"></div>
                            <p>Connexion au flux vidéo de ${studentId} en cours...</p>
                        </div>
                    `;

                    // L'ID de l'étudiant actuellement surveillé
                    ProfData.watchingStudentId = studentId;

                    if (this.socket) {
                        // 1. Demander au backend (et à l'étudiant) de commencer à envoyer le flux d'écran
                        this.socket.emit('request-screen-start', { studentId: studentId });

                        // 2. Écouter la réception des images "capture" du flux (Base64)
                        this.socket.off('student-screen-frame'); // On supprime d'anciens écouteurs
                        this.socket.on('student-screen-frame', (data) => {
                            if (data.studentId === ProfData.watchingStudentId || data.studentId === studentId) {
                                const loading = document.getElementById('screenLoading');
                                if (loading) loading.style.display = 'none';

                                const img = document.getElementById('studentScreenImage');
                                if (img && data.imageBase64) {
                                    img.src = data.imageBase64;
                                    img.style.display = 'block'; // Fait apparaitre la vidéo
                                }
                            }
                        });
                    }
                }
            },

            closeScreenModal() {
                const modal = document.getElementById('screenModal');
                if (modal) {
                    modal.classList.remove('open');
                    document.getElementById('screenVideoContainer').innerHTML = ''; // Arrêter l'affichage

                    if (this.socket && ProfData.watchingStudentId) {
                        // On indique qu'on arrête de regarder cet écran
                        this.socket.emit('request-screen-stop', { studentId: ProfData.watchingStudentId });
                    }
                    ProfData.watchingStudentId = null;
                }
            },

            // ── Monitoring des processus étudiants ────────────────────────────
            _monitoringStudentId: null,
            _monitorAlerts: [],

            // Catégories de risque (liste noire)
            _riskyProcesses: {
                HIGH: ['discord', 'telegram', 'whatsapp', 'teamviewer', 'anydesk', 'vnc', 'rdp', 'mstsc', 'chrome', 'firefox', 'msedge', 'opera', 'brave', 'vivaldi', 'slack', 'zoom', 'teams', 'skype', 'obs', 'wireshark'],
                MEDIUM: ['powershell', 'cmd', 'windowsterminal', 'wt', 'python', 'node', 'code', 'devenv', 'idea', 'pycharm', 'eclipse', 'notepad++', 'sublime_text', 'atom'],
                LOW: []
            },

            openMonitorModal(studentId, studentName) {
                this._monitoringStudentId = studentId;
                this._monitorAlerts = [];
                document.getElementById('monitorStudentName').textContent = `🔍 Surveillance : ${studentName}`;
                document.getElementById('monitorStatusBar').textContent = 'En attente des données...';
                document.getElementById('monitorActiveWindow').textContent = '—';
                document.getElementById('monitorFocusCount').textContent = '0';
                document.getElementById('monitorProcessCount').textContent = '0';
                document.getElementById('monitorLastUpdate').textContent = '—';
                document.getElementById('monitorProcessTable').innerHTML = '<div style="text-align:center; padding:40px; color:rgba(255,255,255,.2);">En attente des données de surveillance...</div>';
                document.getElementById('monitorAlertList').innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,.2); font-size:11px;">Aucune alerte</div>';
                const lockBtn = document.getElementById('monitorLockBtn');
                const unlockBtn = document.getElementById('monitorUnlockBtn');
                if (lockBtn) lockBtn.style.display = 'block';
                if (unlockBtn) unlockBtn.style.display = 'none';
                document.getElementById('monitorModal').classList.add('open');

                // Listen for monitoring updates from this student
                if (this.socket) {
                    this.socket.off('student-monitoring-update');
                    this.socket.on('student-monitoring-update', (data) => {
                        if (data.studentId !== this._monitoringStudentId) return;
                        this._renderMonitorData(data);
                    });
                }
            },

            closeMonitorModal() {
                document.getElementById('monitorModal').classList.remove('open');
                this._monitoringStudentId = null;
                if (this.socket) this.socket.off('student-monitoring-update');
            },

            lockdownStudent() {
                if (!this._monitoringStudentId) return;
                if (!confirm("Voulez-vous vraiment verrouiller l'écran de cet étudiant ?")) return;
                
                if (this.socket) {
                    this.socket.emit('lockdown-student', { studentId: this._monitoringStudentId });
                    const lockBtn = document.getElementById('monitorLockBtn');
                    const unlockBtn = document.getElementById('monitorUnlockBtn');
                    if (lockBtn) lockBtn.style.display = 'none';
                    if (unlockBtn) unlockBtn.style.display = 'block';
                }
            },

            // ── Message Privé ──
            _privateMsgTargetId: null,

            openMessageModal(studentId, studentName) {
                this._privateMsgTargetId = studentId;
                document.getElementById('privateMsgTarget').textContent = `→ ${studentName}`;
                document.getElementById('privateMsgInput').value = '';
                document.getElementById('privateMsgStatus').textContent = '';
                document.getElementById('privateMsgSendBtn').disabled = false;
                document.getElementById('privateMsgSendBtn').textContent = '📤 Envoyer';
                document.getElementById('privateMsgModal').classList.add('open');
                setTimeout(() => document.getElementById('privateMsgInput').focus(), 100);
            },

            closeMessageModal() {
                document.getElementById('privateMsgModal').classList.remove('open');
                this._privateMsgTargetId = null;
            },

            sendPrivateMessage() {
                const msg = (document.getElementById('privateMsgInput').value || '').trim();
                if (!msg) {
                    document.getElementById('privateMsgInput').focus();
                    return;
                }
                if (!this._privateMsgTargetId) return;
                if (!this.socket) {
                    document.getElementById('privateMsgStatus').textContent = '⚠️ Non connecté au serveur';
                    return;
                }

                this.socket.emit('send-private-message', {
                    studentId: this._privateMsgTargetId,
                    message: msg
                });

                const btn = document.getElementById('privateMsgSendBtn');
                const status = document.getElementById('privateMsgStatus');
                btn.disabled = true;
                btn.textContent = '✅ Envoyé !';
                status.textContent = 'Message transmis à l\'étudiant.';
                status.style.color = '#10b981';

                setTimeout(() => this.closeMessageModal(), 1500);
            },

            unlockStudent() {
                if (!this._monitoringStudentId) return;
                if (!confirm("Voulez-vous déverrouiller l'écran de cet étudiant ?")) return;
                
                if (this.socket) {
                    this.socket.emit('unlock-student', { studentId: this._monitoringStudentId });
                    const lockBtn = document.getElementById('monitorLockBtn');
                    const unlockBtn = document.getElementById('monitorUnlockBtn');
                    if (lockBtn) lockBtn.style.display = 'block';
                    if (unlockBtn) unlockBtn.style.display = 'none';
                }
            },

            _getRisk(p) {
                if (!p) return 'OK';
                const name = (p.Name || '').toLowerCase();
                
                // 1. Récupérer la liste des applications interdites (Blacklist)
                // Note: Bien que le champ s'appelle 'allowedApps' dans la DB, il est utilisé ici comme Blacklist
                const blacklist = (ProfData.currentSessionDetails && ProfData.currentSessionDetails.allowedApps) || [];
                const activeBlacklist = blacklist.filter(a => a.trim() !== '');
                
                // 2. Logique de Blacklist Pure
                // Par défaut, TOUT est normal (OK / Vert).
                // On ne met en rouge (HIGH) QUE si l'application est dans votre liste interdite.
                if (activeBlacklist.length > 0) {
                    if (activeBlacklist.some(app => name.includes(app.toLowerCase().trim()))) {
                        return 'HIGH';
                    }
                }

                return 'OK';
            },

            _renderMonitorData(data) {
                const now = new Date().toLocaleTimeString();
                document.getElementById('monitorActiveWindow').textContent = data.activeWindow || '—';
                document.getElementById('monitorFocusCount').textContent = data.focusChanges || 0;
                document.getElementById('monitorLastUpdate').textContent = now;
                document.getElementById('monitorStatusBar').textContent = `Dernière mise à jour : ${now}`;

                const procs = data.processes || [];
                document.getElementById('monitorProcessCount').textContent = procs.length;

                // Déterminer le niveau de risque global
                let globalRisk = 'OK';
                const newAlerts = data.alerts || [];

                // Filtrer pour ne garder que ce qui est intéressant à surveiller
                const visibleProcs = procs.filter(p => {
                    const risk = this._getRisk(p);
                    // On affiche les risques, mais aussi les applications classiques (avec titre) pour le debug
                    return risk !== 'OK' || (p.WindowTitle && p.WindowTitle.trim() !== '');
                }).slice(0, 100);

                let tableHtml = visibleProcs.map(p => {
                    const risk = this._getRisk(p);
                    if (risk === 'HIGH') globalRisk = 'HIGH';
                    else if (risk === 'MEDIUM' && globalRisk !== 'HIGH') globalRisk = 'MEDIUM';

                    const riskStyle = risk === 'HIGH' ? 'color:#ef4444; background:rgba(239,68,68,0.1);' : risk === 'MEDIUM' ? 'color:#f59e0b; background:rgba(245,158,11,0.08);' : '';
                    const riskLabel = risk === 'HIGH' ? '🔴 ÉLEVÉ' : risk === 'MEDIUM' ? '🟡 MOYEN' : '🟢 OK';
                    const rowBg = risk !== 'OK' ? riskStyle : '';

                    // Add alert if high risk
                    if (risk === 'HIGH') {
                        const alertMsg = `Application suspecte : ${p.Name}`;
                        const fullMsg = `[${now}] ${alertMsg}`;
                        if (!this._monitorAlerts.includes(fullMsg)) {
                            this._monitorAlerts.unshift(fullMsg);
                            newAlerts.push(fullMsg);
                            // ── Propager vers le panneau global d'alertes ──
                            const studentName = document.getElementById('monitorStudentName')?.textContent?.replace('🔍 Surveillance : ', '') || 'Étudiant';
                            this.addGlobalAlert(studentName, this._monitoringStudentId, alertMsg, 'high');
                        }
                    } else if (risk === 'MEDIUM') {
                        const alertMsg = `Application à risque moyen : ${p.Name}`;
                        const fullMsg = `[${now}] ${alertMsg}`;
                        if (!this._monitorAlerts.includes(fullMsg)) {
                            this._monitorAlerts.unshift(fullMsg);
                            // ── Propager vers le panneau global ──
                            const studentName = document.getElementById('monitorStudentName')?.textContent?.replace('🔍 Surveillance : ', '') || 'Étudiant';
                            this.addGlobalAlert(studentName, this._monitoringStudentId, alertMsg, 'medium');
                        }
                    }

                    return `<div style="display:grid; grid-template-columns:2fr 60px 70px 2fr 90px; padding:5px 12px; border-bottom:1px solid rgba(255,255,255,.03); ${rowBg} font-size:11px;">
                        <span style="color:#e5e7eb; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.Name || '—'}</span>
                        <span style="color:rgba(255,255,255,.4);">${p.Id || '—'}</span>
                        <span style="color:rgba(255,255,255,.5);">${p.Memory || 0} MB</span>
                        <span style="color:rgba(255,255,255,.3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10px;">${p.WindowTitle || ''}</span>
                        <span style="font-weight:700; font-size:10px;">${riskLabel}</span>
                    </div>`;
                }).join('');

                document.getElementById('monitorProcessTable').innerHTML = tableHtml || '<div style="padding:20px; color:rgba(255,255,255,.2); text-align:center;">Aucun processus visible</div>';

                // Update risk badge in monitor modal
                const badge = document.getElementById('monitorRiskBadge');
                if (globalRisk === 'HIGH') {
                    badge.style.cssText = 'font-size:11px; padding:3px 10px; border-radius:20px; background:rgba(239,68,68,0.2); color:#ef4444; border:1px solid rgba(239,68,68,0.4); font-weight:700; animation: pulse 1s infinite;';
                    badge.textContent = '🔴 RISQUE ÉLEVÉ';
                } else if (globalRisk === 'MEDIUM') {
                    badge.style.cssText = 'font-size:11px; padding:3px 10px; border-radius:20px; background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); font-weight:700;';
                    badge.textContent = '🟡 RISQUE MOYEN';
                } else {
                    badge.style.cssText = 'font-size:11px; padding:3px 10px; border-radius:20px; background:rgba(34,197,94,0.15); color:#22c55e; border:1px solid rgba(34,197,94,0.3); font-weight:700;';
                    badge.textContent = '✅ FAIBLE';
                }

                // ── Mettre à jour le risque dot dans la liste principale (si le modal participants est ouvert) ──
                if (this._monitoringStudentId) {
                    const newRisk = globalRisk === 'HIGH' ? 'high' : globalRisk === 'MEDIUM' ? 'medium' : 'low';
                    const sid = this._monitoringStudentId.toString();
                    this._studentRiskMap[sid] = newRisk;
                    const studentEl = document.getElementById(`pm-student-${sid}`);
                    if (studentEl) {
                        const dot = studentEl.querySelector('.pm-risk-dot');
                        if (dot) dot.className = `pm-risk-dot ${newRisk}`;
                    }
                }

                // Update alerts in monitor modal
                if (this._monitorAlerts.length > 0) {
                    document.getElementById('monitorAlertList').innerHTML = this._monitorAlerts.slice(0, 30).map(a =>
                        `<div style="padding:6px 8px; margin-bottom:4px; background:rgba(239,68,68,0.1); border-left:3px solid #ef4444; border-radius:4px; font-size:10px; color:#fca5a5;">${a}</div>`
                    ).join('');
                }
            },
        };


        document.addEventListener('DOMContentLoaded', () => ProfVM.init());
        document.getElementById('createModal').addEventListener('click', function (e) {
            if (e.target === this) ProfVM.closeCreateModal();
        });
        document.getElementById('workModal').addEventListener('click', function (e) {
            if (e.target === this) ProfVM.closeWorkModal();
        });
