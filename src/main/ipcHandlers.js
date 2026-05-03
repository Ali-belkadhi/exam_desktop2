const { dialog, app, screen, BrowserWindow, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { exec, spawn } = require('child_process');

// ── Globals ───────────────────────────────────────────────────────────────────
let csProcess = null;
let csPort = null;
let csStatus = 'stopped';
let mainWinRef = null;
let handlersRegistered = false;
let shieldWindows = []; // Fenêtres de blocage pour les autres écrans

/** Trouver un port TCP libre à partir de from. */
function findFreePort(from = 9000) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', () => { server.close(); findFreePort(from + 1).then(resolve).catch(reject); });
        server.listen(from, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

/** Vérifier si WSL est disponible et si code-server y est installé. */
function checkWSL() {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') return resolve({ available: false });
        exec('wsl -l -v', { timeout: 6000 }, (err, stdout) => {
            if (err || !stdout) return resolve({ available: false });
            const hasDistro = /ubuntu|debian|kali/i.test(stdout);
            if (!hasDistro) return resolve({ available: false });
            exec('wsl -- which code-server', { timeout: 5000 }, (err2, out2) => {
                const hasCS = !err2 && out2 && out2.trim().length > 0;
                resolve({ available: true, hasCodeServer: hasCS });
            });
        });
    });
}

/** Chercher code-server natif Windows (retourne null si absent). */
function findNativeCodeServer() {
    const candidates = [
        path.join(__dirname, '../../node_modules/.bin/code-server'),
        path.join(process.env.APPDATA || '', 'npm', 'code-server.cmd'),
        path.join(process.env.APPDATA || '', 'npm', 'code-server'),
    ];
    for (const c of candidates) {
        try { if (fs.existsSync(c)) return c; } catch (_) { }
    }
    try {
        require('child_process').execSync('code-server --version', { timeout: 3000, stdio: 'pipe' });
        return 'code-server';
    } catch (_) { return null; }
}

/** Attendre qu'un port TCP réponde (polling). */
function waitForPort(port, maxMs = 35000, intervalMs = 900) {
    return new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
            const sock = new net.Socket();
            sock.setTimeout(600);
            sock.on('connect', () => { sock.destroy(); resolve(true); });
            sock.on('error', () => { sock.destroy(); retry(); });
            sock.on('timeout', () => { sock.destroy(); retry(); });
            sock.connect(port, '127.0.0.1');
        };
        const retry = () => {
            if (Date.now() - start >= maxMs) return resolve(false);
            setTimeout(check, intervalMs);
        };
        check();
    });
}

/**
 * Démarrer code-server.
 *
 * Stratégie sur Windows :
 *   1. Si code-server natif trouvé  → spawn direct
 *   2. Si WSL disponible + code-server installé dans WSL → wsl -- code-server
 *   3. Si WSL disponible mais code-server absent → proposer installation auto dans WSL
 *   4. Sinon → erreur avec instructions
 */
async function startCodeServer(win, workspacePath, keepAlive = false) {
    if (csStatus === 'starting' || csStatus === 'ready') {
        return { success: true, port: csPort, status: csStatus };
    }

    csStatus = 'starting';
    mainWinRef = win;

    // Trouver un port libre
    try {
        csPort = await findFreePort(9000);
    } catch (e) {
        csStatus = 'error';
        win.webContents.send('codeserver:error', { message: 'Aucun port disponible : ' + e.message });
        return { success: false, error: 'no_port' };
    }

    const isWin = process.platform === 'win32';

    // ── STRATÉGIE 1 : code-server natif ──────────────────────────────────────
    const nativeCmd = findNativeCodeServer();
    if (nativeCmd) {
        console.log('[CodeServer] Using native:', nativeCmd);
        _spawnNative(win, nativeCmd, csPort, workspacePath, keepAlive);
        return { success: true, port: csPort, status: 'starting' };
    }

    // ── STRATÉGIE 2 & 3 : WSL (Windows uniquement) ───────────────────────────
    if (isWin) {
        const wsl = await checkWSL();

        if (wsl.available && wsl.hasCodeServer) {
            console.log('[CodeServer] Using WSL code-server');
            _spawnWSL(win, csPort, workspacePath, keepAlive);
            return { success: true, port: csPort, status: 'starting' };
        }

        if (wsl.available && !wsl.hasCodeServer) {
            // Proposer l'auto-installation dans WSL
            console.log('[CodeServer] WSL available — installing code-server in WSL...');
            win.webContents.send('codeserver:error', {
                message: 'code-server n\'est pas installé dans WSL.',
                hint: [
                    'Installez-le avec ces commandes dans WSL (Ubuntu) :',
                    '',
                    'curl -fsSL https://code-server.dev/install.sh | sh',
                    '',
                    'Puis relancez.',
                ].join('\n'),
                installInWSL: true,
            });
            csStatus = 'error';
            return { success: false, error: 'not_installed_wsl' };
        }
    }

    // ── STRATÉGIE 4 : Aucune solution trouvée ────────────────────────────────
    csStatus = 'error';
    const hint = isWin
        ? 'Sur Windows, utilisez WSL (Ubuntu) et exécutez :\ncurl -fsSL https://code-server.dev/install.sh | sh'
        : 'Installez code-server :\ncurl -fsSL https://code-server.dev/install.sh | sh';

    win.webContents.send('codeserver:error', {
        message: 'code-server introuvable sur ce système.',
        hint,
    });
    return { success: false, error: 'not_found' };
}

/** Spawn code-server natif (Windows/Linux/macOS). */
function _spawnNative(win, cmd, port, workspacePath, keepAlive) {
    const args = ['--auth=none', `--port=${port}`, '--bind-addr=127.0.0.1', workspacePath || '.'];

    let proc;
    try {
        proc = spawn(cmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
            windowsHide: true,
        });
    } catch (e) {
        csStatus = 'error';
        win.webContents.send('codeserver:error', { message: 'Spawn échoué : ' + e.message });
        return;
    }

    csProcess = proc;
    csProcess._keepAlive = keepAlive;
    _attachListeners(win, port);
}

/** Spawn code-server via WSL sur Windows. */
function _spawnWSL(win, port, workspacePath, keepAlive) {
    // Convertir le chemin Windows en chemin WSL si besoin
    let wslPath = workspacePath || '.';
    if (workspacePath && /^[A-Za-z]:\\/.test(workspacePath)) {
        // Ex: C:\Users\... → /mnt/c/Users/...
        wslPath = workspacePath
            .replace(/^([A-Za-z]):\\/, (_, d) => `/mnt/${d.toLowerCase()}/`)
            .replace(/\\/g, '/');
    }

    const wslCmd = `wsl -- code-server --auth=none --port=${port} --bind-addr=0.0.0.0 "${wslPath}"`;
    console.log('[CodeServer] WSL cmd:', wslCmd);

    let proc;
    try {
        proc = spawn('cmd.exe', ['/c', wslCmd], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
    } catch (e) {
        csStatus = 'error';
        win.webContents.send('codeserver:error', { message: 'WSL spawn échoué : ' + e.message });
        return;
    }

    csProcess = proc;
    csProcess._keepAlive = keepAlive;
    _attachListeners(win, port);
}

/**
 * Attacher les listeners stdout/stderr + fallback polling au processus code-server.
 * On utilise le polling TCP (waitForPort) comme détection principale car
 * code-server dans WSL peut écrire sur stderr ou sans saut de ligne clair.
 */
function _attachListeners(win, port) {
    let ready = false;

    const markReady = () => {
        if (ready) return;
        ready = true;
        csStatus = 'ready';
        const url = `http://127.0.0.1:${port}`;
        console.log('[CodeServer] Ready at', url);
        win.webContents.send('codeserver:ready', { url, port });
    };

    // Logs
    csProcess.stdout?.on('data', (d) => {
        const t = d.toString();
        console.log('[CS stdout]', t.slice(0, 200));
        if (!ready && (t.includes('HTTP server listening') || t.includes('localhost:'))) markReady();
    });
    csProcess.stderr?.on('data', (d) => {
        const t = d.toString();
        console.log('[CS stderr]', t.slice(0, 200));
        if (!ready && t.includes('HTTP server listening')) markReady();
    });

    // Polling TCP — plus fiable que l'analyse de logs
    waitForPort(port, 40000).then((ok) => {
        if (ok) markReady();
        else if (!ready) {
            csStatus = 'error';
            win.webContents.send('codeserver:error', {
                message: 'code-server ne répond pas après 40 secondes.',
                hint: 'Vérifiez que code-server est bien installé et que le port n\'est pas bloqué par un pare-feu.',
            });
        }
    });

    csProcess.on('error', (err) => {
        csStatus = 'error';
        console.error('[CodeServer] Process error:', err);
        win.webContents.send('codeserver:error', { message: 'Erreur processus : ' + err.message });
    });

    csProcess.on('exit', (code, signal) => {
        csStatus = 'stopped';
        csProcess = null;
        console.log(`[CodeServer] Exit code=${code} signal=${signal}`);
        if (win && !win.isDestroyed()) {
            win.webContents.send('codeserver:stopped', { code, signal });
        }
    });
}

/** Arrêter code-server proprement. */
function stopCodeServer() {
    if (!csProcess) return { success: true, message: 'Déjà arrêté' };
    try {
        if (process.platform === 'win32') {
            exec(`taskkill /PID ${csProcess.pid} /T /F`);
        } else {
            csProcess.kill('SIGTERM');
        }
        csProcess = null;
        csStatus = 'stopped';
        csPort = null;
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = (ipcMain, mainWindow) => {
    if (handlersRegistered) return;
    handlersRegistered = true;

    mainWinRef = mainWindow;
    // ── code-server ──────────────────────────────────────────────────────────
    ipcMain.handle('codeserver:start', async (event, { workspacePath, keepAlive }) => {
        const win = mainWindow || event.sender.getOwnerBrowserWindow?.();
        return startCodeServer(win, workspacePath, keepAlive);
    });

    ipcMain.handle('codeserver:stop', async () => stopCodeServer());

    ipcMain.handle('codeserver:status', async () => ({
        status: csStatus,
        port: csPort,
        url: csPort ? `http://127.0.0.1:${csPort}` : null,
    }));

    // ── Auth simulé ──────────────────────────────────────────────────────────
    ipcMain.handle('auth:login', async (event, { email, password }) => {
        await new Promise(r => setTimeout(r, 800));
        if (email === 'student@ecole.com' && password === 'password')
            return { success: true, user: { id: 1, name: 'Student', role: 'student', token: 'mock' } };
        return { success: false, error: 'Identifiants invalides.' };
    });

    // ── Session ──────────────────────────────────────────────────────────────
    ipcMain.handle('session:join', async (event, { code, title, prof }) => {
        return {
            success: true,
            session: {
                id: code || 'N/A',
                title: title || 'Examen pratique',
                prof: prof || 'Professeur'
            }
        };
    });

    // ── VS Code externe ──────────────────────────────────────────────────────
    ipcMain.handle('os:launchVSCode', async (event, { projectPath, userSavedPath }) => {
        const os = require('os');
        const platform = os.platform();
        const run = (exe, proj) => new Promise(resolve => {
            const cmd = platform === 'darwin' && exe === 'code'
                ? `open -a "Visual Studio Code" "${proj}"`
                : `${exe} "${proj}"`;
            exec(cmd, err => err
                ? resolve({ success: false, error: err.message })
                : resolve({ success: true, message: 'VS Code lancé.' }));
        });

        if (userSavedPath && fs.existsSync(userSavedPath)) return run(`"${userSavedPath}"`, projectPath);

        return new Promise(resolve => {
            exec('code -v', async err => {
                if (!err) return resolve(await run('code', projectPath));
                const known = {
                    win32: [
                        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
                        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft VS Code', 'Code.exe'),
                    ],
                    darwin: ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'],
                    linux: ['/usr/bin/code', '/snap/bin/code'],
                };
                for (const p of (known[platform] || [])) {
                    if (fs.existsSync(p)) return resolve(await run(`"${p}"`, projectPath));
                }
                resolve({ success: false, errorCode: 'NO_VSCODE', error: 'VS Code introuvable.' });
            });
        });
    });

    ipcMain.handle('os:selectVSCodeExe', async () => {
        const platform = require('os').platform();
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Localiser Visual Studio Code',
            properties: ['openFile'],
            filters: platform === 'win32'
                ? [{ name: 'Executable', extensions: ['exe', 'cmd'] }]
                : [{ name: 'Application', extensions: ['app', ''] }],
        });
        return (!result.canceled && result.filePaths[0])
            ? { success: true, path: result.filePaths[0] }
            : { success: false };
    });

    ipcMain.handle('os:launchExternalIDE', async () => ({ success: true, message: 'OK' }));

    // ── Capture d'écran (Screen sharing) ─────────────────────────────────────
    ipcMain.handle('screen:capture', async () => {
        try {
            const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
            if (sources && sources.length > 0) {
                // Retourne l'image en base64 pour envoi via WebSocket
                return sources[0].thumbnail.toDataURL(); 
            }
            return null;
        } catch (e) {
            console.error('Screen capture failed:', e);
            return null;
        }
    });

    // ── Monitoring des processus (Surveillance) ────────────────────────────────
    ipcMain.handle('monitor:getProcesses', async () => {
        const parseUnixProcessList = (text) => {
            const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const out = [];
            for (const line of lines) {
                const m = line.match(/^(\S+)\s+(\d+)\s+(\d+)\s*(.*)$/);
                if (!m) continue;
                const name = m[1];
                const pid = Number(m[2]);
                const rssKb = Number(m[3]);
                const args = (m[4] || '').trim();
                out.push({
                    Name: name,
                    Id: Number.isFinite(pid) ? pid : 0,
                    Memory: Number.isFinite(rssKb) ? Math.round((rssKb / 1024) * 10) / 10 : 0,
                    WindowTitle: args
                });
            }
            return out;
        };

        const runCmd = (command, args, timeoutMs = 8000) => new Promise((resolve) => {
            let child;
            try {
                child = spawn(command, args, { windowsHide: true });
            } catch (e) {
                resolve({ ok: false, stdout: '', stderr: e.message || String(e) });
                return;
            }
            let stdout = '';
            let stderr = '';
            child.stdout?.on('data', (d) => { stdout += d.toString(); });
            child.stderr?.on('data', (d) => { stderr += d.toString(); });
            child.on('error', (err) => resolve({ ok: false, stdout, stderr: err.message || String(err) }));
            const timer = setTimeout(() => {
                try { child.kill(); } catch (_) { }
                resolve({ ok: false, stdout, stderr: 'Timeout' });
            }, timeoutMs);
            child.on('close', (code) => {
                clearTimeout(timer);
                resolve({ ok: code === 0, stdout, stderr });
            });
        });

        // Windows: keep PowerShell pipeline (best quality on Windows)
        if (process.platform === 'win32') {
            return new Promise((resolve) => {
                const psScript = `
                    $ErrorActionPreference = 'SilentlyContinue'
                    $active = "N/A"
                    try {
                        $signature = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);'
                        $type = Add-Type -MemberDefinition $signature -Name "Win32Utils" -Namespace "Win32Monitoring" -PassThru
                        $hwnd = $type::GetForegroundWindow()
                        $sb = New-Object System.Text.StringBuilder 256
                        $null = $type::GetWindowText($hwnd, $sb, 256)
                        $active = $sb.ToString()
                    } catch {
                        $active = "Unknown"
                    }

                    try {
                        $procs = Get-Process | Where-Object { $_.Id -gt 0 } | Select-Object Name, Id, @{N='Memory';E={[math]::Round($_.WorkingSet64/1MB,1)}}, @{N='WindowTitle';E={$_.MainWindowTitle}}
                        $procsJson = $procs | ConvertTo-Json -Compress
                    } catch {
                        $procsJson = "[]"
                    }

                    $final = @{ processes = $procsJson; activeWindow = $active } | ConvertTo-Json -Compress
                    Write-Output "MONITOR_DATA_START$final"
                `;

                let child;
                try {
                    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true });
                } catch (e) {
                    try {
                        const absolutePS = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
                        child = spawn(absolutePS, ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true });
                    } catch (e2) {
                        console.error('PowerShell spawn failed:', e2);
                        return resolve({ processes: [], activeWindow: 'Error: PowerShell introuvable' });
                    }
                }

                let stdout = '';
                child.on('error', (err) => resolve({ processes: [], activeWindow: 'Error: ' + err.message }));
                child.stdout?.on('data', (d) => { stdout += d.toString(); });

                const timer = setTimeout(() => {
                    try { child.kill(); } catch (_) { }
                    resolve({ processes: [], activeWindow: 'Timeout' });
                }, 8000);

                child.on('close', () => {
                    clearTimeout(timer);
                    try {
                        const marker = "MONITOR_DATA_START";
                        const idx = stdout.indexOf(marker);
                        if (idx === -1) throw new Error("Marker not found");
                        const data = JSON.parse(stdout.substring(idx + marker.length).trim());
                        let procs = [];
                        if (data.processes) {
                            const raw = typeof data.processes === 'string' ? JSON.parse(data.processes) : data.processes;
                            procs = Array.isArray(raw) ? raw : [raw];
                        }
                        resolve({ processes: procs, activeWindow: data.activeWindow || 'N/A' });
                    } catch (e) {
                        resolve({ processes: [], activeWindow: 'Error: ' + e.message });
                    }
                });
            });
        }

        // macOS / Linux fallback: use standard POSIX tools.
        try {
            const listCmd = process.platform === 'darwin'
                ? "ps -axo comm=,pid=,rss=,args= | head -n 400"
                : "ps -eo comm=,pid=,rss=,args= --sort=-rss | head -n 400";

            const procRes = await runCmd('sh', ['-lc', listCmd], 7000);
            const processes = parseUnixProcessList(procRes.stdout);

            let activeWindow = 'N/A';
            if (process.platform === 'darwin') {
                const aw = await runCmd('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'], 4000);
                const parsed = String(aw.stdout || '').trim();
                if (parsed) activeWindow = parsed;
            } else {
                const aw = await runCmd('sh', ['-lc', 'xdotool getwindowfocus getwindowname 2>/dev/null || echo N/A'], 3000);
                const parsed = String(aw.stdout || '').trim();
                if (parsed) activeWindow = parsed;
            }

            return { processes, activeWindow };
        } catch (e) {
            return { processes: [], activeWindow: 'Error: ' + e.message };
        }
    });

    // ── Contrôle de la fenêtre (Safe Mode) ───────────────────────────────────
    ipcMain.handle('window:setLocked', async (event, locked) => {
        const win = mainWinRef || require('electron').BrowserWindow.getFocusedWindow();
        if (!win) return { success: false, error: 'Window not found' };

        try {
            if (locked) {
                win.setKiosk(true);
                win.setFullScreen(true);
                win.setAlwaysOnTop(true, 'screen-saver');
                if (typeof win.setVisibleOnAllWorkspaces === 'function') {
                    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                }
                if (typeof win.setClosable === 'function') win.setClosable(false);

                // ── Blocage des autres écrans (Multi-monitor Shield) ──
                const displays = screen.getAllDisplays();
                const primaryId = screen.getPrimaryDisplay().id;

                // Nettoyer d'abord si déjà existant
                shieldWindows.forEach(bw => !bw.isDestroyed() && bw.close());
                shieldWindows = [];

                displays.forEach(display => {
                    if (display.id === primaryId) return; // Ne pas bloquer l'écran principal

                    const shield = new BrowserWindow({
                        x: display.bounds.x,
                        y: display.bounds.y,
                        width: display.bounds.width,
                        height: display.bounds.height,
                        fullscreen: true,
                        kiosk: true,
                        alwaysOnTop: true,
                        skipTaskbar: true,
                        frame: false,
                        backgroundColor: '#000000',
                        focusable: false,
                        type: 'toolbar' // Aide à rester au dessus sur Linux/Mac
                    });

                    // Empêcher tout contenu (écran noir total)
                    shield.loadURL('data:text/html,<html><body style="background:black"></body></html>');
                    if (typeof shield.setVisibleOnAllWorkspaces === 'function') {
                        shield.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                    }
                    shieldWindows.push(shield);
                });

                // Forcer le focus si switch de bureau tenté
                win.on('blur', () => {
                    if (handlersRegistered && mainWinRef && !mainWinRef.isDestroyed()) {
                        mainWinRef.focus();
                    }
                });

            } else {
                win.setKiosk(false);
                win.setFullScreen(false);
                win.setAlwaysOnTop(false);
                if (typeof win.setVisibleOnAllWorkspaces === 'function') {
                    win.setVisibleOnAllWorkspaces(false);
                }
                if (typeof win.setClosable === 'function') win.setClosable(true);
                win.maximize();
                win.removeAllListeners('blur');

                // Supprimer les écrans de protection
                shieldWindows.forEach(bw => !bw.isDestroyed() && bw.close());
                shieldWindows = [];
            }
            return { success: true };
        } catch (e) {
            console.error('Error in setLocked:', e);
            return { success: false, error: e.message };
        }
    });

    // ── Nettoyage à la fermeture ─────────────────────────────────────────────
    app.on('before-quit', () => {
        if (csProcess && !csProcess._keepAlive) stopCodeServer();
    });
};
