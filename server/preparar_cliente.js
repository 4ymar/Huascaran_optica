const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ROOT = path.join(__dirname, '..');

rl.question('Nombre del cliente (sin espacios): ', (cliente) => {
    const destino = path.join(ROOT, 'CLIENTES', cliente);

    console.log('');
    console.log('Cliente  :', cliente);
    console.log('Ubicacion:', destino);
    console.log('');

    // Crear carpetas
    console.log('[1/6] Creando carpetas...');
    const carpetas = [
        destino,
        path.join(destino, 'server'),
        path.join(destino, 'server', 'data'),
        path.join(destino, 'server', 'data', 'backups'),
        path.join(destino, 'server', 'routes'),
        path.join(destino, 'client'),
    ];
    carpetas.forEach(c => {
        if (!fs.existsSync(c)) fs.mkdirSync(c, { recursive: true });
    });
    console.log('     OK');

    // Copiar archivos del servidor (excluir generar_clave.js)
    console.log('[2/6] Copiando servidor...');
    const serverOrigen = path.join(ROOT, 'server');
    const excluir = ['generar_clave.js', 'node_modules'];
fs.readdirSync(serverOrigen).forEach(f => {
    if (excluir.includes(f)) return;
    const src = path.join(serverOrigen, f);
    const dst = path.join(destino, 'server', f);
    const stat = fs.statSync(src);
    if (stat.isFile()) {
        fs.copyFileSync(src, dst);
        console.log('     +', f);
    } else if (stat.isDirectory() && f === 'data') {
        // Copiar carpeta data pero solo los .js, no db.json ni backups
        if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
        fs.readdirSync(src).forEach(df => {
            if (df === 'db.json' || df === 'inventario.db' || df === 'backups') return;
            fs.copyFileSync(path.join(src, df), path.join(dst, df));
            console.log('     + data\\' + df);
        });
    }
});

    // Copiar rutas
    console.log('[3/6] Copiando rutas...');
    const routesOrigen = path.join(ROOT, 'server', 'routes');
    const routesDestino = path.join(destino, 'server', 'routes');
    fs.readdirSync(routesOrigen).forEach(f => {
        fs.copyFileSync(path.join(routesOrigen, f), path.join(routesDestino, f));
        console.log('     + routes\\' + f);
    });

    // Generar inventario.db limpio localmente en lugar de db.json
    console.log('[4/6] Creando base de datos limpia SQLite...');
    try {
        const { execSync } = require('child_process');
        execSync(`node -e "require('./data/database.js')"`, { cwd: path.join(destino, 'server') });
    } catch (e) {
        console.log('     ADVERTENCIA: No se pudo auto-generar la BD local. Se creara en el cliente.');
    }
    console.log('     OK');

    // Copiar client/src recursivamente
    console.log('[5/6] Copiando interfaz...');
    function copiarDir(src, dst) {
        if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
        fs.readdirSync(src).forEach(f => {
            if (f === 'node_modules' || f === 'dist') return;
            const srcPath = path.join(src, f);
            const dstPath = path.join(dst, f);
            if (fs.statSync(srcPath).isDirectory()) {
                copiarDir(srcPath, dstPath);
            } else {
                fs.copyFileSync(srcPath, dstPath);
            }
        });
    }
    copiarDir(path.join(ROOT, 'client'), path.join(destino, 'client'));
    console.log('     OK');

    // Copiar archivos de inicio
    console.log('[6/6] Copiando archivos de inicio...');
    const archivosInicio = [
        'INSTALAR.bat',
        'INICIAR_SISTEMA.bat',
        'APAGAR_SISTEMA.bat',
        'LEER_ANTES_DE_INSTALAR.txt'
    ];
    archivosInicio.forEach(f => {
        const src = path.join(ROOT, f);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(destino, f));
            console.log('     +', f);
        }
    });

    // Registrar cliente
    const registro = path.join(ROOT, 'CLIENTES', 'registro_clientes.txt');
    fs.appendFileSync(registro, `${cliente} - ${new Date().toLocaleString('es-PE')}\n`);

    // Verificar resultado
    console.log('');
    console.log('============================================');
    console.log(' VERIFICACION FINAL');
    console.log('============================================');
    const verificar = [
        ['INSTALAR.bat',              path.join(destino, 'INSTALAR.bat')],
        ['INICIAR_SISTEMA.bat',       path.join(destino, 'INICIAR_SISTEMA.bat')],
        ['server\\index.js',          path.join(destino, 'server', 'index.js')],
        ['server\\licencia.js',       path.join(destino, 'server', 'licencia.js')],
        ['server\\data\\inventario.db', path.join(destino, 'server', 'data', 'inventario.db')],
        ['client\\src',               path.join(destino, 'client', 'src')],
    ];
    verificar.forEach(([nombre, ruta]) => {
        const existe = fs.existsSync(ruta);
        console.log(` ${existe ? 'OK' : 'FALTA'} - ${nombre}`);
    });

    const genClave = path.join(destino, 'server', 'generar_clave.js');
    console.log(` ${!fs.existsSync(genClave) ? 'OK' : 'ALERTA'} - generar_clave.js ${!fs.existsSync(genClave) ? 'excluido' : 'INCLUIDO - ELIMINAR'}`);

    console.log('');
    console.log(' Carpeta lista en:');
    console.log(' ' + destino);
    console.log('============================================');
    console.log('');

    rl.close();
});