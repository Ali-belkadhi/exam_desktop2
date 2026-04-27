/**
 * scripts/check-structure.js
 * ──────────────────────────────────────────────────────────────────
 * Vérifie l'architecture MVVM du projet Pim_App_Safe.
 * Exécuté dans le pipeline Jenkins (stage "Structure Check").
 * 
 * Contrôles effectués :
 *  1. Existence des fichiers obligatoires (config.js, models, viewmodels, views)
 *  2. Aucun bloc <style> dans les fichiers HTML
 *  3. Aucun script inline <script>...</script> dans les HTML
 *  4. Tous les ViewModels référencent APP_CONFIG (pas de URL hardcodée)
 *  5. Les fichiers CSS existent dans assets/css/
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');

let errors   = 0;
let warnings = 0;

function ok(msg)   { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.warn(`  ⚠️  ${msg}`); warnings++; }
function fail(msg) { console.error(`  ❌ ${msg}`); errors++; }
function section(title) { console.log(`\n── ${title} ` + '─'.repeat(Math.max(4, 50 - title.length))); }

// ── 1. Fichiers obligatoires ──────────────────────────────────────
section('1. Fichiers obligatoires');

const required = [
    'config.js',
    'models/User.js',
    'models/Session.js',
    'models/Student.js',
    'viewmodels/LoginVM.js',
    'viewmodels/SessionVM.js',
    'viewmodels/DesktopVM.js',
    'viewmodels/QuizVM.js',
    'viewmodels/ProfessorVM.js',
    'views/LoginView.js',
    'views/SessionView.js',
    'views/DesktopView.js',
    'views/BrowserView.js',
    'assets/css/theme.css',
    'assets/css/components.css',
    'assets/css/professor.css',
    'assets/css/login.css',
    'assets/css/session.css',
    'assets/css/desktop.css',
    'assets/css/design-system.css',
    'assets/css/animation_man_boxes.css',
    'professor.html',
    'login.html',
    'session.html',
    'desktop.html',
];

for (const rel of required) {
    const fullPath = path.join(RENDERER, rel);
    if (fs.existsSync(fullPath)) {
        ok(rel);
    } else {
        fail(`Fichier manquant : src/renderer/${rel}`);
    }
}

// ── 2. Pas de <style> inline dans les HTML ────────────────────────
section('2. Aucun CSS inline dans les HTML');

const htmlFiles = ['professor.html', 'login.html', 'session.html', 'desktop.html'];

for (const html of htmlFiles) {
    const content = fs.readFileSync(path.join(RENDERER, html), 'utf8');
    const styleMatches = (content.match(/<style>/gi) || []).length;
    if (styleMatches === 0) {
        ok(`${html} — 0 bloc <style>`);
    } else {
        fail(`${html} — ${styleMatches} bloc(s) <style> trouvé(s) ! Déplacer vers assets/css/`);
    }
}

// ── 3. Scripts inline dans les HTML (warning uniquement pour login/session/desktop) ──
section('3. Scripts inline dans les HTML');

// professor.html doit avoir 0 script inline (ProfessorVM est externalisé)
// login.html, session.html, desktop.html peuvent avoir des scripts de liaison (View glue)
const strictNoScript = ['professor.html'];
const warnScript     = ['login.html', 'session.html', 'desktop.html'];

for (const html of strictNoScript) {
    const content = fs.readFileSync(path.join(RENDERER, html), 'utf8');
    const inlineScripts = (content.match(/<script(?![^>]*\bsrc\b)[^>]*>/gi) || []).length;
    if (inlineScripts === 0) ok(`${html} — 0 script inline (✓ ProfessorVM externalisé)`);
    else fail(`${html} — ${inlineScripts} script(s) inline — déplacer vers ProfessorVM.js`);
}

for (const html of warnScript) {
    const content = fs.readFileSync(path.join(RENDERER, html), 'utf8');
    const inlineScripts = (content.match(/<script(?![^>]*\bsrc\b)[^>]*>/gi) || []).length;
    if (inlineScripts === 0) ok(`${html} — 0 script inline`);
    else warn(`${html} — ${inlineScripts} script(s) inline (script de liaison View — acceptable)`);
}

// ── 4. Tous les VM référencent APP_CONFIG ────────────────────────
section('4. ViewModels utilisent APP_CONFIG (pas d\'URL hardcodée)');

const vmFiles = [
    'viewmodels/LoginVM.js',
    'viewmodels/SessionVM.js',
    'viewmodels/QuizVM.js',
    'viewmodels/ProfessorVM.js',
];

const hardcodedUrlPattern = /['"]https:\/\/safe-exam-db[^'"]+['"]/g;

for (const vm of vmFiles) {
    const fullPath = path.join(RENDERER, vm);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const hardcoded = (content.match(hardcodedUrlPattern) || []);
    if (hardcoded.length === 0) {
        ok(`${vm} — utilise APP_CONFIG`);
    } else {
        fail(`${vm} — URL hardcodée trouvée : ${hardcoded[0]}`);
    }
}

// ── 5. config.js référencé dans tous les HTML ────────────────────
section('5. config.js référencé dans tous les HTML');

for (const html of htmlFiles) {
    const content = fs.readFileSync(path.join(RENDERER, html), 'utf8');
    if (content.includes('./config.js')) {
        ok(`${html} — config.js présent`);
    } else {
        fail(`${html} — config.js manquant dans le <head>`);
    }
}

// ── 6. Taille des HTML (doit être < 100 KB) ──────────────────────
section('6. Taille des fichiers HTML (< 100 KB)');

for (const html of htmlFiles) {
    const stats = fs.statSync(path.join(RENDERER, html));
    const kb = (stats.size / 1024).toFixed(1);
    if (stats.size < 100 * 1024) {
        ok(`${html} — ${kb} KB`);
    } else {
        warn(`${html} — ${kb} KB (> 100 KB, considérer une optimisation)`);
    }
}

// ── Résultat final ────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`RÉSULTAT : ${errors} erreur(s), ${warnings} avertissement(s)`);
console.log('═'.repeat(60));

if (errors > 0) {
    console.error('\n🚫 ÉCHEC — Corriger les erreurs avant de fusionner.\n');
    process.exit(1);
} else if (warnings > 0) {
    console.warn('\n⚠️  SUCCÈS avec avertissements.\n');
    process.exit(0);
} else {
    console.log('\n🎉 SUCCÈS — Architecture MVVM valide.\n');
    process.exit(0);
}
