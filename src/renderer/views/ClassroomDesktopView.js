// View Logic pour le Desktop (Classroom)
const UI = {
    launcherOpen: false,

    toggleLauncher() {
        this.launcherOpen = !this.launcherOpen;
        const launcher = document.getElementById('launcher');
        if (this.launcherOpen) {
            launcher.classList.add('open');
        } else {
            launcher.classList.remove('open');
        }
    },

    openWindow(id) {
        const win = document.getElementById(id);
        win.classList.remove('minimized');
        win.classList.add('active');
        this.bringToFront(win);
        if (id === 'win-pdf') document.getElementById('tb-pdf').classList.add('open');
    },

    closeWindow(id) {
        const win = document.getElementById(id);
        win.classList.remove('active');
        win.classList.remove('maximized'); // Réinitialiser l'état agrandi
        win.classList.add('minimized');
        if (id === 'win-pdf') document.getElementById('tb-pdf').classList.remove('open');
    },

    minimizeWindow(id) {
        const win = document.getElementById(id);
        win.classList.add('minimized');
        // On ne retire pas forcément maximized ici pour pouvoir restaurer l'état
    },

    toggleMaximizeWindow(id) {
        const win = document.getElementById(id);
        win.classList.toggle('maximized');
        this.bringToFront(win);
    },

    bringToFront(el) {
        document.querySelectorAll('.os-window').forEach(w => w.style.zIndex = 100);
        el.style.zIndex = 101;
    },

    updateClock() {
        const now = new Date();
        const clockEl = document.getElementById('clockClock');
        if (clockEl) {
            clockEl.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
    }
};
window.UI = UI;

// Window Drag Logic
let draggingElement = null;
let offset = { x: 0, y: 0 };

document.addEventListener('mousedown', (e) => {
    // Si on clique en dehors du launcher, ça le ferme
    if (UI.launcherOpen && !e.target.closest('#launcher') && !e.target.closest('.start-btn')) {
        UI.toggleLauncher();
    }

    if (e.target.closest('.window-header') && !e.target.closest('.win-btn')) {
        draggingElement = e.target.closest('.os-window');
        UI.bringToFront(draggingElement);
        offset.x = e.clientX - draggingElement.offsetLeft;
        offset.y = e.clientY - draggingElement.offsetTop;
    } else if (e.target.closest('.os-window')) {
        UI.bringToFront(e.target.closest('.os-window'));
    }
});

document.addEventListener('mouseup', () => draggingElement = null);
document.addEventListener('mousemove', (e) => {
    if (draggingElement) {
        draggingElement.style.left = `${e.clientX - offset.x}px`;
        draggingElement.style.top = `${e.clientY - offset.y}px`;
    }
});

// App Actions Logic (VS Code)
const AppActions = {
    async requestVSCodeLaunch() {
        const modal = document.getElementById('vscodeModal');
        const title = document.getElementById('vsModalTitle');
        const msg = document.getElementById('vsModalMessage');
        const actions = document.getElementById('vsModalActions');

        modal.style.display = 'flex';
        title.innerHTML = '⏳ Lancement de VS Code...';
        msg.textContent = "Contact de l'OS pour ouvrir l'environnement de développement...";
        actions.innerHTML = '';

        try {
            if (window.electronAPI && window.electronAPI.launchVSCode) {
                // On récupère le chemin potentiellement sauvegardé précédemment
                const savedPath = localStorage.getItem('vscodeUserPath');

                const response = await window.electronAPI.launchVSCode({
                    projectPath: 'C:\\Projects\\Starter', // Chemin factice pour la démo
                    userSavedPath: savedPath
                });

                if (response.success) {
                    title.innerHTML = '✅ Lancé';
                    msg.textContent = response.message;
                    actions.innerHTML = `<button class="primary" onclick="document.getElementById('vscodeModal').style.display='none'">Fermer</button>`;
                } else {
                    title.innerHTML = '❌ Éditeur introuvable';
                    msg.textContent = response.error;

                    if (response.errorCode === 'NO_VSCODE') {
                        // Injection du bouton "Parcourir" qui déclenchera la boite de dialogue native
                        actions.innerHTML = `
                            <button class="secondary" onclick="document.getElementById('vscodeModal').style.display='none'">Annuler</button>
                            <button class="primary" onclick="AppActions.selectManualVSCodePath()">Parcourir l'OS...</button>
                        `;
                    } else {
                        actions.innerHTML = `<button class="secondary" onclick="document.getElementById('vscodeModal').style.display='none'">Fermer</button>`;
                    }
                }
            } else {
                throw new Error("API non disponible");
            }
        } catch (e) {
            title.innerHTML = '❌ Erreur Système';
            msg.textContent = e.message;
            actions.innerHTML = `<button class="secondary" onclick="document.getElementById('vscodeModal').style.display='none'">Fermer</button>`;
        }
    },

    async selectManualVSCodePath() {
        if (!window.electronAPI || !window.electronAPI.selectVSCodeExe) return;

        const response = await window.electronAPI.selectVSCodeExe();
        if (response.success && response.path) {
            // Sauvegarde locale du chemin sélectionné par l'étudiant
            localStorage.setItem('vscodeUserPath', response.path);

            // On relance la mécanique maintenant qu'on a le chemin
            this.requestVSCodeLaunch();
        }
    }
};

// Initialisation
setInterval(UI.updateClock, 1000);
