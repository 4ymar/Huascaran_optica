const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const { autoUpdater } = require('electron-updater');

app.setPath('userData', path.join(app.getPath('appData'), 'OpticaPOS'));

// ── PREVENCIÓN DE INSTANCIAS DUPLICADAS ─────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

const isDev = !app.isPackaged;

// ── LOG A ARCHIVO ──────────────────────────────────────────
const logPath = path.join(app.getPath('userData'), 'app.log');
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    console.log(msg);
    try { fs.appendFileSync(logPath, line); } catch (_) { }
}

log('=== INICIANDO HUASCARAN ===');
log(`isDev: ${isDev}`);
log(`userData: ${app.getPath('userData')}`);
log(`resourcesPath: ${process.resourcesPath || 'N/A'}`);
const startupStartedAt = Date.now();

function startupMark(label) {
    log(`[STARTUP] ${label}: ${Date.now() - startupStartedAt}ms`);
}

let mainWindow;
let splashWindow;
let serverProcess = null; // proceso hijo del backend Express (ver iniciarServidorYVentana)
let isQuitting = false;

// ── Abrir URL externa en el navegador del sistema ──────────
// window.open() en Electron abre una ventana de Electron, no el navegador.
// La forma correcta es shell.openExternal() desde el proceso principal.
ipcMain.handle('open-external', async (_event, url) => {
    try {
        await shell.openExternal(url);
        return { ok: true };
    } catch (err) {
        log('Error abriendo URL externa: ' + err.message);
        return { ok: false, error: err.message };
    }
});

// ── Abrir PDF con visor nativo del sistema ─────────────────
const os = require('os');
ipcMain.handle('open-pdf', async (_event, { base64, anchoMM, filename }) => {
    try {
        const tmpPdf = path.join(os.tmpdir(), filename || `comprobante_${Date.now()}.pdf`);
        fs.writeFileSync(tmpPdf, Buffer.from(base64, 'base64'));
        fs.writeFileSync(path.join(os.tmpdir(), 'ticket_jspdf.pdf'), Buffer.from(base64, 'base64'));
        await shell.openPath(tmpPdf);
        return { ok: true };
    } catch (err) {
        log('Error abriendo PDF: ' + err.message);
        return { ok: false, error: err.message };
    }
});

// ── Guardar CSV con diálogo nativo de Electron ─────────────
const { dialog } = require('electron');

ipcMain.handle('save-csv', async (_event, { content, suggestedName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Guardar archivo CSV',
        defaultPath: suggestedName,
        filters: [{ name: 'Archivo CSV', extensions: ['csv'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return { ok: true };
    } catch (err) {
        log('Error guardando CSV: ' + err.message);
        return { ok: false, error: err.message };
    }
});

// ── Guardar Excel con diálogo nativo de Electron ───────────
ipcMain.handle('save-excel', async (_event, { buffer, suggestedName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Guardar archivo Excel',
        defaultPath: suggestedName,
        filters: [{ name: 'Archivo Excel', extensions: ['xlsx'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
        fs.writeFileSync(filePath, Buffer.from(buffer, 'base64'));
        return { ok: true };
    } catch (err) {
        log('Error guardando Excel: ' + err.message);
        return { ok: false, error: err.message };
    }
});

// ── Guardar PDF con diálogo nativo de Electron ─────────────
ipcMain.handle('save-pdf-dialog', async (_event, { buffer, suggestedName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Guardar reporte PDF',
        defaultPath: suggestedName,
        filters: [{ name: 'Archivo PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
        fs.writeFileSync(filePath, Buffer.from(buffer, 'base64'));
        return { ok: true };
    } catch (err) {
        log('Error guardando PDF: ' + err.message);
        return { ok: false, error: err.message };
    }
});

// ── Seleccionar imagen con diálogo nativo ───────────────────
ipcMain.handle('select-image', async (_event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Seleccionar logo',
        filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg'] }],
        properties: ['openFile']
    });
    if (canceled || !filePaths.length) return { ok: false, canceled: true };
    try {
        const buffer = fs.readFileSync(filePaths[0]);
        const ext = path.extname(filePaths[0]).replace('.', '').toLowerCase();
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        const base64 = `data:${mime};base64,${buffer.toString('base64')}`;
        return { ok: true, base64 };
    } catch (err) {
        log('Error leyendo imagen: ' + err.message);
        return { ok: false, error: err.message };
    }
});

// ── Imprimir ticket térmico o generar PDF para vista previa ─────────────
ipcMain.handle('print-ticket', async (_event, { html, silent, anchoMM }) => {
    let ticketWin = null;
    try {
        ticketWin = new BrowserWindow({
            width: 400,
            height: 800,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
            },
        });

        // Cargar HTML directo como data URL — sin archivo temporal
        const tmpHtml = path.join(os.tmpdir(), `ticket_${Date.now()}.html`);
        fs.writeFileSync(tmpHtml, html, 'utf-8');
        await ticketWin.loadFile(tmpHtml);

        // Esperar renderizado completo
        await new Promise(resolve => setTimeout(resolve, 1200));

        if (silent) {
            await new Promise((resolve, reject) => {
                ticketWin.webContents.print(
                    { silent: true, printBackground: true, deviceName: '' },
                    (success, reason) => success ? resolve() : reject(new Error(reason))
                );
            });
            return { ok: true, mode: 'print' };
        } else {
            const scrollHeight = await ticketWin.webContents.executeJavaScript('document.body.scrollHeight');
            const anchoUm = (parseInt(anchoMM) || 80) * 1000;
            const altoUm  = Math.round(scrollHeight * 25400 / 96);
            log(`scrollHeight: ${scrollHeight}px → alto: ${altoUm}um, ancho: ${anchoUm}um`);
            const bodyHeight = await ticketWin.webContents.executeJavaScript('document.body.getBoundingClientRect().height');
            log(`bodyHeight: ${bodyHeight}px`);

            const pdfBuffer = await ticketWin.webContents.printToPDF({
                printBackground: true,
                marginsType: 1,
                pageSize: { width: Math.round(anchoUm), height: Math.round(altoUm) },
            });
            log('pdfBuffer size: ' + pdfBuffer.length + ' bytes');
            try { fs.unlinkSync(tmpHtml); } catch (_) {}
            return {
                ok:     true,
                mode:   'preview',
                base64: pdfBuffer.toString('base64'),
            };
        }
    } catch (err) {
        log('Error generando ticket: ' + err.message);
        return { ok: false, error: err.message };
    } finally {
        setTimeout(() => {
            if (ticketWin && !ticketWin.isDestroyed()) ticketWin.destroy();
        }, 3000);
    }
});
// ── CONTROL DE VERIFICACIÓN SEMANAL ──────────────────────────
const updateCheckFile = path.join(app.getPath('userData'), 'last-update-check.json');

function getLastCheckDate() {
    try {
        if (!fs.existsSync(updateCheckFile)) return null;
        const data = JSON.parse(fs.readFileSync(updateCheckFile, 'utf-8'));
        return data.lastCheck ? new Date(data.lastCheck) : null;
    } catch (_) { return null; }
}

function saveLastCheckDate() {
    try {
        fs.writeFileSync(updateCheckFile, JSON.stringify({ lastCheck: new Date().toISOString() }), 'utf-8');
    } catch (err) { log('Error guardando fecha de check: ' + err.message); }
}

function debeVerificarSemana() {
    const last = getLastCheckDate();
    if (!last) return true;
    const diasDesdeUltimo = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
    return diasDesdeUltimo >= 14; // 14 días
}

// ── GATE DE ACTUALIZACIONES DIRIGIDAS ────────────────────────
const WORKER_URL = 'https://huascaran-update-gate.huascaran.workers.dev';

async function clientePuedeActualizar() {
    try {
        const respLicencia = await fetch('http://localhost:3030/api/licencia/estado');
        const { clientId } = await respLicencia.json();
        if (!clientId) return true;

        const respGate = await fetch(`${WORKER_URL}?clientId=${encodeURIComponent(clientId)}`);
        const { permitido } = await respGate.json();
        return permitido !== false;
    } catch (err) {
        log('Error consultando gate de actualizaciones: ' + err.message);
        return false;
    }
}

async function verificarReinicioSeguroParaActualizar(token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const resp = await fetch('http://localhost:3030/api/sistema/estado-actualizacion', { headers });
    let data = null;
    try {
        data = await resp.json();
    } catch (_) {}
    if (!resp.ok || !data?.ok) {
        const detalle = data?.error || `HTTP ${resp.status}`;
        return {
            ok: false,
            bloqueado: true,
            bloqueos: [`No se pudo verificar si es seguro reiniciar (${detalle}).`],
        };
    }
    return {
        ok: true,
        bloqueado: data.puede_actualizar === false,
        bloqueos: data.bloqueos || [],
    };
}

// ── CONFIGURACIÓN DE ACTUALIZACIONES ─────────────────────────
autoUpdater.autoDownload = false;
autoUpdater.logger = {
    info: (msg) => log(`[Updater Info] ${msg}`),
    warn: (msg) => log(`[Updater Warn] ${msg}`),
    error: (msg) => log(`[Updater Error] ${msg}`)
};

// Eventos de autoUpdater para notificar a la ventana principal
autoUpdater.on('checking-for-update', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', { state: 'checking' });
    }
});

autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', { state: 'available', info });
    }
});

autoUpdater.on('update-not-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', { state: 'not-available', info });
    }
});

autoUpdater.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', { state: 'error', error: err.message });
    }
});

autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', { state: 'downloading', progress: progressObj });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', { state: 'downloaded', info });
    }
});

// ── IPC HANDLERS PARA ACTUALIZACIONES Y SOPORTE ──────────────
ipcMain.handle('updater:check', async () => {
    // Check normal (respeta la restricción semanal — usado por Bienvenida al escuchar)
    try {
        if (!(await clientePuedeActualizar())) {
            log('Chequeo omitido: cliente no habilitado por el gate');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('updater:status', { state: 'not-available' });
            }
            return { ok: true, result: null };
        }
        const result = await autoUpdater.checkForUpdates();
        return { ok: true, result };
    } catch (err) {
        log('Error checking updates: ' + err.message);
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('updater:check-forced', async () => {
    // Check forzado desde Configuración — ignora la semana, guarda nueva fecha
    try {
        saveLastCheckDate();
        if (!(await clientePuedeActualizar())) {
            log('Chequeo forzado omitido: cliente no habilitado por el gate');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('updater:status', { state: 'not-available' });
            }
            return { ok: true, result: null };
        }
        const result = await autoUpdater.checkForUpdates();
        return { ok: true, result };
    } catch (err) {
        log('Error checking updates (forced): ' + err.message);
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('updater:download', async () => {
    try {
        const result = await autoUpdater.downloadUpdate();
        return { ok: true, result };
    } catch (err) {
        log('Error downloading update: ' + err.message);
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('updater:install', async (_event, options = {}) => {
    try {
        const estado = await verificarReinicioSeguroParaActualizar(options.token);
        if (estado.bloqueado && !options.force) {
            const mensaje = estado.bloqueos.length
                ? estado.bloqueos.join('\n')
                : 'Hay operaciones críticas en curso.';
            log('Instalación de actualización bloqueada: ' + mensaje);
            return {
                ok: false,
                bloqueado: true,
                bloqueos: estado.bloqueos,
                error: `No se puede instalar la actualización todavía.\n${mensaje}`,
            };
        }
        autoUpdater.quitAndInstall();
        return { ok: true };
    } catch (err) {
        log('Error installing update: ' + err.message);
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('save-support-zip', async (_event, { tempZipPath }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Guardar paquete de soporte',
        defaultPath: `huascaran_soporte_${Date.now()}.zip`,
        filters: [{ name: 'Archivo ZIP', extensions: ['zip'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
        fs.copyFileSync(tempZipPath, filePath);
        try { fs.unlinkSync(tempZipPath); } catch (_) {}
        return { ok: true };
    } catch (err) {
        log('Error guardando paquete de soporte: ' + err.message);
        return { ok: false, error: err.message };
    }
});

function mostrarErrorInicioServidor() {
    log('Mostrando diálogo de error: el servidor no respondió a tiempo.');
    cerrarSplash();
    const boton = dialog.showMessageBoxSync({
        type: 'error',
        title: 'Huascarán',
        message: 'El sistema no pudo iniciar',
        detail: 'El servidor interno no respondió a tiempo. Esto puede pasar si la máquina está muy cargada o si hay otra instancia de Huascarán abierta.\n\nLog: ' + logPath,
        buttons: ['Reintentar', 'Cerrar'],
        defaultId: 0,
        cancelId: 1,
    });
    if (boton === 0) {
        createSplashWindow();
        splashWindow.webContents.once('did-finish-load', () => {
            iniciarServidorYVentana();
        });
    } else {
        app.quit();
    }
}

function createSplashWindow() {
    const splashPath = path.join(__dirname, 'splash.html');
    log(`splashPath: ${splashPath}`);
    log(`splashPath existe: ${fs.existsSync(splashPath)}`);

    splashWindow = new BrowserWindow({
        width: 520,
        height: 360,
        frame: false,
        resizable: false,
        show: false,
        backgroundColor: '#0a1628',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    log('splashWindow: instancia creada (new BrowserWindow)');

    splashWindow.once('ready-to-show', () => {
        log('splashWindow: ready-to-show, mostrando');
        splashWindow.show();
        forzarPrimerPlano(splashWindow);
    });

    splashWindow.webContents.on('did-fail-load', (_e, code, desc) => {
        log(`ERROR splash did-fail-load: ${code} ${desc}`);
    });

    log('splashWindow: llamando loadFile...');
    splashWindow.loadFile(splashPath).then(() => {
        log('splashWindow: loadFile PROMISE resuelta');
    }).catch(err => {
        log(`ERROR splash loadFile: ${err.message}`);
    });
}

function cerrarSplash() {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
    }
}

function forzarPrimerPlano(win) {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    app.focus({ steal: true }); // API oficial de Electron para robar el foco en Windows/Linux
    win.show();
    win.setAlwaysOnTop(true);
    win.focus();
    win.setAlwaysOnTop(false);
}

function createWindow() {
        ventanaMostrada = false;
        mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false,
        frame: false,
        opacity: 0, // arranca invisible; mostrarVentanaLista() la sube con un fundido
        backgroundColor: '#0a1628',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'icon.ico')
    });

    mainWindow.maximize(); // se maximiza oculta, antes de cargar contenido —
                            // así el primer paint ya ocurre al tamaño final,
                            // sin resize posterior que exponga área sin pintar
    mainWindow.loadURL('http://localhost:3030');

    if (process.env.HUASCARAN_OPEN_DEVTOOLS === '1') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.once('ready-to-show', () => {
        log('mainWindow: ready-to-show disparado');
        // Resguardo: si el renderer no confirma estar listo (ver 'app-render-ready'
        // en preload.js/App.jsx), mostramos igual a los 5s para no dejar la app colgada.
        setTimeout(mostrarVentanaLista, 5000);
    });

    mainWindow.on('close', (e) => {
        if (isQuitting) return; // segunda pasada (la real): dejar que se cierre
        e.preventDefault();
        let yaSalio = false;
        const salir = () => {
            if (yaSalio) return;
            yaSalio = true;
            isQuitting = true;
            app.quit();
        };
        if (serverProcess && !serverProcess.killed) {
            serverProcess.once('message', (msg) => {
                if (msg === 'server-shutdown-complete') salir();
            });
            try {
                serverProcess.send('shutdown');
            } catch (_) {
                salir();
            }
        } else {
            salir();
        }
        setTimeout(salir, 2500); // resguardo si el servidor no confirma a tiempo
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window-maximized-change', true);
    });
    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window-maximized-change', false);
    });
}

// ── Controles de ventana (minimizar / maximizar-restaurar / cerrar) ───────
// mainWindow.close() dispara el listener 'close' de arriba, que ya maneja
// el backup final antes de cerrar — por eso no se usa destroy() aquí.
ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize();
});

ipcMain.handle('window-maximize-toggle', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});

ipcMain.handle('window-close', () => {
    mainWindow?.close();
});

// ── Exponer versión de la app al renderer ──────────────────
ipcMain.handle('get-app-version', () => app.getVersion());

// ── Log del renderer, unificado con app.log ─────────────────
ipcMain.handle('renderer-log', (_event, msg) => {
    log(`[RENDERER] ${msg}`);
});

// ── Mostrar ventana solo cuando el renderer ya pintó su contenido real ────
// Evita la franja en blanco al maximizar antes de que React/CSS terminen
// de renderizar (ver diagnóstico previo).
let ventanaMostrada = false;

function mostrarVentanaLista() {
    if (ventanaMostrada || !mainWindow) return;
    ventanaMostrada = true;
    mainWindow.show(); // ya está maximizada desde createWindow(), no hace falta repetirlo
    forzarPrimerPlano(mainWindow); // vence el foreground lock de Windows

    // Fundido de opacidad en vez de aparición abrupta. La ventana ya se mostró
    // con opacity:0 (invisible), acá la subimos en pasos cortos — se aplica a
    // nivel de ventana nativa, así que funciona igual sea Bienvenida, Login,
    // o cualquier otra pantalla la que esté cargada en ese momento.
    const DURACION_MS = 220;
    const PASOS = 12;
    let paso = 0;
    const fundido = setInterval(() => {
        paso++;
        if (!mainWindow || mainWindow.isDestroyed()) { clearInterval(fundido); return; }
        mainWindow.setOpacity(Math.min(1, paso / PASOS));
        if (paso >= PASOS) clearInterval(fundido);
    }, DURACION_MS / PASOS);

    // Colchón: el splash queda encima un instante más para tapar cualquier
    // frame sin componer del compositor de Windows durante el show().
    setTimeout(cerrarSplash, 200);
}

ipcMain.handle('app-render-ready', () => {
    log('renderer: app-render-ready recibido');
    mostrarVentanaLista();
});

app.whenReady().then(() => {

    createSplashWindow();

    // ── CSP: definir política de seguridad de contenido ───────────────────────
    // Elimina la advertencia "Insecure Content-Security-Policy" de Electron.
    // Se aplica ANTES de crear la ventana para que cubra todas las peticiones.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        if (details.url.startsWith('file://')) {
            return callback({ responseHeaders: details.responseHeaders });
        }
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    [
                        "default-src 'self' http://localhost:3030",
                        "script-src 'self' 'unsafe-inline' http://localhost:3030",
                        "style-src 'self' 'unsafe-inline' http://localhost:3030 https://fonts.googleapis.com",
                        "style-src-elem 'self' 'unsafe-inline' http://localhost:3030 https://fonts.googleapis.com",
                        "img-src 'self' data: blob: http://localhost:3030",
                        "connect-src 'self' http://localhost:3030 ws://localhost:3030",
                        "font-src 'self' data: https://fonts.gstatic.com http://localhost:3030",
                    ].join('; ')
                ]
            }
        });
    });
    // ─────────────────────────────────────────────────────────────────────────

    function iniciarServidorYVentana() {
        const serverPath = isDev
            ? path.join(__dirname, '../server/index.js')
            : path.join(process.resourcesPath, 'server/index.js');

        const dbPath = isDev
            ? path.join(__dirname, '../server/data/inventario.db')
            : path.join(app.getPath('userData'), 'inventario.db');

        const backupDir = isDev
            ? path.join(__dirname, '../server/data/backups')
            : path.join(app.getPath('userData'), 'backups');

        const clientDist = isDev
            ? path.join(__dirname, '../client/dist')
            : path.join(process.resourcesPath, 'client/dist');

        const serverModulesPath = isDev
        ? path.join(__dirname, '../server/node_modules')
        : path.join(process.resourcesPath, 'server/node_modules');

        log(`serverPath: ${serverPath}`);
        log(`serverPath existe: ${fs.existsSync(serverPath)}`);
        log(`dbPath: ${dbPath}`);
        log(`clientDist: ${clientDist}`);
        log(`clientDist existe: ${fs.existsSync(clientDist)}`);
        log(`node_modules existe: ${fs.existsSync(serverModulesPath)}`);

        const sqlitePath = path.join(serverModulesPath, 'better-sqlite3');
        log(`better-sqlite3 existe: ${fs.existsSync(sqlitePath)}`);

        process.env.IS_ELECTRON = 'true';
        process.env.DB_PATH = dbPath;
        process.env.BACKUP_DIR = backupDir;
        process.env.CLIENT_DIST = clientDist;
        process.env.NODE_PATH = serverModulesPath;
        process.env.LOG_PATH = logPath;
        process.env.APP_VERSION = app.getVersion();

        log('Iniciando servidor en proceso principal...');
        startupMark('antes de fork(server)');

        // ── Servidor en proceso hijo ────────────────────────────────────────
        // Antes: require(serverPath) bloqueaba el hilo de UI del proceso
        // principal durante todo el arranque, impidiendo repintar el splash.
        // Ahora: el servidor corre en su propio proceso del SO, en paralelo,
        // y el splash queda libre para seguir animándose mientras arranca.
        serverProcess = fork(serverPath, [], {
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });

        serverProcess.stdout.on('data', (data) => process.stdout.write(`[server] ${data}`));
        serverProcess.stderr.on('data', (data) => process.stderr.write(`[server] ${data}`));

        let servidorFalloAlArrancar = false;
        serverProcess.once('error', (err) => {
            servidorFalloAlArrancar = true;
            log(`ERROR iniciando servidor (proceso hijo): ${err.message}`);
            mainWindow = new BrowserWindow({ width: 600, height: 300 });
            mainWindow.loadURL(`data:text/html,<h2>Error al iniciar servidor</h2><p>${err.message}</p><p>Log: <b>${logPath}</b></p>`);
            mainWindow.show();
            cerrarSplash();
        });

        serverProcess.once('exit', (code) => {
            if (servidorFalloAlArrancar || mainWindow) return;
            log(`ERROR: el proceso del servidor terminó inesperadamente (code ${code})`);
            mainWindow = new BrowserWindow({ width: 600, height: 300 });
            mainWindow.loadURL(`data:text/html,<h2>El servidor se cerró inesperadamente</h2><p>Código: ${code}</p><p>Log: <b>${logPath}</b></p>`);
            mainWindow.show();
            cerrarSplash();
        });

        log('Servidor iniciado correctamente (fork)');
        startupMark('despues de fork(server)');

        const { net } = require('electron');

        function esperarServidor(intentos = 0) {
            if (intentos > 90) { // máximo 45 segundos
                log('Servidor no respondió a tiempo tras 45s. Mostrando error al usuario.');
                mostrarErrorInicioServidor();
                return;
            }
            const req = net.request('http://localhost:3030/api/health');
            req.on('response', (res) => {
                if (res.statusCode === 200) {
                    log(`Servidor listo en intento ${intentos + 1}`);
                    createWindow();
                } else {
                    setTimeout(() => esperarServidor(intentos + 1), 500);
                }
            });
            req.on('error', () => {
                setTimeout(() => esperarServidor(intentos + 1), 500);
            });
            req.end();
        }

        log('Esperando que el servidor esté listo...');
        esperarServidor();

        // Verificar actualizaciones solo en producción
        if (app.isPackaged && debeVerificarSemana()) {
            setTimeout(async () => {
                saveLastCheckDate();
                if (!(await clientePuedeActualizar())) {
                    log('Chequeo automático omitido: cliente no habilitado por el gate');
                    return;
                }
                autoUpdater.checkForUpdates().catch(err => {
                    log('Error al verificar actualizaciones: ' + err.message);
                });
            }, 8000);
        }
    }

        let splashPintado = false;
    let splashCargado  = false;
    function intentarArrancarServidor() {
        if (!splashPintado || !splashCargado) return;
        // Da un pequeño respiro al compositor de Windows para que el splash
        // se termine de mostrar antes de bloquear el proceso con require(server).
        setTimeout(iniciarServidorYVentana, 50);
    }

    splashWindow.once('ready-to-show', () => {
        splashPintado = true;
        intentarArrancarServidor();
    });

    splashWindow.webContents.once('did-finish-load', () => {
        log('splashWindow: evento did-finish-load disparado');
        splashCargado = true;
        intentarArrancarServidor();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
