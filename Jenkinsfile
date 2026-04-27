/**
 * ════════════════════════════════════════════════════════════════
 *  Jenkinsfile — Pipeline CI/CD pour Pim_App_Safe (SafeExam)
 *  Application Electron avec architecture MVVM
 * ════════════════════════════════════════════════════════════════
 *
 *  STAGES :
 *  1. Checkout       — Récupérer le code source
 *  2. Install        — Installer les dépendances npm
 *  3. Structure      — Vérifier l'architecture MVVM
 *  4. Lint JS        — ESLint sur les ViewModels / Models / Views
 *  5. Lint CSS       — Stylelint sur les fichiers CSS
 *  6. Tests          — Tests unitaires (Models + Config)
 *  7. Security Audit — npm audit (vulnérabilités)
 *  8. Build          — Compiler l'app Electron (branche main uniquement)
 *  9. Archive        — Archiver l'installeur généré
 * 10. Notify         — Notification de résultat
 */

pipeline {

    // ── Agent ──────────────────────────────────────────────────────
    agent {
        label 'windows'   // Exige un agent Windows (Electron nécessite Windows pour le build .exe)
    }

    // ── Options globales ───────────────────────────────────────────
    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timestamps()
    }

    // ── Paramètres ────────────────────────────────────────────────
    parameters {
        booleanParam(
            name: 'SKIP_BUILD',
            defaultValue: false,
            description: 'Passer le stage de build Electron (utile pour les PRs rapides)'
        )
        booleanParam(
            name: 'SKIP_AUDIT',
            defaultValue: false,
            description: 'Passer le security audit npm'
        )
        choice(
            name: 'LOG_LEVEL',
            choices: ['info', 'debug', 'warn'],
            description: 'Niveau de verbosité des logs'
        )
    }

    // ── Variables d'environnement ──────────────────────────────────
    environment {
        NODE_ENV         = 'test'
        APP_NAME         = 'SafeExam'
        ARTIFACT_DIR     = 'dist'
        REPORTS_DIR      = 'reports'
        // Désactiver la GUI Electron en CI
        DISPLAY          = ''
        ELECTRON_NO_ASAR = '1'
    }

    // ══════════════════════════════════════════════════════════════
    //  STAGES
    // ══════════════════════════════════════════════════════════════
    stages {

        // ── STAGE 1 : Checkout ────────────────────────────────────
        stage('📥 Checkout') {
            steps {
                echo "=== Checkout du dépôt ==="
                checkout scm

                script {
                    // Afficher les informations de build
                    def gitCommit = bat(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    def gitBranch = env.BRANCH_NAME ?: bat(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()
                    echo "Branche : ${gitBranch}"
                    echo "Commit  : ${gitCommit}"
                    currentBuild.displayName = "#${env.BUILD_NUMBER} — ${gitBranch}@${gitCommit}"
                    currentBuild.description = "SafeExam MVVM — ${gitBranch}"
                }
            }
        }

        // ── STAGE 2 : Install ─────────────────────────────────────
        stage('📦 Install Dependencies') {
            steps {
                echo "=== Installation des dépendances npm ==="
                bat 'npm ci --prefer-offline'
            }
            post {
                failure {
                    echo "❌ Échec de l'installation npm"
                }
            }
        }

        // ── STAGE 3 : Structure MVVM ──────────────────────────────
        stage('🏗️ Architecture Check') {
            steps {
                echo "=== Vérification de l'architecture MVVM ==="
                script {
                    def result = bat(
                        script: 'node scripts/check-structure.js',
                        returnStatus: true
                    )
                    if (result != 0) {
                        error("❌ Architecture MVVM non conforme — voir les logs ci-dessus")
                    }
                }
            }
        }

        // ── STAGE 4 : Lint JS ─────────────────────────────────────
        stage('🔍 Lint JavaScript') {
            steps {
                echo "=== ESLint sur ViewModels, Models, Views ==="
                bat '''
                    if not exist reports mkdir reports
                    npx eslint src/renderer/viewmodels/ src/renderer/models/ src/renderer/views/ src/main/ src/preload/ --ext .js --format stylish --output-file reports/eslint-report.txt --max-warnings=10
                '''
            }
            post {
                always {
                    // Publier le rapport ESLint si disponible
                    script {
                        if (fileExists('reports/eslint-report.txt')) {
                            archiveArtifacts artifacts: 'reports/eslint-report.txt', allowEmptyArchive: true
                        }
                    }
                }
                failure {
                    echo "❌ Des erreurs ESLint ont été détectées"
                }
            }
        }

        // ── STAGE 5 : Lint CSS ────────────────────────────────────
        stage('🎨 Lint CSS') {
            steps {
                echo "=== Stylelint sur assets/css/ ==="
                bat '''
                    if not exist reports mkdir reports
                    npx stylelint "src/renderer/assets/css/**/*.css" --formatter compact > reports/stylelint-report.txt 2>&1 || exit 0
                '''
                script {
                    // Afficher le rapport
                    def report = readFile('reports/stylelint-report.txt').trim()
                    if (report) {
                        echo "Rapport Stylelint :\n${report}"
                    } else {
                        echo "✅ Aucun problème CSS détecté"
                    }
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/stylelint-report.txt', allowEmptyArchive: true
                }
            }
        }

        // ── STAGE 6 : Tests unitaires ─────────────────────────────
        stage('🧪 Unit Tests') {
            steps {
                echo "=== Exécution des tests unitaires ==="
                script {
                    def result = bat(
                        script: 'node scripts/run-tests.js',
                        returnStatus: true
                    )
                    if (result != 0) {
                        error("❌ Des tests ont échoué — voir les logs ci-dessus")
                    }
                }
            }
            post {
                failure {
                    echo "❌ Tests échoués — le pipeline est bloqué"
                }
                success {
                    echo "✅ Tous les tests passent"
                }
            }
        }

        // ── STAGE 7 : Security Audit ──────────────────────────────
        stage('🔒 Security Audit') {
            when {
                not { expression { return params.SKIP_AUDIT } }
            }
            steps {
                echo "=== Audit de sécurité npm ==="
                script {
                    def result = bat(
                        script: 'npm audit --audit-level=high --json > reports/audit-report.json 2>&1',
                        returnStatus: true
                    )
                    if (result != 0) {
                        unstable("⚠️ Vulnérabilités détectées — voir reports/audit-report.json")
                    } else {
                        echo "✅ Aucune vulnérabilité critique"
                    }
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/audit-report.json', allowEmptyArchive: true
                }
            }
        }

        // ── STAGE 8 : Build Electron ──────────────────────────────
        stage('🔨 Build Application') {
            when {
                allOf {
                    not { expression { return params.SKIP_BUILD } }
                    anyOf {
                        branch 'main'
                        branch 'master'
                        branch 'release/*'
                    }
                }
            }
            steps {
                echo "=== Build de l'application Electron pour Windows ==="
                bat 'npx electron-builder --win --publish never'

                script {
                    def distFiles = findFiles(glob: 'dist/*.exe')
                    if (distFiles.length > 0) {
                        echo "✅ Installeur généré : ${distFiles[0].name}"
                    } else {
                        echo "⚠️  Aucun fichier .exe trouvé dans dist/"
                    }
                }
            }
            post {
                success {
                    echo "✅ Build réussi"
                }
                failure {
                    echo "❌ Échec du build Electron"
                }
            }
        }

        // ── STAGE 9 : Archive Artifacts ───────────────────────────
        stage('📦 Archive') {
            when {
                anyOf {
                    branch 'main'
                    branch 'master'
                    branch 'release/*'
                }
            }
            steps {
                echo "=== Archivage des artefacts ==="
                script {
                    // Archiver l'installeur si présent
                    if (fileExists('dist')) {
                        archiveArtifacts(
                            artifacts: 'dist/**/*.exe, dist/**/*.zip',
                            fingerprint: true,
                            allowEmptyArchive: true
                        )
                    }
                    // Archiver tous les rapports
                    archiveArtifacts(
                        artifacts: 'reports/**/*',
                        fingerprint: false,
                        allowEmptyArchive: true
                    )
                }
            }
        }

    } // fin stages

    // ══════════════════════════════════════════════════════════════
    //  POST — Actions de fin de pipeline
    // ══════════════════════════════════════════════════════════════
    post {

        always {
            echo "=== Pipeline terminé : ${currentBuild.result ?: 'SUCCESS'} ==="
            // Nettoyer le workspace (garder les rapports)
            cleanWs(
                cleanWhenSuccess: false,
                cleanWhenFailure: false,
                cleanWhenAborted: true,
                patterns: [
                    [pattern: 'node_modules/**', type: 'INCLUDE'],
                    [pattern: 'dist/**',         type: 'INCLUDE'],
                ]
            )
        }

        success {
            echo """
╔══════════════════════════════════════════╗
║  ✅ Pipeline RÉUSSI                      ║
║  SafeExam — Build #${env.BUILD_NUMBER}            
║  Branche : ${env.BRANCH_NAME ?: 'local'}
╚══════════════════════════════════════════╝
"""
        }

        failure {
            echo """
╔══════════════════════════════════════════╗
║  ❌ Pipeline ÉCHOUÉ                      ║
║  SafeExam — Build #${env.BUILD_NUMBER}            
║  Consultez les logs pour corriger.       ║
╚══════════════════════════════════════════╝
"""
        }

        unstable {
            echo "⚠️  Pipeline terminé avec des avertissements (UNSTABLE)"
        }

    }

} // fin pipeline
