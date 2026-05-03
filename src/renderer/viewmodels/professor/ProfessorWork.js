/**
 * ViewModel : ProfessorVM (Work Explorer & Submissions)
 */
Object.assign(ProfVM, {
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
                            <div class="work-file-meta" style="margin-top: 2px; font-size:10px; opacity:0.5;">
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
    }
});
