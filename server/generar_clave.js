const { createSign } = require('crypto');
const fs = require('fs');
const privateKey = fs.readFileSync('D:\\DESARROLLO_APP\\Sistema de Gestion\\Licencia\\Claves\\privada.pem', 'utf-8');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function pregunta(texto) {
    return new Promise(resolve => rl.question(texto, resolve));
}

function calcularFecha(opcion) {
    const hoy = new Date();
    switch (opcion) {
        case '1': {
            hoy.setDate(hoy.getDate() + 1);
            break;
        }
        case '2': {
            hoy.setDate(hoy.getDate() + 7);
            break;
        }
        case '3': {
            hoy.setMonth(hoy.getMonth() + 1);
            break;
        }
        case '4': {
            hoy.setMonth(hoy.getMonth() + 6);
            break;
        }
        case '5': {
            hoy.setFullYear(hoy.getFullYear() + 1);
            break;
        }
        default:
            return null;
    }
    // Formato YYYY-MM-DD
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function generarClientId(empresa) {
    const slug = empresa
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 20);
    const sufijo = require('crypto').randomBytes(2).toString('hex').toUpperCase();
    return `${slug}-${sufijo}`;
}

async function main() {
    console.log('');
    console.log('  ============================================');
    console.log('   GENERADOR DE CLAVES DE LICENCIA');
    console.log('   Sistema Huascaran - GiraDevs');
    console.log('  ============================================');
    console.log('');

    const machineId = (await pregunta('  Codigo de maquina del cliente : ')).trim();
    const empresa   = (await pregunta('  Nombre exacto de la empresa   : ')).trim();
    const clientId  = generarClientId(empresa);
    console.log(`  Codigo de cliente asignado     : ${clientId}`);

    console.log('');
    console.log('  Tipo de licencia:');
    console.log('  -----------------------------------------');
    console.log('  [1] Prueba  -  1 dia');
    console.log('  [2] Prueba  -  1 semana');
    console.log('  [3] Prueba  -  1 mes');
    console.log('  [4] Prueba  -  6 meses');
    console.log('  [5] Prueba  -  1 anio');
    console.log('  [6] Fecha personalizada (YYYY-MM-DD)');
    console.log('  [7] PERMANENTE');
    console.log('  -----------------------------------------');
    console.log('');

    let fechaExpira = null;

    while (fechaExpira === null) {
        const opcion = (await pregunta('  Elige una opcion [1-7] : ')).trim();

        if (['1', '2', '3', '4', '5'].includes(opcion)) {
            fechaExpira = calcularFecha(opcion);
        } else if (opcion === '6') {
            const fechaIngresada = (await pregunta('  Ingresa la fecha (YYYY-MM-DD) : ')).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(fechaIngresada)) {
                fechaExpira = fechaIngresada;
            } else {
                console.log('');
                console.log('  ! Formato invalido. Usa YYYY-MM-DD (ej: 2026-12-31)');
                console.log('');
            }
        } else if (opcion === '7') {
            fechaExpira = 'PERMANENTE';
        } else {
            console.log('');
            console.log('  ! Opcion invalida. Elige entre 1 y 7.');
            console.log('');
        }
    }

    const payload = JSON.stringify({ empresa, machineId, fechaExpira, clientId });
    const sign    = createSign('SHA256');
    sign.update(payload);
    const firma   = sign.sign(privateKey, 'base64');
    const clave   = Buffer.from(JSON.stringify({ payload, firma })).toString('base64');

    console.log('');
    console.log('  ============================================');
    console.log('  CLAVE GENERADA:');
    console.log('  ' + clave);
    console.log('  ============================================');
    console.log('  Empresa  : ' + empresa);
    console.log('  Cliente  : ' + clientId);
    console.log('  Expira   : ' + fechaExpira);
    console.log('  ============================================');
    console.log('');

    
    const destino = (await pregunta('  Guardar clave en (ruta o Enter para carpeta actual): ')).trim();
    const carpeta = destino || '.';
    const nombreArchivo = `clave_${empresa.replace(/\s+/g, '_')}_${fechaExpira}.txt`;
    const rutaFinal = require('path').join(carpeta, nombreArchivo);

    const contenido = [
        '============================================',
        ' CLAVE DE ACTIVACION - SISTEMA HUASCARAN',
        '============================================',
        ` Empresa  : ${empresa}`,
        ` Cliente  : ${clientId}`,
        ` Expira   : ${fechaExpira}`,
        ` MachineId: ${machineId}`,
        '--------------------------------------------',
        clave,
        '============================================',
    ].join('\r\n');

    fs.writeFileSync(rutaFinal, contenido, 'utf-8');
    console.log('  Archivo guardado en: ' + rutaFinal);
    
    rl.close();
}

main();