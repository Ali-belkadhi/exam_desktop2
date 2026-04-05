const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const setupIpcHandlers = require('./ipcHandlers');

// Allow webview to load local/code-server pages
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('ignore-certificate-errors');

let mainWindow;

/**
 * Exécute une commande système et retourne son résultat sous forme de chaîne.
 * Ne crash pas si la commande échoue.
 * @param {string} command - La commande à exécuter (wmic, sysctl, etc.).
 * @returns {Promise<string>} Le résultat (stdout) ou une chaîne vide en cas d'erreur.
 */
function runCommand(command) {
  return new Promise((resolve) => {
    exec(command, (error, stdout) => {
      // En cas d'erreur (commande introuvable, par exemple), on retourne une chaîne vide
      if (error) {
        resolve('');
      } else {
        // Retourne le résultat en minuscules pour faciliter la comparaison
        resolve((stdout || '').toLowerCase());
      }
    });
  });
}

/**
 * Détecte de manière légitime si l'application tourne dans une machine virtuelle (VM).
 * Utilise des commandes natives selon le système d'exploitation.
 * @returns {Promise<boolean>} true si une VM est détectée, false sinon.
 */
async function isLikelyVirtualMachine() {
  try {
    const platform = process.platform;
    const vmKeywords = ['vmware', 'virtualbox', 'qemu', 'kvm', 'parallels', 'hyper-v', 'bochs', 'xen'];

    if (platform === 'win32') {
      // Sous Windows : vérification du fabricant et du modèle du système
      const output = await runCommand('wmic computersystem get model,manufacturer');
      return vmKeywords.some(keyword => output.includes(keyword));
    } 
    else if (platform === 'linux') {
      // 1. Outil standard systemd-detect-virt
      let output = await runCommand('systemd-detect-virt');
      if (output && !output.includes('none')) {
        if (vmKeywords.some(keyword => output.includes(keyword))) return true;
      }

      // 2. Fallback classique: hostnamectl
      let hostctl = await runCommand('hostnamectl');
      if (hostctl && vmKeywords.some(keyword => hostctl.toLowerCase().includes(keyword))) {
        return true;
      }

      // 3. Fallback en dur: fichiers système DMI (Très fiable pour VMware et VirtualBox)
      try {
        const fs = require('fs');
        const productName = fs.existsSync('/sys/class/dmi/id/product_name') ? fs.readFileSync('/sys/class/dmi/id/product_name', 'utf8').toLowerCase() : '';
        const sysVendor = fs.existsSync('/sys/class/dmi/id/sys_vendor') ? fs.readFileSync('/sys/class/dmi/id/sys_vendor', 'utf8').toLowerCase() : '';
        if (vmKeywords.some(kw => productName.includes(kw) || sysVendor.includes(kw))) {
          return true;
        }
      } catch (e) {
        // Ignorer les erreurs de lecture
      }

      return false;
    } 
    else if (platform === 'darwin') {
      // Sous macOS : vérification du modèle matériel (ex: VMware7,1)
      const hwModel = await runCommand('sysctl -n hw.model');
      if (vmKeywords.some(keyword => hwModel.includes(keyword))) {
        return true;
      }
      // Vérification moderne pour détecter un hyperviseur sous macOS
      const isVmm = await runCommand('sysctl -n kern.hv_vmm_present');
      if (isVmm.trim() === '1') {
        return true;
      }
      return false;
    }
    
    // Si la plateforme est non supportée, on retourne false par défaut
    return false;
  } catch (error) {
    console.error('Erreur inattendue lors de la détection de VM:', error);
    // En cas de crash inattendu de la fonction, on autorise le lancement pour ne pas bloquer l'utilisateur de manière erronée
    return false; 
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,          // nécessaire pour <webview>
      webSecurity: false,        // permet le chargement de localhost:PORT dans webview
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/login.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Passer mainWindow aux handlers IPC (requis pour push events code-server)
  setupIpcHandlers(ipcMain, mainWindow);
}

app.whenReady().then(async () => {
  // Vérification de l'environnement (Rejet des Machines Virtuelles)
  const isVM = await isLikelyVirtualMachine();
  
  if (isVM) {
    // Affiche un message d'erreur natif avec Electron dialog
    dialog.showErrorBox(
      'Environnement non supporté',
      'L\'exécution de cette application dans une machine virtuelle (VM) n\'est pas autorisée pour des raisons de sécurité de l\'examen.'
    );
    // Ferme l'application proprement
    app.quit();
    return; // Arrêt de l'exécution
  }

  // Lancement normal si environnement valide
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
