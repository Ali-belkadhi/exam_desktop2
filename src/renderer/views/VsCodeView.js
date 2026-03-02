// VsCodeView.js — Monaco Editor integration with MVVM pattern

// ─── File Content Store (Model) ───────────────────────────────
const FileStore = {
    files: {
        'Main.java': `package com.cours.poo;

/**
 * Point d'entrée principal de l'application.
 * Cours : Architecture POO - L3 Info
 * Prof  : M. Dupont
 */
public class Main {

    public static void main(String[] args) {
        System.out.println("=== Démarrage de l'application ===");
        
        Student s1 = new Student(1, "Alice Martin", "alice@univ.fr");
        Student s2 = new Student(2, "Bob Dupont", "bob@univ.fr");
        
        System.out.println("Étudiant 1 : " + s1.getInfo());
        System.out.println("Étudiant 2 : " + s2.getInfo());
        
        // TODO : Exercice 1 — Ajouter une méthode calculerMoyenne()
        // TODO : Exercice 2 — Implémenter l'interface Comparable
    }
}`,
        'Utils.java': `package com.cours.poo;

import java.util.List;

/**
 * Classe utilitaire — méthodes statiques communes.
 */
public class Utils {

    /**
     * Affiche une liste d'étudiants dans la console.
     */
    public static void printStudents(List<Student> students) {
        students.forEach(s -> System.out.println("- " + s.getInfo()));
    }

    /**
     * Calcule la moyenne d'un tableau de notes.
     */
    public static double moyenne(double[] notes) {
        if (notes.length == 0) return 0;
        double sum = 0;
        for (double n : notes) sum += n;
        return sum / notes.length;
    }
}`,
        'Student.java': `package com.cours.poo;

/**
 * Modèle — Entité Étudiant.
 */
public class Student {
    private int id;
    private String nom;
    private String email;
    private double[] notes;

    public Student(int id, String nom, String email) {
        this.id = id;
        this.nom = nom;
        this.email = email;
        this.notes = new double[0];
    }

    public String getInfo() {
        return String.format("[%d] %s <%s>", id, nom, email);
    }

    public int getId() { return id; }
    public String getNom() { return nom; }
    public String getEmail() { return email; }
    
    // TODO : Exercice — compléter les setters et ajouter la gestion des notes
}`,
        'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.cours.poo</groupId>
    <artifactId>starter-project-l3</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
    </properties>
</project>`,
        'README.md': `# Starter Project L3 — Architecture POO

## Description
Projet de démarrage pour le cours **Architecture POO** (L3 Informatique).

## Structure
\`\`\`
src/
  main/java/
    Main.java     — Point d'entrée
    Student.java  — Entité étudiant
    Utils.java    — Méthodes utilitaires
\`\`\`

## Exercices
1. **Exercice 1** : Ajouter une méthode \`calculerMoyenne()\` dans \`Student.java\`
2. **Exercice 2** : Implémenter l'interface \`Comparable<Student>\`
3. **Exercice 3** : Créer une classe \`Classe\` contenant une \`List<Student>\`

## Compilation
\`\`\`bash
mvn compile
mvn exec:java -Dexec.mainClass="com.cours.poo.Main"
\`\`\``
    },
    languages: {
        'Main.java': 'java', 'Utils.java': 'java', 'Student.java': 'java',
        'pom.xml': 'xml', 'README.md': 'markdown'
    }
};

// ─── ViewModel ─────────────────────────────────────────────────
const VsCodeVM = {
    activeFile: 'Main.java',
    openTabs: ['Main.java'],
    monacoEditor: null,
    sidebarVisible: true,

    openFile(filename) {
        if (!FileStore.files[filename]) return;
        if (!this.openTabs.includes(filename)) this.openTabs.push(filename);
        this.activeFile = filename;
        this.render();
    },

    closeTab(filename) {
        this.openTabs = this.openTabs.filter(t => t !== filename);
        if (this.activeFile === filename) {
            this.activeFile = this.openTabs[this.openTabs.length - 1] || null;
        }
        this.render();
    },

    toggleSidebar() {
        this.sidebarVisible = !this.sidebarVisible;
        this.render();
    },

    runCode() {
        const terminal = document.getElementById('terminalOutput');
        const inputRow = terminal.querySelector('.terminal-input-row');

        const output = document.createElement('div');
        output.innerHTML = `
            <div class="terminal-input-row">
                <span class="prompt">PS </span><span class="path">C:\\Projects\\Starter_Project_L3</span><span>&gt; </span>
                <span>java Main</span>
            </div>
            <div class="result">=== Démarrage de l'application ===</div>
            <div class="result">Étudiant 1 : [1] Alice Martin &lt;alice@univ.fr&gt;</div>
            <div class="result">Étudiant 2 : [2] Bob Dupont &lt;bob@univ.fr&gt;</div>
            <div class="success"><br/>Process finished with exit code 0</div>
            <br/>
        `;
        terminal.insertBefore(output, inputRow);
        inputRow.scrollIntoView({ behavior: 'smooth' });
    },

    saveFile() {
        if (this.monacoEditor && this.activeFile) {
            FileStore.files[this.activeFile] = this.monacoEditor.getValue();
            // Update tab to remove "dot" unsaved indicator
            const tab = document.getElementById('tab-' + this.activeFile);
            if (tab) tab.style.borderTop = '1px solid #0078d4';
        }
    },

    render() {
        // Render tabs
        const tabBar = document.getElementById('tabBar');
        tabBar.innerHTML = this.openTabs.map(f => `
            <div class="tab ${f === this.activeFile ? 'active' : ''}" id="tab-${f}" onclick="VsCodeVM.openFile('${f}')">
                <span>${FileStore.languages[f] === 'java' ? '☕' : FileStore.languages[f] === 'markdown' ? '📝' : '📄'}</span>
                ${f}
                <span class="tab-close" onclick="event.stopPropagation(); VsCodeVM.closeTab('${f}')">✕</span>
            </div>
        `).join('');

        // Update editor content
        if (this.monacoEditor && this.activeFile) {
            const lang = FileStore.languages[this.activeFile] || 'plaintext';
            const model = monaco.editor.createModel(FileStore.files[this.activeFile], lang);
            this.monacoEditor.setModel(model);
            document.getElementById('status-lang').textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
        }

        // Sidebar visibility
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.style.display = this.sidebarVisible ? 'flex' : 'none';

        // Highlight active tree item
        document.querySelectorAll('.tree-file').forEach(el => {
            el.classList.toggle('active', el.textContent.trim().includes(this.activeFile));
        });
    }
};

// ─── Global functions called from HTML ─────────────────────────
function openFile(f, lang) { VsCodeVM.openFile(f); }
function closeTab(f) { VsCodeVM.closeTab(f); }
function toggleSidebar() { VsCodeVM.toggleSidebar(); }

// ─── Monaco Init ───────────────────────────────────────────────
require(['vs/editor/editor.main'], function () {
    // Define a custom VS Code-like theme
    monaco.editor.defineTheme('vscDark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
            { token: 'string', foreground: 'CE9178' },
            { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
            { token: 'type', foreground: '4EC9B0' },
            { token: 'number', foreground: 'B5CEA8' },
        ],
        colors: {
            'editor.background': '#1E1E1E',
            'editor.lineHighlightBackground': '#2A2D2E',
            'editorLineNumber.foreground': '#858585',
            'editorCursor.foreground': '#AEAFAD',
        }
    });

    VsCodeVM.monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: FileStore.files['Main.java'],
        language: 'java',
        theme: 'vscDark',
        fontSize: 14,
        fontFamily: "'Cascadia Code', 'Fira Code', 'Courier New', monospace",
        fontLigatures: true,
        minimap: { enabled: true },
        automaticLayout: true,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderLineHighlight: 'all',
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
    });

    // Track cursor position in status bar
    VsCodeVM.monacoEditor.onDidChangeCursorPosition((e) => {
        document.getElementById('status-cursor').textContent =
            `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    // Ctrl+S to save
    VsCodeVM.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        VsCodeVM.saveFile();
    });

    // Ctrl+F5 to run
    VsCodeVM.monacoEditor.addCommand(monaco.KeyCode.F5, () => {
        VsCodeVM.runCode();
    });

    // Mark modified tabs with dot
    VsCodeVM.monacoEditor.onDidChangeModelContent(() => {
        const tab = document.getElementById('tab-' + VsCodeVM.activeFile);
        if (tab) tab.style.borderTop = '1px solid #e7c547';
    });
});

// ─── Terminal input handler ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const termInput = document.getElementById('terminalInput');
    if (!termInput) return;

    termInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = termInput.value.trim();
            termInput.value = '';
            const terminal = document.getElementById('terminalOutput');
            const inputRow = terminal.querySelector('.terminal-input-row');

            if (!cmd) return;

            const response = document.createElement('div');
            if (cmd === 'java Main' || cmd === 'mvn exec:java -Dexec.mainClass="com.cours.poo.Main"') {
                VsCodeVM.runCode();
            } else if (cmd === 'mvn compile') {
                response.innerHTML = `
                    <div class="terminal-input-row"><span class="prompt">PS </span><span class="path">C:\\Projects\\Starter_Project_L3</span><span>&gt; </span><span>${cmd}</span></div>
                    <div class="result">[INFO] Scanning for projects...</div>
                    <div class="result">[INFO] Building starter-project-l3 1.0-SNAPSHOT</div>
                    <div class="success">[INFO] BUILD SUCCESS</div><br/>
                `;
            } else if (cmd === 'cls' || cmd === 'clear') {
                terminal.innerHTML = '';
                terminal.appendChild(inputRow);
                return;
            } else {
                response.innerHTML = `
                    <div class="terminal-input-row"><span class="prompt">PS </span><span class="path">C:\\Projects\\Starter_Project_L3</span><span>&gt; </span><span>${cmd}</span></div>
                    <div class="error">'${cmd}' n'est pas reconnu comme une commande interne ou externe.</div><br/>
                `;
            }
            terminal.insertBefore(response, inputRow);
            inputRow.scrollIntoView({ behavior: 'smooth' });
        }
    });
});
