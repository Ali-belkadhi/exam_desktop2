# PRINCIPE DE TRAVAIL LOGIQUE - Pim_App_Safe

## 1) Perimetre reel du projet

Ce document decrit le projet **Pim_App_Safe** (application desktop Electron) present dans:
`C:\Users\Mega-Pc\Desktop\PIM_Desktop_2\Pim_App_Safe`

Le workspace contient aussi un backend separe (`safe_exam_DB`), mais ce dossier n'est pas package avec l'app desktop. L'app desktop consomme une API distante configuree dans `src/renderer/config.js`.

### Dossiers generes/exterieurs (non documentes fichier par fichier)
- `node_modules/`: dependances npm installees automatiquement.
- `dist/`: artefacts de build Electron (sortie d'installation).

## 2) Vue technique globale

### Technologies
- **Electron 29**: runtime desktop (main process + renderer process + preload).
- **JavaScript vanilla (ES6+)**: logique UI et metier.
- **HTML/CSS**: ecrans login, session, professeur, desktop.
- **Monaco Editor**: simulation d'editeur code (via `VsCodeView.js`, aujourd'hui sans page `vscode.html`).
- **Socket.IO client**: temps reel professeur/etudiant.
- **Fetch API**: appels REST vers backend.
- **jsPDF** (CDN): export PDF des alertes en monitoring professeur.

### Architecture
- **Main process**: `src/main/main.js` + `src/main/ipcHandlers.js`
- **Preload bridge**: `src/preload/preload.js`
- **Renderer (UI)**: `src/renderer/*` organise en style MVVM
  - `models/`
  - `viewmodels/`
  - `views/`
  - pages HTML

### Frontend / Backend / Base de donnees
- **Frontend**: Electron renderer (ce repo).
- **Backend**: API REST + WebSocket (NestJS, hors dossier `Pim_App_Safe`).
- **Base de donnees**: MongoDB (deduction par IDs ObjectId, endpoints practical-tests, classes, students, etc.).

### Flux de donnees principal
1. Login utilisateur (`login.html` + `LoginVM.js`).
2. Si professeur: acces dashboard professeur (`professor.html`, modules `Professor*`).
3. Si etudiant: saisie code session (`session.html` + `SessionVM.join()`).
4. Ouverture desktop (`desktop.html`):
   - heartbeat periodique vers backend
   - synchronisation etat session (active/pause/fin)
   - attente d'approbation professeur
   - reception des commandes WebSocket (lock/unlock, message prive, partage ecran)
5. Monitoring professeur:
   - collecte processus et ecran cote etudiant via IPC Electron
   - emission WebSocket vers professeur
   - actions professeur (pause, fin, prolonger, accepter/refuser etudiant, verrouiller)

## 3) Arborescence logique des dossiers

- **Racine**: config du projet npm/Electron + CI + docs.
- **scripts/**: scripts qualite (tests et verification architecture).
- **src/main/**: logique privilegiee Electron (fenetre, OS, IPC, code-server, kiosk).
- **src/preload/**: API securisee exposee au renderer.
- **src/renderer/**: UI complete (HTML/CSS/JS, VM, modeles, vues).
  - **assets/css/**: design system et styles ecrans.
  - **assets/images/**: images interface.
  - **models/**: classes de donnees.
  - **viewmodels/**: logique metier et orchestration API.
  - **views/**: logique DOM locale.

## 4) Fichier par fichier (role, contenu, liens, code important)

## 4.1 Racine du projet

### `.eslintrc.json`
- **Role**: regles lint JS.
- **Pourquoi**: garantir un style code minimum et eviter erreurs classiques.
- **Contient**: env, parser ES2021, regles (`eqeqeq`, `no-var`, etc.), globals UI (`LoginVM`, `SessionVM`, etc.).
- **Liens**: utilise par `npm run lint:js`.
- **Code important**: whitelist des globals pour eviter faux positifs dans architecture script-tag globale.

### `.gitignore`
- **Role**: exclure fichiers temporaires/build/dependances.
- **Pourquoi**: garder le depot propre.
- **Contient**: `node_modules`, `dist`, logs, caches lint, env files.
- **Liens**: impacte git et CI.

### `.stylelintrc.json`
- **Role**: regles lint CSS.
- **Pourquoi**: coherence des styles.
- **Contient**: extension `stylelint-config-standard` + overrides.
- **Liens**: `npm run lint:css`.

### `Jenkinsfile`
- **Role**: pipeline CI.
- **Pourquoi**: automatiser install, checks structure, lint, tests, audit, build, archive.
- **Contient**: stages Checkout/Install/Structure/Lint/Test/SonarQube/Security/Build/Archive.
- **Liens**: appelle `scripts/check-structure.js` et `scripts/run-tests.js`.
- **Code important**:
  - parametre `SKIP_BUILD` pour ignorer build Electron.
  - scans SonarQube sur `src`.

### `package.json`
- **Role**: manifesto npm + config electron-builder.
- **Pourquoi**: scripts, dependances, metadonnees app.
- **Contient**:
  - scripts: `start`, `lint`, `test`, `build`, etc.
  - deps: `monaco-editor`, `socket.io-client`
  - devDeps: `electron`, `electron-builder`, `eslint`, `stylelint`
  - section `build` (appId/productName/files)
- **Liens**: point d'entree `src/main/main.js`.

### `package-lock.json`
- **Role**: verrouillage exact versions npm.
- **Pourquoi**: reproductibilite installation.
- **Contient**: graphe complet de dependances.

### `README.md`
- **Role**: doc rapide du projet.
- **Pourquoi**: onboarding.
- **Contient**: lancement, architecture de principe, pages.
- **Liens**: parfois en decalage avec code reel (ex. references historiques).

### `PRINCIPE_TRAVAIL_LOGIQUE.md`
- **Role**: documentation technique detaillee.
- **Pourquoi**: expliquer logique complete, architecture, flux.
- **Contient**: ce document.

## 4.2 Scripts qualite

### `scripts/check-structure.js`
- **Role**: verifier contraintes structurelles MVVM.
- **Pourquoi**: bloquer regressions d'architecture dans CI.
- **Contient**:
  - presence fichiers requis
  - verification `<style>` inline HTML
  - verification scripts inline (strict pour `professor.html`)
  - recherche URL hardcodees dans VMs
- **Liens**: stage Jenkins "Architecture Check", script npm `test:structure`.
- **Code important**:
  - `required[]`: liste attendue.
  - regex `hardcodedUrlPattern`.

### `scripts/run-tests.js`
- **Role**: mini suite de tests unitaires JS sans framework.
- **Pourquoi**: valider modeles et config.
- **Contient**:
  - harness `test/assert/assertEquals`
  - tests APP_CONFIG, Session model, Student model, presence CSS, inline styles.
- **Liens**: script npm `test`.
- **Code important**:
  - simulation d'un pseudo `window` pour executer classes renderer en Node.

## 4.3 Main process Electron

### `src/main/main.js`
- **Role**: entree Electron, creation fenetre, regles de securite, blocage VM.
- **Pourquoi**: centraliser le cycle de vie app.
- **Contient**:
  - `runCommand()` helper shell
  - `isLikelyVirtualMachine()` (Windows/Linux/macOS)
  - `createWindow()` avec preload, contextIsolation, webviewTag
  - `app.whenReady()` + gate anti-VM
- **Liens**:
  - charge `login.html` au demarrage
  - appelle `setupIpcHandlers(ipcMain, mainWindow)`
- **Code important**:
  - detection hyperviseur par commandes systeme.
  - options BrowserWindow pour activer `<webview>`.

### `src/main/ipcHandlers.js`
- **Role**: registre des canaux IPC renderer <-> main.
- **Pourquoi**: exposer actions privilegiees OS de facon controlee.
- **Contient**:
  - gestion `code-server` (start/stop/status, ports, WSL fallback)
  - auth/session mocks (`auth:login`, `session:join`)
  - lancement VS Code externe, selection exe
  - capture ecran via `desktopCapturer`
  - monitoring processus (`monitor:getProcesses`)
  - mode verrouille (kiosk/fullscreen/alwaysOnTop + shields multi-ecran)
- **Liens**:
  - invoque par `window.electronAPI` (preload)
  - alimente events renderer `codeserver:*`
- **Code important**:
  - `startCodeServer()` + strategies native/WSL.
  - `window:setLocked` pour mode examen.
  - script PowerShell embarque pour extraction processus+fenetre active.

## 4.4 Preload

### `src/preload/preload.js`
- **Role**: pont securise `contextBridge`.
- **Pourquoi**: interdire acces direct Node.js depuis renderer, exposer seulement API utiles.
- **Contient**: objet `window.electronAPI`.
- **Liens**:
  - `main.js` reference ce fichier dans `webPreferences.preload`.
  - appels vers canaux IPC definis dans `ipcHandlers.js`.
- **Code important**:
  - API `codeServer.start/stop/status`.
  - API `captureScreen`, `getProcessMonitoring`, `setLocked`.

## 4.5 Renderer - Config

### `src/renderer/config.js`
- **Role**: source unique de configuration runtime (`window.APP_CONFIG`).
- **Pourquoi**: eviter duplication API/constantes dans VMs.
- **Contient**:
  - `API_BASE`, credentials service, roles autorises, timings heartbeat.
  - keepalive Render (ping periodique `/auth/config-test`).
- **Liens**:
  - charge en tete de chaque page HTML.
  - utilise par `LoginVM`, `SessionVM`, modules professeur.
- **Variables importantes**:
  - `API_BASE`, `HEARTBEAT_INTERVAL_MS`, `HEARTBEAT_STALE_MS`.

## 4.6 Renderer - Pages HTML

### `src/renderer/login.html`
- **Role**: ecran d'authentification unifie professeur/etudiant.
- **Pourquoi**: point d'entree UX.
- **Contient**:
  - formulaire identifiant/mot de passe
  - scripts inline UI (badge role, toggle password, spinner)
  - initialisation `LoginVM`
- **Liens**:
  - charge `models/User.js`, `viewmodels/LoginVM.js`, `config.js`.
- **Logique importante**:
  - detection mode via `email.includes('@')`.
  - submit -> `vm.login()`.

### `src/renderer/session.html`
- **Role**: saisie du code session etudiant.
- **Pourquoi**: transition avant desktop.
- **Contient**:
  - 6 champs digit + auto-navigation/paste
  - bouton rejoindre active quand 6 chiffres
  - appel `SessionVM.join()`
- **Liens**: charge `viewmodels/SessionVM.js`.
- **Logique importante**:
  - `getCode()`, `updateJoinBtn()`, `vm.setCode(...); vm.join();`

### `src/renderer/professor.html`
- **Role**: dashboard professeur (creation, sessions, monitoring, quiz, travaux).
- **Pourquoi**: poste de controle principal cote enseignant.
- **Contient**:
  - cartes stats/actions
  - modals creation session/details monitoring/work/AI quiz
  - script init minimal `ProfVM.init()`
- **Liens**:
  - charge `socket.io.min.js`, modeles, `ProfessorCore.js`, `ProfessorSessions.js`, `ProfessorMonitoring.js`, `ProfessorWork.js`, `ProfessorQuiz.js`.
- **Code important**:
  - composant details session pilote entierement par `ProfVM` modulaire.

### `src/renderer/desktop.html`
- **Role**: environnement "OS" etudiant pendant session.
- **Pourquoi**: encapsuler ressources d'examen (PDF, navigateur, quiz, notes, calculatrice, upload).
- **Contient**:
  - fenetres draggable/minimize/maximize
  - taskbar + launcher
  - waiting room + overlay pause/lockdown
  - inline script massif de synchronisation session
- **Liens**:
  - charge `SessionVM`, `QuizVM`, `ClassroomDesktopView.js`, `BrowserView.js`.
- **Fonctions importantes**:
  - `_showWaitingRoom()`, `_hideWaitingRoom()`
  - `robustInit()`
  - `tick()` timer/sync heartbeat
  - `uploadWorkZip()`
  - `quitSession()`
  - calc (`calcInput`, `calcResult`, ...)
- **Etapes logiques (resume)**:
  1. Initialiser VM/session/socket.
  2. Si etudiant en attente -> waiting room + polling fallback localStorage.
  3. Demarrer heartbeat (SessionVM) + timer local synchronise server clock.
  4. Ecouter events WebSocket (grant/deny, pause, lock, messages, screen share).
  5. Mettre a jour UI en temps reel et quitter session si fin/timeout.

### `src/renderer/socket.io.min.js`
- **Role**: client Socket.IO minifie local.
- **Pourquoi**: real-time sans CDN pour canal WS principal.
- **Contient**: code vendor minifie.
- **Liens**: utilise dans `desktop.html` et `professor.html`.

## 4.7 Renderer - Assets

### `src/renderer/assets/css/theme.css`
- **Role**: tokens globaux + reset + animations utilitaires.
- **Pourquoi**: base design partagée.
- **Contient**: variables `--primary`, `--bg-*`, `--text-*`, keyframes globales.
- **Liens**: importe en premier dans login/session/professor.

### `src/renderer/assets/css/components.css`
- **Role**: composants UI reutilisables (buttons, modals, badges, rows).
- **Pourquoi**: eviter duplication CSS.
- **Contient**: `.btn*`, `.modal-*`, `.session-row`, etc.
- **Liens**: theme.css requis avant.

### `src/renderer/assets/css/animation_man_boxes.css`
- **Role**: animation visuelle "man between boxes".
- **Pourquoi**: feedback d'etat login/session/loading/prof/student.
- **Contient**: classes `.animation-container`, `.state-prof`, `.state-student`, `.state-loading`.
- **Liens**: utilise dans `login.html` et `session.html`.

### `src/renderer/assets/css/login.css`
- **Role**: styles ecran login.
- **Pourquoi**: UX authentification.
- **Contient**: card glassmorphism, inputs, bouton connexion, logo.
- **Liens**: depend de `theme.css` + `components.css`.

### `src/renderer/assets/css/session.css`
- **Role**: styles ecran code session.
- **Pourquoi**: UX saisie PIN 6 digits.
- **Contient**: layout, inputs digits, bouton join, erreurs.

### `src/renderer/assets/css/professor.css`
- **Role**: styles dashboard professeur (fichier volumineux).
- **Pourquoi**: UI complexe (stats, modals, monitoring, work explorer, quiz editor).
- **Contient**: topbar, cards, modal system, panel monitoring et classes PM.
- **Liens**: travaille avec `Professor*` VMs.

### `src/renderer/assets/css/design-system.css`
- **Role**: tokens OS-like pour desktop etudiant.
- **Pourquoi**: mode bureau clair/sombre, fenetres, taskbar.
- **Contient**: variables desktop (`--bg-desktop`, `--window-*`, etc.) + reset.
- **Liens**: base de `desktop.css`.

### `src/renderer/assets/css/desktop.css`
- **Role**: styles fonctionnels du desktop etudiant.
- **Pourquoi**: fenetres, navigateur, launcher, widgets, upload toast, overlays.
- **Contient**: `.os-window`, `.os-taskbar`, `.browser-*`, `.pause-overlay`, etc.

### `src/renderer/assets/css/eprit3.jpg`
- **Role**: image de fond (dupliquee ailleurs).
- **Pourquoi**: theme visuel login.
- **Contient**: asset image.
- **Liens**: `login.css` pointe `../images/eprit3.jpg` (version images).

### `src/renderer/assets/css/esprit2.png`
- **Role**: logo (copie dans dossier css).
- **Pourquoi**: historique/duplication.
- **Contient**: asset image.

### `src/renderer/assets/images/eprit3.jpg`
- **Role**: fond principal login.
- **Pourquoi**: ressource image utilisee par CSS.

### `src/renderer/assets/images/esprit2.png`
- **Role**: logo affiche sur login.
- **Pourquoi**: branding.

## 4.8 Renderer - Models

### `src/renderer/models/User.js`
- **Role**: classe utilisateur simple.
- **Pourquoi**: formaliser donnees auth.
- **Contient**: `class User` (`id,name,email,role,token`).
- **Liens**: chargee au login/professeur.

### `src/renderer/models/Student.js`
- **Role**: entite etudiant.
- **Pourquoi**: standardiser donnees etudiant backend.
- **Contient**:
  - constructeur tolerant (`_id/id`, `studentCardNumber`, `cin`, etc.)
  - getters `fullName`, `initials`
- **Liens**: utilise cote professeur et tests.

### `src/renderer/models/Session.js`
- **Role**: entite session pratique.
- **Pourquoi**: encapsuler statut session (`isActive/isPaused/...`).
- **Contient**:
  - mapping champs backend
  - getter `displayTitle`
- **Liens**: dashboard professeur + tests.

## 4.9 Renderer - ViewModels (coeur metier)

### `src/renderer/viewmodels/LoginVM.js`
- **Role**: logique login complet.
- **Pourquoi**: separer UI login de la logique backend.
- **Contient**:
  - `login()` route vers `_loginProfesseur()` ou `_loginEtudiant()`
  - service account (`_getServiceToken`) pour lookup etudiant
  - stockage sessionStorage et redirection
- **Liens**: `login.html`, `config.js`, endpoints `/auth/login`, `/students/by-card/:id`.
- **Variables importantes**:
  - `API_BASE`, `SERVICE_EMAIL`, `SERVICE_PASSWORD`.
- **Etapes login etudiant**:
  1. Auth service admin.
  2. Rechercher etudiant par carte.
  3. Comparer CIN saisi.

### `src/renderer/viewmodels/SessionVM.js`
- **Role**: logique join session + heartbeat + leave.
- **Pourquoi**: synchronisation d'etat et robustesse reseau.
- **Contient**:
  - `join()` (GET code, POST join waiting)
  - `_updateLocalSessionState()` (clock offset, pause, active, ressources)
  - `_sendPing()` avec retries + timeout
  - `startHeartbeat()`
  - `leaveSession()`
- **Liens**: `session.html`, `desktop.html`, backend `practical-tests/*`.
- **Variables importantes**:
  - `heartbeatInterval`, `_heartbeatInFlight`, `API_BASE`.

### `src/renderer/viewmodels/DesktopVM.js`
- **Role**: VM desktop simple (version legacy).
- **Pourquoi**: etat local ouverture IDE + logout.
- **Contient**:
  - reconstruction user depuis sessionStorage
  - `toggleIde()`, `launchExternalIDE()`, `logout()`
- **Liens**: `views/DesktopView.js` (peu utilise dans page desktop actuelle).

### `src/renderer/viewmodels/QuizVM.js`
- **Role**: moteur quiz etudiant dans `desktop.html`.
- **Pourquoi**: rendre questions, collecter reponses, soumettre score.
- **Contient**:
  - `init/sync/render/renderResult`
  - `setAnswer()`, `submitQuiz()`
- **Liens**:
  - lit `sessionQuizData` / `sessionTestType`
  - envoi via socket event `submitQuiz` ou fallback HTTP
- **Logique importante**:
  - support types `QCM`, `QCMImage`, `VraiFaux`, `Libre`, `Classement`.

## 4.10 Renderer - ViewModels professeur (modulaires)

### `src/renderer/viewmodels/professor/ProfessorCore.js`
- **Role**: noyau `ProfVM` + helpers communs + init dashboard.
- **Pourquoi**: point central modules professeur.
- **Contient**:
  - helpers de normalisation (`_resolveStr`, `_toIsoFromDateAndTime`, etc.)
  - store `ProfData`
  - `ProfVM.init()`, `initSocket()`, `checkConnection()`
- **Liens**: charge en premier avant autres modules `Professor*`.

### `src/renderer/viewmodels/professor/ProfessorSessions.js`
- **Role**: gestion sessions professeur (historique, creation, archive, suppression).
- **Pourquoi**: cycle de vie session cote enseignant.
- **Contient**:
  - `fetchRecentSessions()`, `renderSessions()`
  - `openCreateModal()`, `generateCode()`
  - `fetchClasses()`, `fetchExams()`, `selectExam()`
  - `addUrl/removeUrl/renderUrls`
- **Liens**:
  - endpoints `/practical-tests/*`, `/classe`, `/professor/exams`.
- **Variables importantes**:
  - `sharedUrls`, `selectedExam`, `mode`, `quizQuestions`.

### `src/renderer/viewmodels/professor/ProfessorMonitoring.js`
- **Role**: monitoring temps reel et controle etudiants.
- **Pourquoi**: supervision anti-triche.
- **Contient**:
  - details session: `showSessionDetails`, `refreshSessionDetails`
  - controle acces: `grantAccess`, `denyAccess`
  - surveillance ecran/process: `openMonitorModal`, `_renderMonitorData`
  - gestion risques/ignores: `_getRisk`, `toggleIgnoreProcess`
  - actions discipline: `lockdownStudent`, `unlockStudent`
  - messagerie privee: `openMessageModal`, `sendPrivateMessage`
  - actions session: `togglePause`, `endSession`, `extendSession`
  - export: `generatePDFReport`
- **Liens**:
  - socket events (`student-monitoring-update`, `student-waiting`, ...)
  - localStorage fallback pour attente access.

### `src/renderer/viewmodels/professor/ProfessorWork.js`
- **Role**: explorateur et telechargement travaux etudiants.
- **Pourquoi**: recuperer submissions ZIP.
- **Contient**:
  - `openWorkModal`, `fetchWorkFolders`, `renderWorkExplorer`
  - `downloadSubmission()`
- **Liens**: endpoint `/practical-tests/professor/work-folders` + `/submissions/:id/download`.

### `src/renderer/viewmodels/professor/ProfessorQuiz.js`
- **Role**: quiz IA/manuel cote professeur.
- **Pourquoi**: generer et editer questions.
- **Contient**:
  - selection type quiz
  - extraction texte PDF/TXT (`handleAIFiles`)
  - appel Together API (`generateAIQuiz`)
  - edition locale questions (`renderQuizQuestions`)
- **Liens**: injecte questions dans creation session (module sessions).
- **Attention securite**: cle API IA hardcodee dans le fichier (risque eleve).

## 4.11 Renderer - Views

### `src/renderer/views/LoginView.js`
- **Role**: binding DOM <-> `LoginVM` (version legere).
- **Pourquoi**: pattern MVVM (pont Vue/VM).
- **Contient**: listeners form + fonction `render()`.
- **Liens**: redondant partiellement avec script inline de `login.html`.

### `src/renderer/views/SessionView.js`
- **Role**: binding DOM <-> `SessionVM` (version legere).
- **Pourquoi**: facade simple pour page session.
- **Contient**: submit + rendering loading.
- **Liens**: redondant partiellement avec script inline `session.html`.

### `src/renderer/views/DesktopView.js`
- **Role**: ancienne vue desktop simple avec fenetre IDE draggable.
- **Pourquoi**: heritage de prototype.
- **Contient**: drag logic, toggle IDE, logout.
- **Liens**: moins utilise par `desktop.html` actuel.

### `src/renderer/views/ClassroomDesktopView.js`
- **Role**: gestion UI bureau (fenetres, z-index, launcher, clock, actions VS Code externe).
- **Pourquoi**: comportement "OS".
- **Contient**:
  - objet global `UI`
  - drag/drop fenetres
  - `AppActions.requestVSCodeLaunch()`
- **Liens**: appele depuis boutons de `desktop.html`.

### `src/renderer/views/BrowserView.js`
- **Role**: VM de navigateur integre via `<webview>`.
- **Pourquoi**: encapsuler navigation et etat browser.
- **Contient**:
  - `init()`, `navigate()`, `goBack/goForward/reload/stop`
  - securite UI (`updateSecurityIcon`) et erreurs de chargement
- **Liens**: utilise dans fenetre navigateur de `desktop.html`.

### `src/renderer/views/VsCodeView.js`
- **Role**: simulation VS Code + integration Monaco.
- **Pourquoi**: proposer un editeur pedagogique integre.
- **Contient**:
  - `FileStore` (fichiers Java de demo)
  - `VsCodeVM` (tabs, open/close, save, run)
  - init Monaco, commandes clavier, terminal simule
- **Liens**: attendu par une page `vscode.html` absente actuellement.

## 5) Flux metier detaille pas a pas

### A. Authentification
1. L'utilisateur saisit identifiant/mot de passe dans `login.html`.
2. `LoginVM.login()` detecte le mode:
   - email -> professeur
   - sinon -> etudiant
3. Professeur: `POST /auth/login` puis controle role.
4. Etudiant: login compte service -> recherche etudiant -> verification CIN.
5. Donnees session sont stockees en `sessionStorage` puis redirection.

### B. Rejoindre une session etudiante
1. `session.html` construit un code 6 chiffres.
2. `SessionVM.join()` interroge `GET /practical-tests/code/:code`.
3. Si ok: `POST /practical-tests/:testId/join` avec statut `waiting`.
4. Redirection vers `desktop.html`.
5. `desktop.html` affiche waiting room jusqu'a approbation professeur.

### C. Session live (desktop)
1. `robustInit()` cree `sessionVM` et demarre heartbeat.
2. Socket etudiant emet `joinSession-waiting` ou `joinSession`.
3. `tick()` met a jour timer via clock offset serveur.
4. `session-updated` rafraichit PDF/lien/etat pause.
5. En cas fin session (`sessionIsActive=false`): sortie vers login.

### D. Monitoring professeur
1. Prof ouvre details d'une session.
2. Refresh API periodique + events socket.
3. Les etudiants actifs/en attente sont calcules via participants + fallback localStorage.
4. Prof peut:
   - accorder/refuser acces
   - voir flux ecran
   - analyser processus + risques
   - verrouiller/deverrouiller poste
   - envoyer message prive
   - pause/reprendre/terminer/prolonger session

### E. Partage ecran et collecte processus
1. Prof envoie `start-sharing-screen`.
2. Etudiant capture ecran via `electronAPI.captureScreen()` toutes les ~1s.
3. Etudiant envoie frames socket `send-screen-frame`.
4. Process monitoring via IPC `monitor:getProcesses` toutes les ~4s.

## 6) Incoherences techniques actuelles (etat reel)

1. `src/renderer/viewmodels/ProfessorVM.js` est attendu par `check-structure.js` mais n'existe pas.
   - La logique professeur est aujourd'hui decoupee en `ProfessorCore/Sessions/Monitoring/Work/Quiz`.
2. `desktop.html` contient **2 blocs `<style>` inline**, ce qui fait echouer `test` et `test:structure`.
3. `professor.html` contient un script inline d'initialisation (faible mais signale par check structure).
4. `VsCodeView.js` existe, mais la page `src/renderer/vscode.html` est absente.
5. Credentials sensibles dans le frontend:
   - compte service (`config.js`)
   - cle Together API (`ProfessorQuiz.js`)

   // model est " meta-llama/Llama-3-8b-chat-hf"

## 7) Resume architecture par couches

- **Presentation (View)**: `*.html` + styles `assets/css/*`
- **Logique presentation/metier (ViewModel)**: `viewmodels/*`
- **Donnees (Model)**: `models/*`
- **Infrastructure desktop (Electron)**:
  - main: `main.js`, `ipcHandlers.js`
  - preload: `preload.js`
- **Services externes**:
  - API backend (REST)
  - Socket.IO (temps reel)

## 8) Enchainement des fichiers critiques

1. `main.js` lance fenetre + preload.
2. `preload.js` expose `electronAPI`.
3. `login.html` + `LoginVM.js` auth.
4. `session.html` + `SessionVM.js` join.
5. `desktop.html` + `SessionVM.js` + `BrowserView.js` + `ClassroomDesktopView.js` + `QuizVM.js` runtime etudiant.
6. `professor.html` + modules `Professor*` runtime enseignant.

Ce document decrit l'etat reel du code au moment de l'analyse et sert de reference technique pour maintenance/refactor.
