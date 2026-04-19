# 🧠 Principes de Fonctionnement et Logique du Projet (Pim_App_Safe)

Ce document détaille l'architecture logicielle, les flux de données et la logique métier de l'application **Apex Edu**.

---

## 🏗️ 1. Architecture Globale (Electron)

L'application repose sur le framework **Electron**, qui sépare l'exécution en deux types de processus pour garantir la sécurité et la performance.

### **A. Le Processus Principal (Main Process)**
*   **Fichier** : `src/main/main.js`
*   **Rôle** : C'est le chef d'orchestre. Il crée la fenêtre principale (`BrowserWindow`), gère le cycle de vie de l'application et configure les permissions de sécurité (ex: activation du `webviewTag` pour le navigateur intégré).
*   **IPC (Inter-Process Communication)** : Il écoute les messages envoyés par l'interface via `ipcHandlers.js` (ex: redimensionnement, fermeture de fenêtres).

### **B. Le Script de Préchargement (Preload Script)**
*   **Fichier** : `src/preload/preload.js`
*   **Rôle** : Fait office de pont sécurisé. Il expose uniquement les fonctions nécessaires à l'interface (Renderer) via `contextBridge`, évitant ainsi d'exposer directement les API Node.js à la page web pour des raisons de sécurité.

### **C. Le Processus de Rendu (Renderer Process)**
*   **Dossier** : `src/renderer/`
*   **Rôle** : L'interface utilisateur. C'est ici que s'exécute le code HTML/CSS/JS que l'utilisateur voit et manipule.

---

## 🏛️ 2. Structure Logique (Architecture MVVM)

Le code frontend est organisé selon le pattern **MVVM** (Model-View-ViewModel) pour une séparation claire des responsabilités :

1.  **View (HTML)** : Définit la structure visuelle (`professor.html`, `desktop.html`).
2.  **ViewModel (JS)** : Contient la logique d'état et de présentation (`ProfessorVM.js`, `SessionVM.js`). Il manipule le DOM pour refléter les données.
3.  **Model (JS)** : Les objets de données (ex: `User`, `ProfData`).

---

## 🔄 3. Logique des Flux de Travail (Workflows)

### **A. Authentification et Routage**
*   **Entrée** : `login.html`
*   **Mécanisme** : Le `LoginVM` vérifie les identifiants. 
    *   Si prof (`ali123`) → redirection vers `professor.html`.
    *   Si étudiant → redirection vers `session.html`.
*   **Persistance** : Les informations (token, nom, rôle) sont stockées dans le `sessionStorage` du navigateur pour être partagées entre les pages.

### **B. Création de Session (Côté Professeur)**
1.  **Récupération des données** : Le professeur peut charger des examens depuis l'API NestJS (`GET /exams`).
2.  **Configuration** : Le `ProfessorVM` construit un objet (Payload) contenant :
    *   La classe cible.
    *   La durée.
    *   Les outils autorisés (IDEs, URLs).
3.  **Appel API** : Envoi au backend via `POST /practical-tests`. Le serveur retourne un code de session unique à 6 chiffres.

### **C. Rejoindre une Session (Côté Étudiant)**
1.  **Saisie du code** : Le `SessionVM` gère la saisie intuitive du code à 6 chiffres.
2.  **Validation** : L'application vérifie auprès du backend si le code est actif et valide.
3.  **Lancement** : Redirection vers `desktop.html` qui charge l'environnement de travail.

### **D. L'Espace Desktop (Environnement de Travail)**
*   **Gestionnaire de fenêtres** : `ClassroomDesktopView.js` gère l'ouverture, la fermeture et le focus (z-index) des applications simulées (PDF, Browser, VS Code).
*   **VsCodeView** : Utilise **Monaco Editor** pour simuler un vrai IDE. Il gère l'arborescence des fichiers, l'édition de texte et simule un terminal pour l'exécution du code.
*   **BrowserView** : Utilise le tag `<webview>` d'Electron pour charger Chromium. Il inclut une barre de navigation complète et des filtres de sécurité.

---

## 📡 4. Communication avec le Backend

L'application communique avec l'API **NestJS** (`safe_exam_DB`) via des requêtes HTTP (fetch) :
*   **Base URL** : `https://safe-exam-db-ll3f.onrender.com` (ou `localhost:3000` en mode dev).
*   **Authentification** : Utilisation de **Bearer Tokens (JWT)** dans les headers de chaque requête.
*   **Synchronisation** : Les sessions sont synchronisées toutes les quelques secondes pour vérifier l'état (Active, Pausée, Terminée).

---

## 🎨 5. Principes de Design (Design System)

*   **Glassmorphism** : Utilisation massive de `backdrop-filter: blur(20px)` et de transparences (`rgba`) pour un aspect moderne.
*   **Système de Grille** : Utilisation de CSS Grid et Flexbox pour une interface responsive qui s'adapte à toutes les tailles de fenêtres Electron.
*   **Animations** : Transitions CSS3 fluides pour l'ouverture des fenêtres et les survols (hovers).

---

## 🚀 6. Cycle de Vie d'une Session

1.  **PRO :** Crée la session → Génère code PIN.
2.  **ETU :** Entre le PIN → Accède au Desktop.
3.  **PRO :** Surveille via son Dashboard.
4.  **PRO :** Termine la session → Le backend désactive le code PIN.
5.  **ETU :** L'application détecte la fin de session et redirige l'étudiant vers l'accueil.

---

## 🛠️ 7. Frameworks et Librairies Utilisés

L'application exploite plusieurs technologies pour offrir une expérience desktop native et performante :

| Technologie | Usage |
| :--- | :--- |
| **Electron** | Framework principal pour transformer l'application Web en application Desktop cross-platform. |
| **Monaco Editor** | Moteur de l'éditeur de code (le même que VS Code), utilisé dans `vscode.html`. |
| **NestJS** | Framework Node.js côté serveur pour une API robuste et structurée. |
| **Mongoose** | Modélisation d'objets MongoDB pour la gestion des données (Examens, Classes, Sessions). |
| **Vanilla JS/CSS** | Utilisation de JavaScript et CSS pur pour garantir légèreté et contrôle total sur le design. |

---

## 🔌 8. Protocoles et Communication

La sécurité et la réactivité reposent sur trois piliers de communication :

1.  **HTTP / REST** : Protocole standard pour la communication Client-Serveur. Toutes les données (sessions, cours, fichiers) transitent via des requêtes JSON.
2.  **JWT (JSON Web Token)** : Protocole de sécurité pour l'authentification. Une fois connecté, l'utilisateur reçoit un token stocké en mémoire qui signe chaque requête vers le backend.
3.  **IPC (Inter-Process Communication)** : Protocole interne à Electron permettant à l'interface (Renderer) de demander des actions privilégiées au système (Main), comme redimensionner la fenêtre ou accéder au système de fichiers.
4.  **HTTPS / TLS** : Chiffrement de toutes les données en transit pour éviter l'interception des sujets d'examen.

---

## 🏁 9. Comment faire une session de A à Z ?

Voici le protocole exact suivi par les utilisateurs :

### **Étape 1 : Préparation (Professeur)**
1.  Se connecter à l'espace professeur.
2.  Cliquer sur **"Créer une session"**.
3.  Sélectionner un examen existant (ex: "Architecture POO") ou saisir manuellement les détails.
4.  Choisir la classe et les outils autorisés (ex: autoriser uniquement **VS Code** et bloquer les autres sites).
5.  Cliquer sur **"Générer le code"**.

### **Étape 2 : Lancement**
1.  Le professeur partage le code de 6 chiffres (ex: `123-456`) avec les étudiants présents.
2.  Le professeur clique sur **"Lancer la session"** pour que le code devienne actif.

### **Étape 3 : Connexion (Étudiant)**
1.  L'étudiant lance l'application et entre ses identifiants.
2.  L'étudiant saisit le code de 6 chiffres fourni.
3.  Une fois validé, il entre dans la salle virtuelle où ses outils sont déjà configurés.

### **Étape 4 : Monitoring et Clôture**
1.  Le professeur peut mettre la session en **Pause** si nécessaire (pause générale).
2.  À la fin du temps imparti, le professeur clique sur **"Terminer"**.
3.  Le code expire immédiatement et l'environnement de l'étudiant se ferme pour laisser place à la page de déconnexion.

---

## 🔒 10. Intégrité et Sécurité du Système

Le projet **Apex Edu** accorde une importance capitale à l'intégrité des données et de l'environnement d'examen :

### **A. Isolation de l'Environnement (Sandbox)**
*   **Webview Isolation** : Le navigateur intégré utilise des partitions séparées pour éviter que les cookies ou l'historique ne soient partagés entre les sessions ou avec le système hôte.
*   **Context Isolation** : Electron est configuré pour séparer strictement le contexte JavaScript de l'interface du contexte privilégié de Node.js, empêchant toute injection de script malveillant de prendre le contrôle de la machine.

### **B. Intégrité des Données**
*   **Validation côté Serveur** : Chaque action (création de session, saisie de code) est validée par le backend NestJS. Un étudiant ne peut pas "deviner" ou "forcer" l'accès à une session sans un code actif en base de données.
*   **Syncronisation d'état** : L'application vérifie périodiquement l'intégrité de la session. Si le professeur suspend la session sur le serveur, l'interface de l'étudiant est immédiatement verrouillée par un overlay de sécurité.

### **C. Sécurité des Communications**
*   **JWT (Stateless Security)** : L'authentification ne repose pas sur des sessions serveur classiques mais sur des jetons signés numériquement. Cela garantit que les informations utilisateur transmises n'ont pas été altérées en cours de route.

---

## 📖 11. Documentation Technique (Maintenance)

### **Scripts de Démarrage**
*   `npm start` : Lance le processus principal Electron.
*   `npm run dev` : (Si configuré) Lance l'application avec les outils de développement ouverts.

### **Structure des Modèles de Données (Backend Sync)**
*   **PracticalTest** : L'objet central. Il fait le lien entre un `Exam` (le contenu), un `User` (le professeur) et une `Classe` (les bénéficiaires).
*   **SessionCode** : Indexé et unique en base de données avec une contrainte d'unicité sur les sessions actives pour éviter tout conflit de code.

---

## 💎 12. Valeur Ajoutée du Projet

L'intégrité technique d'**Apex Edu** repose sur sa capacité à transformer un ordinateur standard en une **station d'examen dédiée**, où seuls les outils pédagogiques autorisés par le professeur sont accessibles, garantissant ainsi une équité totale entre tous les étudiants.
