# 🎓 Apex Edu — Application Desktop Éducative

> Application desktop construite avec **Electron + HTML/CSS/JS** suivant le pattern **MVVM**.  
> Elle simule un environnement de salle de classe virtuelle avec rôles Professeur et Étudiant.

---

## 🚀 Lancer l'application

```bash
# 1. Installer les dépendances
npm install

# 2. Démarrer l'application
npm start
```

> **Prérequis** : Node.js ≥ 18 + npm installés.

---

## 🏗️ Architecture du projet

```
Pim_App_Safe/
├── package.json                  # Config Electron + dépendances
├── src/
│   ├── main/
│   │   ├── main.js               # Processus principal Electron (BrowserWindow)
│   │   └── ipcHandlers.js        # Gestionnaires IPC (communication Main ↔ Renderer)
│   ├── preload/
│   │   └── preload.js            # Pont sécurisé contextIsolation (API exposée au renderer)
│   └── renderer/
│       ├── login.html            # Page de connexion
│       ├── session.html          # Page saisie du code de session (Étudiant)
│       ├── professor.html        # Espace Professeur
│       ├── desktop.html          # Salle de classe virtuelle (OS-like)
│       ├── vscode.html           # Éditeur de code intégré (Monaco Editor)
│       ├── models/
│       │   └── User.js           # Modèle utilisateur (rôle, id, username)
│       ├── viewmodels/
│       │   ├── LoginVM.js        # ViewModel Login (routage Professeur/Étudiant)
│       │   ├── SessionVM.js      # ViewModel Code de session
│       │   └── ProfessorVM.js    # ViewModel Espace professeur
│       ├── views/
│       │   ├── ClassroomDesktopView.js  # Logique OS desktop (fenêtres, taskbar)
│       │   ├── BrowserView.js           # Navigateur intégré (webview Chromium)
│       │   ├── VsCodeView.js            # Éditeur Monaco (fichiers, tabs, terminal)
│       │   └── SessionView.js           # Logique formulaire session étudiant
│       └── assets/
│           └── css/
│               └── design-system.css    # Système de design (tokens, composants)
```

---

## 🎨 Design System

L'application utilise un **thème sombre** cohérent inspiré de Discord :

| Token | Valeur | Usage |
|---|---|---|
| Background | `#0a0a0f` | Fond principal |
| Card | `rgba(30,31,35,0.85)` | Cartes glassmorphism |
| Primary | `#5865f2` (Blurple) | Boutons principaux |
| Accent Cyan | `#00d4ff` | Dégradés secondaires |
| Text | `#dbdee1` | Texte principal |
| Text dim | `rgba(255,255,255,0.4)` | Texte secondaire |
| Success | `#23d160` | États actifs |
| Danger | `#ed4245` | Erreurs, suppression |

**Effets visuels :**
- Orbes animées flottantes (blur radial)
- Glassmorphism (`backdrop-filter: blur`)
- Gradients indigo/cyan sur les fonds
- Animations `fadeUp` sur les composants

---

## 🔐 Système d'authentification

### Logique statique (MVP)

| Identifiant | Mot de passe | Rôle | Destination |
|---|---|---|---|
| `ali123` | (libre) | Professeur | `professor.html` |
| Tout autre | (libre) | Étudiant | `session.html` |

> Le rôle et l'identifiant sont stockés dans `sessionStorage` pour être réutilisés entre les pages.

### Flow complet

```
login.html
   │
   ├── ID == "ali123" ──► professor.html ──► [Créer session] ──► desktop.html
   │
   └── Autre ID ────────► session.html ──────[Code valide] ───► desktop.html
```

---

## 📄 Pages de l'application

### 1. `login.html` — Page de connexion
- Fond dark avec orbes animées (même style que Discord)
- Champs : **Identifiant** + **Mot de passe**
- Bouton "👁" pour afficher/masquer le mot de passe
- Lien "Mot de passe oublié ?" sous le champ mot de passe
- Routage automatique selon l'identifiant saisi

### 2. `session.html` — Code de session (Étudiant)
- 6 cases individuelles pour saisir le code (style Apple/Discord)
- Navigation automatique entre les cases
- Support du copier-coller
- Bouton "Rejoindre" activé uniquement quand le code est complet

### 3. `professor.html` — Espace Professeur
- Top bar avec badge rôle + avatar + déconnexion
- **Statistiques** : état connexion / nombre de sessions / dernière session
- **Carte "Créer une session"** → ouvre une modal avec :
  - Nom de la session
  - Durée (1h / 1h30 / 2h / 3h)
  - Classe (4SIM1 / 4SIM2 / 4SIM3 / 4SIM4)
  - IDEs autorisés : ✅ VS Code / IntelliJ IDEA (chips cliquables)
  - Fichiers partagés : PDF, Word, Excel, Images (avec aperçu + suppression)
  - Génération d'un code `XXX-XXX` aléatoire
  - Boutons : Copier / 🚀 Lancer la session
- **Carte "Voir mes sessions"** → liste des sessions passées (Active / Terminée)

### 4. `desktop.html` — Salle de classe virtuelle
Interface de type OS (Windows 11 style) avec :
- **Barre de tâches** en bas : 💠 Démarrer | 🗂️ Fichiers | 📄 PDF | 🌐 Navigateur
- **Menu Démarrer** : grille d'applications
- **Widget session** : code actif, minuteur, bouton Quitter
- **Fenêtres flottantes** (draggable, minimisable, fermable) :
  - 🗂️ **Explorateur de ressources** : fichiers du cours (PDF, VS Code)
  - 📄 **Visionneuse PDF** : contenu du cours
  - 🌐 **Navigateur intégré** : Chromium via `<webview>` Electron

### 5. `vscode.html` — Éditeur de code
Réplique de VS Code avec Monaco Editor :
- Arborescence de fichiers Java cliquables
- Onglets avec indicateur de modification
- Thème sombre fidèle à VS Code
- Terminal simulé (`mvn compile`, `java Main`, etc.)
- Barre de statut (ligne/colonne, branche Git, langage)
- Raccourcis : `Ctrl+S` sauvegarder, `F5` exécuter

---

## 🌐 Navigateur intégré (`BrowserView.js`)

Utilise le tag `<webview>` natif d'Electron pour embarquer Chromium :

| Fonctionnalité | Détail |
|---|---|
| Navigation | Back ← / Forward → / Reload ↺ |
| Barre d'adresse | URL ou recherche Google automatique |
| Sécurité | 🔒 HTTPS / ⚠️ HTTP non sécurisé |
| Erreurs | Page d'erreur avec bouton Réessayer |
| Smart URL | `python tutorial` → recherche Google |

---

## 🛠️ Stack Technique

| Technologie | Version | Usage |
|---|---|---|
| **Electron** | ^29.1.0 | Framework desktop cross-platform |
| **Monaco Editor** | ^0.55.1 | Moteur de VS Code (éditeur de code) |
| **HTML5 / CSS3** | — | Interface utilisateur |
| **JavaScript ES6+** | — | Logique MVVM |
| **Inter** (Google Fonts) | — | Typographie |

---

## 🧩 Pattern MVVM

```
┌─────────────────────────────────────────────────┐
│                   VIEW (.html)                  │
│  login.html, session.html, professor.html...    │
│  (Affichage, événements DOM)                    │
└──────────────────┬──────────────────────────────┘
                   │ appelle
┌──────────────────▼──────────────────────────────┐
│              VIEWMODEL (.js)                    │
│  LoginVM, SessionVM, ProfVM, BrowserVM...       │
│  (État, logique de présentation, routage)       │
└──────────────────┬──────────────────────────────┘
                   │ accède
┌──────────────────▼──────────────────────────────┐
│                MODEL (.js)                      │
│  User.js, ProfData (sessions statiques)         │
│  (Données, règles métier)                       │
└─────────────────────────────────────────────────┘
```

---

## 📦 Dépendances

```json
{
  "devDependencies": {
    "electron": "^29.1.0"
  },
  "dependencies": {
    "monaco-editor": "^0.55.1"
  }
}
```

---

## 👥 Comptes de test

| Compte | Identifiant | Rôle |
|---|---|---|
| Professeur | `ali123` | Accès espace prof + création sessions |
| Étudiant | `etudiant1` (ou tout autre) | Saisie code session |

---

## 📝 Auteur

Projet réalisé dans le cadre d'un **PIM (Projet d'Intégration et de Management)**.  
Application éducative desktop avec gestion de sessions de cours en temps réel.
