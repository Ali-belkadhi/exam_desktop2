pipeline {
    agent any

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        timestamps()
    }

    parameters {
        booleanParam(name: 'SKIP_BUILD', defaultValue: true, description: 'Ignorer le build Electron')
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

       stage('SonarQube') {
    steps {
        withSonarQubeEnv('SonarQube') {
            withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
                sh '''
                    sonar-scanner \
                    -Dsonar.projectKey=smart_exam \
                    -Dsonar.projectName=smart_exam \
                    -Dsonar.sources=src \
                    -Dsonar.host.url=$SONAR_HOST_URL \
                    -Dsonar.login=$SONAR_TOKEN \
                    -Dsonar.exclusions=node_modules/**,dist/**,reports/**
                '''
            }
        }
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
            when {
                expression { return !params.SKIP_BUILD }
            }
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