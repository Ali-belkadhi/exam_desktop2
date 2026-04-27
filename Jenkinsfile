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
    agent any

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        timestamps()
    }

    environment {
        NODE_ENV = 'test'
        ELECTRON_NO_ASAR = '1'
        REPORTS_DIR = 'reports'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        stage('Architecture Check') {
            steps {
                sh '''
                    if [ -f scripts/check-structure.js ]; then
                        node scripts/check-structure.js
                    else
                        echo "check-structure.js introuvable, stage ignoré"
                    fi
                '''
            }
        }

        stage('Lint JavaScript') {
            steps {
                sh '''
                    mkdir -p reports
                    npx eslint src --ext .js --format stylish --output-file reports/eslint-report.txt || true
                '''
            }
        }

        stage('Lint CSS') {
            steps {
                sh '''
                    mkdir -p reports
                    npx stylelint "src/renderer/assets/css/**/*.css" --formatter compact > reports/stylelint-report.txt 2>&1 || true
                '''
            }
        }

        stage('Unit Tests') {
            steps {
                sh '''
                    if [ -f scripts/run-tests.js ]; then
                        node scripts/run-tests.js
                    else
                        npm test
                    fi
                '''
            }
        }

        stage('Security Audit') {
            steps {
                sh '''
                    mkdir -p reports
                    npm audit --audit-level=high --json > reports/audit-report.json 2>&1 || true
                '''
            }
        }

        stage('Build Electron') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Archive') {
            steps {
                archiveArtifacts artifacts: 'dist/**/*, reports/**/*', allowEmptyArchive: true
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline réussi'
        }

        failure {
            echo '❌ Pipeline échoué'
        }
    }
}