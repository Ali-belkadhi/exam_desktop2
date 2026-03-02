/**
 * ViewModel : DesktopVM
 *
 * Charge les données de l'utilisateur depuis sessionStorage
 * (cohérent avec LoginVM qui y écrit toutes les données de session).
 */
class DesktopVM {
    constructor(updateCallback) {
        this.updateView = updateCallback;
        this.ideOpen = false;

        // ── Reconstruction de l'objet user depuis sessionStorage ──────────
        // LoginVM écrit dans sessionStorage, pas dans localStorage.
        // On reconstitue un objet cohérent à partir des clés disponibles.
        try {
            const role = sessionStorage.getItem('role') || '';

            if (role === 'student') {
                this.user = {
                    role,
                    _id: sessionStorage.getItem('studentId'),
                    nom: sessionStorage.getItem('studentNom'),
                    prenom: sessionStorage.getItem('studentPrenom'),
                    email: sessionStorage.getItem('studentEmail'),
                    studentCardNumber: sessionStorage.getItem('studentCardNumber'),
                    cin: sessionStorage.getItem('studentCin'),
                    contact: sessionStorage.getItem('studentContact'),
                };
                // classe peut être un objet JSON
                const classeRaw = sessionStorage.getItem('studentClasse');
                if (classeRaw) {
                    try { this.user.classe = JSON.parse(classeRaw); } catch (_) { }
                }
            } else if (['professor', 'admin', 'super_admin'].includes(role)) {
                this.user = {
                    role,
                    _id: sessionStorage.getItem('userId'),
                    nom: sessionStorage.getItem('userNom'),
                    prenom: sessionStorage.getItem('userPrenom'),
                    email: sessionStorage.getItem('userEmail'),
                    contact: sessionStorage.getItem('userContact'),
                    imageUrl: sessionStorage.getItem('userImageUrl'),
                    accessToken: sessionStorage.getItem('accessToken'),
                };
            } else {
                this.user = null;
            }
        } catch (e) {
            console.error('[DesktopVM] Erreur lecture sessionStorage:', e);
            this.user = null;
        }
    }

    toggleIde() {
        this.ideOpen = !this.ideOpen;
        this.updateView();
    }

    async launchExternalIDE() {
        if (!window.electronAPI) return;
        try {
            await window.electronAPI.launchExternalIDE('projet-1');
            alert('IDE externe lancé !');
        } catch (e) {
            console.error('[DesktopVM] Erreur IPC:', e);
        }
    }

    logout() {
        // Effacer toute la session (sessionStorage ET localStorage par sécurité)
        sessionStorage.clear();
        localStorage.removeItem('user');
        window.location.href = './login.html';
    }
}

