/**
 * scripts/run-tests.js
 * ──────────────────────────────────────────────────────────────────
 * Suite de tests unitaires pour les Modèles et la config.
 * Exécuté via : npm test
 * 
 * Tests :
 *  - APP_CONFIG contient les champs obligatoires
 *  - Session model : calcul displayTitle
 *  - Student model : calcul fullName et initials
 *  - LoginVM : détection du rôle par format de l'identifiant
 */

// Simuler le contexte navigateur pour les classes
global.window = {
    APP_CONFIG: {
        API_BASE:          'https://safe-exam-db-ll3f.onrender.com',
        SERVICE_EMAIL:     'jean.dupont@university.edu',
        SERVICE_PASSWORD:  'SecureP@ss123',
        ALLOWED_ROLES:     ['professor', 'admin', 'super_admin'],
        HEARTBEAT_INTERVAL_MS: 1000,
        FETCH_TIMEOUT_MS:  5000,
        APP_NAME:          'SafeExam',
        APP_VERSION:       '1.0.0',
    },
    sessionStorage: { getItem: () => null },
    location: { href: '' },
};
global.sessionStorage = { getItem: () => null, setItem: () => {} };
global.localStorage   = { setItem: () => {}, removeItem: () => {} };

const path = require('path');
const fs   = require('fs');
const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}`);
        console.error(`     → ${e.message}`);
        failed++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion échouée');
}

function assertEquals(a, b, msg) {
    if (a !== b) throw new Error(msg || `Attendu "${b}", obtenu "${a}"`);
}

// ══════════════════════════════════════════════════════════════════
// TEST SUITE 1 : APP_CONFIG
// ══════════════════════════════════════════════════════════════════
console.log('\n── Suite 1 : APP_CONFIG ─────────────────────────────────────');

test('API_BASE est défini et non vide', () => {
    assert(window.APP_CONFIG.API_BASE, 'API_BASE manquant');
    assert(window.APP_CONFIG.API_BASE.startsWith('https://'), 'API_BASE doit commencer par https://');
});

test('ALLOWED_ROLES contient professor, admin, super_admin', () => {
    const roles = window.APP_CONFIG.ALLOWED_ROLES;
    assert(roles.includes('professor'),   'professor manquant');
    assert(roles.includes('admin'),       'admin manquant');
    assert(roles.includes('super_admin'), 'super_admin manquant');
});

test('HEARTBEAT_INTERVAL_MS est >= 500ms', () => {
    assert(window.APP_CONFIG.HEARTBEAT_INTERVAL_MS >= 500, 'Heartbeat trop rapide');
});

test('APP_VERSION est défini', () => {
    assert(window.APP_CONFIG.APP_VERSION, 'APP_VERSION manquant');
});

// ══════════════════════════════════════════════════════════════════
// TEST SUITE 2 : Model Session
// ══════════════════════════════════════════════════════════════════
console.log('\n── Suite 2 : Model Session ──────────────────────────────────');

// Charger Session.js dans le contexte global
const vm = require('vm');
const sessionCode = fs.readFileSync(path.join(ROOT, 'src/renderer/models/Session.js'), 'utf8');
vm.runInThisContext(sessionCode);

test('new Session() crée un objet avec valeurs par défaut', () => {
    const s = new Session();
    assertEquals(s.sessionCode, '',              'sessionCode doit être vide');
    assertEquals(s.testType,    'DESKTOP_APP',   'testType par défaut');
    assertEquals(s.duration,    60,              'durée par défaut 60 min');
    assertEquals(s.isActive,    true,            'isActive par défaut true');
    assertEquals(s.isPaused,    false,           'isPaused par défaut false');
});

test('Session avec données complètes', () => {
    const s = new Session({
        _id: 'abc123',
        sessionCode: 'EXAM01',
        isActive: true,
        duration: 90,
        testType: 'QUIZ',
    });
    assertEquals(s.id,          'abc123', 'id incorrect');
    assertEquals(s.sessionCode, 'EXAM01', 'sessionCode incorrect');
    assertEquals(s.duration,    90,       'durée incorrecte');
    assertEquals(s.testType,    'QUIZ',   'testType incorrect');
});

test('Session.displayTitle retourne "Matière – Classe" si classe présente', () => {
    const s = new Session({ classe: { name: 'DevOps', niveau: '4SIM2' } });
    assertEquals(s.displayTitle, 'DevOps – 4SIM2', 'displayTitle incorrect');
});

test('Session.displayTitle retourne sessionCode si pas de classe', () => {
    const s = new Session({ sessionCode: '123456' });
    assertEquals(s.displayTitle, '123456', 'displayTitle doit être le code');
});

test('Session avec endedAt est inactive', () => {
    const s = new Session({ endedAt: new Date().toISOString() });
    assertEquals(s.isActive, false, 'Session terminée doit être inactive');
});

// ══════════════════════════════════════════════════════════════════
// TEST SUITE 3 : Model Student
// ══════════════════════════════════════════════════════════════════
console.log('\n── Suite 3 : Model Student ──────────────────────────────────');

const studentCode = fs.readFileSync(path.join(ROOT, 'src/renderer/models/Student.js'), 'utf8');
vm.runInThisContext(studentCode);

test('new Student() crée un objet avec valeurs par défaut', () => {
    const s = new Student();
    assertEquals(s.nom,    '', 'nom doit être vide');
    assertEquals(s.prenom, '', 'prenom doit être vide');
});

test('Student.fullName retourne "Prénom NOM"', () => {
    const s = new Student({ nom: 'DUPONT', prenom: 'Jean' });
    assertEquals(s.fullName, 'Jean DUPONT', 'fullName incorrect');
});

test('Student.fullName retourne studentCardNumber si pas de nom', () => {
    const s = new Student({ studentCardNumber: 'ET-2024-001' });
    assertEquals(s.fullName, 'ET-2024-001', 'fallback sur studentCardNumber');
});

test('Student.initials retourne les 2 premières lettres', () => {
    const s = new Student({ nom: 'DUPONT', prenom: 'Jean' });
    assertEquals(s.initials, 'JD', 'initiales incorrectes');
});

test('Student.initials retourne "ET" si pas de nom', () => {
    const s = new Student();
    assertEquals(s.initials, 'ET', 'initiales par défaut incorrectes');
});

// ══════════════════════════════════════════════════════════════════
// TEST SUITE 4 : Fichiers CSS présents
// ══════════════════════════════════════════════════════════════════
console.log('\n── Suite 4 : Présence des fichiers CSS ──────────────────────');

const cssFiles = [
    'src/renderer/assets/css/theme.css',
    'src/renderer/assets/css/components.css',
    'src/renderer/assets/css/professor.css',
    'src/renderer/assets/css/login.css',
    'src/renderer/assets/css/session.css',
    'src/renderer/assets/css/desktop.css',
    'src/renderer/assets/css/design-system.css',
    'src/renderer/assets/css/animation_man_boxes.css',
];

for (const f of cssFiles) {
    test(`${path.basename(f)} existe`, () => {
        assert(fs.existsSync(path.join(ROOT, f)), `Fichier manquant : ${f}`);
        const size = fs.statSync(path.join(ROOT, f)).size;
        assert(size > 0, `Fichier vide : ${f}`);
    });
}

// ══════════════════════════════════════════════════════════════════
// TEST SUITE 5 : HTML ne contient pas de CSS inline
// ══════════════════════════════════════════════════════════════════
console.log('\n── Suite 5 : Pas de CSS inline dans les HTML ────────────────');

const htmlFiles = ['professor.html', 'login.html', 'session.html', 'desktop.html'];
for (const html of htmlFiles) {
    test(`${html} — 0 bloc <style>`, () => {
        const content = fs.readFileSync(path.join(ROOT, 'src/renderer', html), 'utf8');
        const count = (content.match(/<style>/gi) || []).length;
        assertEquals(count, 0, `${html} contient ${count} bloc(s) <style>`);
    });
}

// ══════════════════════════════════════════════════════════════════
// RÉSULTAT
// ══════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`TESTS : ${passed} passés, ${failed} échoués`);
console.log('═'.repeat(60));

if (failed > 0) {
    console.error('\n🚫 PIPELINE BLOQUÉ — Corriger les tests avant de merger.\n');
    process.exit(1);
} else {
    console.log('\n🎉 Tous les tests passent.\n');
    process.exit(0);
}
