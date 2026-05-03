/**
 * ViewModel : LoginVM
 * Logique de connexion unifiée avec routage selon le rôle.
 *
 * Règle de détection :
 *   - Si l'identifiant contient un "@"  → tentative login PROFESSEUR (email + password)
 *   - Sinon                              → tentative login ÉTUDIANT  (studentCardNumber + CIN)
 *
 * Backend : https://safe-exam-db-ll3f.onrender.com
 *
 * Flux PROFESSEUR :
 *   POST /auth/login { email, password }
 *   └─ si role === "professor" → professor.html
 *   └─ si role === "admin" / "super_admin" → professor.html (interface admin)
 *   └─ sinon erreur (rôle non autorisé pour cette app)
 *
 * Flux ÉTUDIANT :
 *   1. Login admin-service → token JWT
 *   2. GET /students/by-card/:studentCardNumber  (avec le token)
 *   3. Comparer student.cin === password saisi
 *   └─ si OK → session.html
 */
class LoginVM {
    constructor(updateViewCallback) {
        this.email = '';   // identifiant : email prof OU studentCardNumber
        this.password = '';   // mot de passe : password prof OU CIN étudiant
        this.isLoading = false;
        this.errorMessage = '';
        this.updateView = updateViewCallback;

        // ── Configuration backend (source : config.js) ────────────────────
        this.API_BASE        = window.APP_CONFIG.API_BASE;
        this.SERVICE_EMAIL   = window.APP_CONFIG.SERVICE_EMAIL;
        this.SERVICE_PASSWORD= window.APP_CONFIG.SERVICE_PASSWORD;
    }

    setEmail(val) { this.email = val.trim(); }
    setPassword(val) { this.password = val; }

    async login() {
        // ── Validation ─────────────────────────────────────────────────────
        if (!this.email) {
            this.errorMessage = 'Veuillez saisir votre identifiant.';
            this.updateView();
            return;
        }
        if (!this.password) {
            this.errorMessage = 'Veuillez saisir votre mot de passe.';
            this.updateView();
            return;
        }

        this.isLoading = true;
        this.errorMessage = '';
        this.updateView();

        try {
            // Détection du type de login selon format de l'identifiant
            if (this.email.includes('@')) {
                await this._loginProfesseur();
            } else {
                await this._loginEtudiant();
            }
        } catch (err) {
            console.error('[LoginVM] Erreur inattendue:', err);
            this.errorMessage = 'Une erreur est survenue. Vérifiez votre connexion.';
            this.isLoading = false;
            this.updateView();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Flux PROFESSEUR  –  email + password → /auth/login
    // ═══════════════════════════════════════════════════════════════════════
    async _loginProfesseur() {
        const resp = await fetch(`${this.API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: this.email, password: this.password }),
        });

        const data = await resp.json();

        // Vérifier statut
        if (!resp.ok || data.status === 'error') {
            this.errorMessage = 'Email ou mot de passe incorrect.';
            this.isLoading = false;
            this.updateView();
            return;
        }

        const user = data.user;
        const role = (user?.role || '').toLowerCase();

        // Seuls les professeurs / admins ont accès à cette application desktop
        const ALLOWED_ROLES = ['professor', 'admin', 'super_admin'];
        if (!ALLOWED_ROLES.includes(role)) {
            this.errorMessage = 'Votre compte n\'est pas autorisé à utiliser cette application.';
            this.isLoading = false;
            this.updateView();
            return;
        }

        // ── Succès : stockage des données de session ───────────────────
        sessionStorage.setItem('role', role);
        sessionStorage.setItem('accessToken', data.access_token);
        sessionStorage.setItem('userId', user._id);
        sessionStorage.setItem('userNom', user.nom || '');
        sessionStorage.setItem('userPrenom', user.prenom || '');
        sessionStorage.setItem('userEmail', user.email || '');
        if (user.contact) sessionStorage.setItem('userContact', user.contact);
        if (user.imageUrl) sessionStorage.setItem('userImageUrl', user.imageUrl);

        // Redirection
        window.location.href = './professor.html';
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Flux ÉTUDIANT  –  studentCardNumber + CIN (en 3 étapes)
    // ═══════════════════════════════════════════════════════════════════════
    async _loginEtudiant() {
        // Étape 1 : Obtenir un token JWT via le compte service admin
        const serviceToken = await this._getServiceToken();
        if (!serviceToken) {
            this.errorMessage = 'Impossible de joindre le serveur. Vérifiez votre connexion.';
            this.isLoading = false;
            this.updateView();
            return;
        }

        // Étape 2 : Chercher l'étudiant par son numéro de carte
        const student = await this._findStudentByCard(this.email, serviceToken);
        if (!student) {
            this.errorMessage = 'Numéro de carte étudiant introuvable. Vérifiez votre identifiant.';
            this.isLoading = false;
            this.updateView();
            return;
        }

        // Étape 3 : Vérifier le CIN (mot de passe)
        const cinSaisi = this.password.trim();
        const cinBase = (student.cin || '').trim();

        if (cinSaisi !== cinBase) {
            this.errorMessage = 'CIN incorrect. Veuillez réessayer.';
            this.isLoading = false;
            this.updateView();
            return;
        }

        // ── Succès : stockage et redirection ──────────────────────────
        sessionStorage.setItem('role', 'student');
        sessionStorage.setItem('accessToken', serviceToken); // Important pour interroger practical-tests
        sessionStorage.setItem('studentId', student._id);
        sessionStorage.setItem('studentCardNumber', student.studentCardNumber);
        sessionStorage.setItem('studentNom', student.nom || '');
        sessionStorage.setItem('studentPrenom', student.prenom || '');
        sessionStorage.setItem('studentCin', student.cin || '');
        if (student.email) sessionStorage.setItem('studentEmail', student.email);
        if (student.contact) sessionStorage.setItem('studentContact', student.contact);
        if (student.classe) sessionStorage.setItem('studentClasse', JSON.stringify(student.classe));

        window.location.href = './session.html';
    }

    // ── Helpers privés ─────────────────────────────────────────────────────

    /** Obtient un token JWT via le compte service (super-admin) */
    async _getServiceToken() {
        try {
            const resp = await fetch(`${this.API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.SERVICE_EMAIL,
                    password: this.SERVICE_PASSWORD,
                }),
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.access_token || null;
        } catch (e) {
            console.error('[LoginVM] _getServiceToken error:', e);
            return null;
        }
    }

    /** Cherche un étudiant par studentCardNumber (nécessite token JWT) */
    async _findStudentByCard(cardNumber, token) {
        try {
            const resp = await fetch(
                `${this.API_BASE}/students/by-card/${encodeURIComponent(cardNumber)}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                }
            );
            if (resp.status === 404 || !resp.ok) return null;
            return await resp.json();
        } catch (e) {
            console.error('[LoginVM] _findStudentByCard error:', e);
            return null;
        }
    }
}
