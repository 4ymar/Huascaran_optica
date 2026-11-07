const express = require('express');
const router = express.Router();
const db = require('../data/database');
const { requireRole } = require('../middleware/auth');
const { decryptText } = require('../security/secrets');
const { getProvider } = require('../services/documentos/providerFactory');

function getConfigDocumentos() {
    const rows = db.db.prepare(
        `SELECT clave, valor FROM config WHERE clave IN
        ('documentos_proveedor','documentos_token')`
    ).all();
    const cfg = {};
    rows.forEach(r => { cfg[r.clave] = r.valor; });
    if (cfg.documentos_token) cfg.documentos_token = decryptText(cfg.documentos_token);
    return cfg;
}

router.get('/consultar', requireRole('ADMIN', 'CAJERO'), async (req, res) => {
    const { tipo, numero } = req.query;

    if (!tipo || !numero) {
        return res.status(400).json({ error: 'Faltan parámetros tipo y numero.' });
    }
    const tipoUpper = String(tipo).toUpperCase();
    if (tipoUpper !== 'DNI' && tipoUpper !== 'RUC') {
        return res.status(400).json({ error: 'Tipo de documento no soportado.' });
    }
    const longitudEsperada = tipoUpper === 'DNI' ? 8 : 11;
    if (String(numero).length !== longitudEsperada) {
        return res.status(400).json({ error: `${tipoUpper} debe tener ${longitudEsperada} dígitos.` });
    }

    try {
        const cfg = getConfigDocumentos();
        if (!cfg.documentos_token) {
            return res.status(400).json({ error: 'Token de consulta de documentos no configurado.' });
        }

        const proveedorId = cfg.documentos_proveedor || 'apiperu';
        const provider = getProvider(proveedorId);

        const resultado = await provider.consultarDocumento({
            tipo: tipoUpper,
            numero: String(numero),
            token: cfg.documentos_token,
        });

        res.json({ ok: true, proveedor: proveedorId, ...resultado });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;