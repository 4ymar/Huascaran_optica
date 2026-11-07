const router = require('express').Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('../data/database');

// ── Resolución del módulo de licencia (mismo patrón que index.js: prioriza .jsc compilado) ──
const LICENCIA_MOD = fs.existsSync(path.join(__dirname, '..', 'licencia.jsc'))
    ? '../licencia.jsc'
    : '../licencia.js';
const { getMachineId } = require(LICENCIA_MOD);

// ── Llave pública EXCLUSIVA de recuperación (independiente de la de licencias) ──
const PUBLIC_KEY_RECUPERACION = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6veob/Fkqg46AMHE46Td
UzPTCRpIg+u4IxK1zkwof+q5cHYaO4j/403EzXWx71LmMggWnsZdsQqLdXutduuh
/QEWraPT02Z5TnUx0X76bAjZcwINBpXtVVU/fjW5cytBb3ApYtqjcnPQivYuLRdp
gv7ikYf+pXtBd9SE8unrJ9fRoM4eZchYz/dlg/UbsND1PddgbI259CqrU/yUd7XP
bja1n/39OjAxjIZ871zqYUZpxidgr4A3mNZkeeqGCiCD5WlDQCrclI31vQu4buM4
mFUccjWm4Nl3b4uiGhzMXDByVHmwPUnoPcQj9qI6wzesLRSfSk/4/BJIuGCs/EAK
TwIDAQAB
-----END PUBLIC KEY-----`;

// ══════════════════════════════════════════════════════════════
//  Decodifica y valida un código de recuperación:
//  - firma RSA válida contra PUBLIC_KEY_RECUPERACION
//  - machineId coincide con el de esta máquina
//  - no expiró (payload.exp)
//  Lanza Error con mensaje apto para mostrar al usuario si falla.
// ══════════════════════════════════════════════════════════════
function validarCodigo(codigo) {
    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(String(codigo || '').trim(), 'base64').toString('utf-8'));
    } catch (_) {
        throw new Error('Código inválido o corrupto.');
    }

    const { payload, firma } = decoded;
    if (!payload || !firma) {
        throw new Error('Código inválido o corrupto.');
    }

    const verify = crypto.createVerify('SHA256');
    verify.update(payload);
    const firmaValida = verify.verify(PUBLIC_KEY_RECUPERACION, firma, 'base64');
    if (!firmaValida) {
        throw new Error('Código incorrecto.');
    }

    const payloadParsed = JSON.parse(payload);
    const { machineId, exp } = payloadParsed;

    if (machineId !== getMachineId()) {
        throw new Error('Este código fue generado para otro equipo.');
    }

    if (!exp || Date.now() > Number(exp)) {
        throw new Error('El código expiró. Solicite uno nuevo.');
    }

    return payloadParsed;
}

function generarPasswordTemporal() {
    const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const minus = 'abcdefghijkmnpqrstuvwxyz';
    const nums = '23456789';
    const todos = mayus + minus + nums;

    let pw = mayus[crypto.randomInt(mayus.length)]
        + minus[crypto.randomInt(minus.length)]
        + nums[crypto.randomInt(nums.length)];

    for (let i = 0; i < 7; i++) {
        pw += todos[crypto.randomInt(todos.length)];
    }

    // Mezclar para que las posiciones fijas de arriba no sean predecibles
    return pw.split('').sort(() => crypto.randomInt(2) - 0.5).join('');
}

// ══════════════════════════════════════════════════════════════
//  GET /api/recuperacion/machineid
//  Devuelve el machineId de este equipo (para mostrarlo en el modal)
// ══════════════════════════════════════════════════════════════
router.get('/machineid', (_req, res) => {
    res.json({ ok: true, machineId: getMachineId() });
});

// ══════════════════════════════════════════════════════════════
//  POST /api/recuperacion/verificar
//  Valida el código y devuelve la lista de usuarios para elegir
// ══════════════════════════════════════════════════════════════
router.post('/verificar', (req, res) => {
    try {
        const { codigo } = req.body;
        validarCodigo(codigo);

        const usuariosLista = db.usuarios.listar().map(u => ({
            id_usuario: u.id_usuario,
            username: u.username,
            nombre_completo: u.nombre_completo,
            rol: u.rol,
            estado: u.estado,
        }));

        res.json({ ok: true, usuarios: usuariosLista });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  POST /api/recuperacion/reset
//  Revalida el código (no hay sesión de servidor) y resetea la clave
//  del usuario elegido a una contraseña temporal generada.
// ══════════════════════════════════════════════════════════════
router.post('/reset', (req, res) => {
    try {
        const { codigo, id_usuario } = req.body;
        validarCodigo(codigo);

        if (!id_usuario) {
            return res.status(400).json({ ok: false, error: 'Falta el usuario a restablecer.' });
        }

        const usuario = db.usuarios.obtenerPorId(id_usuario);
        if (!usuario) {
            return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
        }

        const passwordTemporal = generarPasswordTemporal();
        db.usuarios.actualizarPassword(id_usuario, bcrypt.hashSync(passwordTemporal, 10));

        db.logs.registrar({
            usuario: 'RECUPERACION_REMOTA',
            accion: 'MODIFICAR',
            modulo: 'USUARIOS',
            detalles: `Contraseña restablecida remotamente para el usuario "${usuario.username}" vía código de recuperación.`,
            fecha_hora: new Date().toISOString(),
        });

        res.json({ ok: true, username: usuario.username, password_temporal: passwordTemporal });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

module.exports = router;