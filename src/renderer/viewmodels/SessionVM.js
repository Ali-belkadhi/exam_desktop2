class SessionVM {
    constructor(updateViewCallback) {
        this.code = '';
        this.isLoading = false;
        this.error = '';
        this.updateView = updateViewCallback;
    }

    setCode(val) { this.code = val; }

    async join() {
        this.isLoading = true;
        this.error = '';
        this.updateView();

        try {
            const api = window.electronAPI;
            if (!api) throw new Error("API non disponible");

            const res = await api.joinSession({ code: this.code });

            if (res.success) {
                // Stocker les infos pour le bureau
                sessionStorage.setItem('activeSessionCode', this.code);
                sessionStorage.setItem('sessionCourse', res.session.title);
                sessionStorage.setItem('sessionProf', res.session.prof);

                // Activer le mode examen (Kiosque Fullscreen)
                await api.setLocked(true);

                // Redirection
                window.location.href = './desktop.html';
            } else {
                this.isLoading = false;
                this.error = res.error || "Échec de connexion";
                this.updateView();
            }
        } catch (e) {
            console.error(e);
            this.isLoading = false;
            this.error = "Erreur technique : " + (e.message || "Inconnue");
            this.updateView();
        }
    }
}
