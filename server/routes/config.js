const router = require('express').Router();
const db     = require('../data/database');
const { requireRole } = require('../middleware/auth');
const { encryptText, decryptText, maskSecret } = require('../security/secrets');

function configSegura() {
    const cfg = db.config.obtenerTodo();
    const token = decryptText(cfg.sunat_token || '');
    delete cfg.sunat_token;
    cfg.sunat_token_configurado = token ? '1' : '0';
    cfg.sunat_token_masked = token ? maskSecret(token) : '';

    const docToken = decryptText(cfg.documentos_token || '');
    delete cfg.documentos_token;
    cfg.documentos_token_configurado = docToken ? '1' : '0';
    cfg.documentos_token_masked = docToken ? maskSecret(docToken) : '';

    return cfg;
}

function configPublica() {
    const cfg = db.config.obtenerTodo();
    return {
        empresa_nombre: cfg.empresa_nombre || '',
        empresa_nombre_corto: cfg.empresa_nombre_corto || '',
        empresa_ruc: cfg.empresa_ruc || '',
        empresa_direccion: cfg.empresa_direccion || '',
        empresa_telefono: cfg.empresa_telefono || '',
        empresa_email: cfg.empresa_email || '',
        serie_boleta: cfg.serie_boleta || 'B001',
        serie_factura: cfg.serie_factura || 'F001',
        moneda: cfg.moneda || 'SOLES',
        igv: cfg.igv || '18',
        sunat_activo: cfg.sunat_activo || '0',
        sunat_modo: cfg.sunat_modo || 'demo',
        cpe_proveedor: cfg.cpe_proveedor || 'nubefact',
        cpe_formato_pdf: cfg.cpe_formato_pdf || 'A4',
        cpe_envio_email_cliente: cfg.cpe_envio_email_cliente || '1',
        almacen_principal_id: cfg.almacen_principal_id || 'alm-principal',
        almacen_tienda_id: cfg.almacen_tienda_id || cfg.almacen_principal_id || 'alm-principal',
        almacen_deposito_id: cfg.almacen_deposito_id || '',
        ticket_logo: cfg.ticket_logo || '',
        empresa_distrito: cfg.empresa_distrito || '',
        empresa_provincia: cfg.empresa_provincia || '',
        empresa_departamento: cfg.empresa_departamento || '',
        modulo_optica_activo: cfg.modulo_optica_activo || '0',
        optica_profesional_nombre: cfg.optica_profesional_nombre || '',
        optica_profesional_registro: cfg.optica_profesional_registro || '',
        optica_profesional_cargo: cfg.optica_profesional_cargo || '',
        serie_nota_credito_boleta: cfg.serie_nota_credito_boleta || '',
        serie_nota_credito_factura: cfg.serie_nota_credito_factura || '',
        qr_pago_activo: cfg.qr_pago_activo || '0',
        qr_yape_imagen: cfg.qr_yape_imagen || '',
        qr_plin_imagen: cfg.qr_plin_imagen || '',
        transferencia_activo: cfg.transferencia_activo || '0',
        transferencia_cuentas: cfg.transferencia_cuentas || '[]',
        escaner_activo: cfg.escaner_activo || '0',
    };
}

router.get('/public', (req, res) => {
    try {
        res.json(configPublica());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.use(requireRole('ADMIN'));

// ─── GET /api/config ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        res.json(configSegura());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── PUT /api/config ──────────────────────────────────────────────────────────
router.put('/', (req, res) => {
    try {
        if (req.body.sunat_token !== undefined) {
            delete req.body.sunat_token;
        }
        if (req.body.sunat_activo === '1') {
            const next = { ...db.config.obtenerTodo(), ...req.body };
            const faltantes = [];
            const proveedor = String(next.cpe_proveedor || 'nubefact').toLowerCase();
            if (proveedor !== 'nubefact') faltantes.push('proveedor CPE soportado');
            if (!next.empresa_ruc || !/^\d{11}$/.test(String(next.empresa_ruc))) faltantes.push('RUC de empresa valido');
            if (!next.serie_boleta) faltantes.push('serie de boleta');
            if (!next.serie_factura) faltantes.push('serie de factura');
            
            if (proveedor === 'nubefact') {
                if (!next.sunat_url || !/^https:\/\/api\.nubefact\.com\//.test(String(next.sunat_url))) faltantes.push('URL NubeFact valida');
                if (!next.sunat_token) faltantes.push('token NubeFact');
            }
            if (faltantes.length) {
                return res.status(400).json({ error: `No se puede activar SUNAT. Falta: ${faltantes.join(', ')}` });
            }
        }
        for (const key of Object.keys(req.body)) {
            db.config.guardar(key, req.body[key]);
        }
        res.json(configSegura());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/sunat-token', (req, res) => {
    try {
        const { token } = req.body;
        if (!token || String(token).trim().length < 20) {
            return res.status(400).json({ error: 'Token NubeFact invalido.' });
        }
        db.config.guardar('sunat_token', encryptText(String(token).trim()));
        res.json(configSegura());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/documentos-token', (req, res) => {
    try {
        const { token } = req.body;
        if (!token || String(token).trim().length < 40) {
            return res.status(400).json({ error: 'Token de ApiPeru.dev invalido.' });
        }
        db.config.guardar('documentos_token', encryptText(String(token).trim()));
        res.json(configSegura());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/estadisticas ────────────────────────────────────────────────────
router.get('/estadisticas', (req, res) => {
    try {
        const rawDb = db.db;
        const { total_productos } = rawDb.prepare('SELECT COUNT(*) AS total_productos FROM productos').get();
        const { total_ventas }    = rawDb.prepare("SELECT COUNT(*) AS total_ventas FROM ventas WHERE estado != 'anulada'").get();
        res.json({ total_productos, total_ventas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
