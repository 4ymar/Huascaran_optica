const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const db = require('../data/database');
const { requireRole } = require('../middleware/auth');
const { decryptText } = require('../security/secrets');
const { getProvider } = require('../services/cpe/providerFactory');
const { auditLog } = require('../middleware/logger');
const { translateCpeError } = require('../services/cpe/errorTranslator');
const logger = require('../logger');

function getConfigSunat() {
    const raw = db.db;
    const rows = raw.prepare(
        `SELECT clave, valor FROM config WHERE clave IN
        ('sunat_activo','sunat_token','sunat_url','sunat_modo','cpe_proveedor')`
    ).all();
    const cfg = {};
    rows.forEach(r => { cfg[r.clave] = r.valor; });
    if (cfg.sunat_token) cfg.sunat_token = decryptText(cfg.sunat_token);
    return cfg;
}

function obtenerConfigCompleta() {
    const configRows = db.db.prepare(`SELECT clave, valor FROM config`).all();
    const config = {};
    configRows.forEach(r => { config[r.clave] = r.clave === 'sunat_token' ? '' : r.valor; });
    return config;
}

function registrarEvento({ id_venta, operacion, estado, request, response, mensaje, usuario }) {
    try {
        db.db.prepare(`
            INSERT INTO cpe_eventos
                (id_evento, id_venta, operacion, estado, request_json, response_json, mensaje, usuario, fecha_hora)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            randomUUID(),
            id_venta,
            operacion,
            estado,
            request ? JSON.stringify(request) : null,
            response ? JSON.stringify(response) : null,
            mensaje || '',
            usuario || 'sistema',
            new Date().toISOString()
        );
    } catch (err) {
        logger.error('FACTURACION', 'No se pudo registrar evento CPE:', err.message);
    }
}

function separarComprobante(numeroComprobante = '') {
    const [serie = '', numero = ''] = String(numeroComprobante).split('-');
    return { serie, numero };
}
function tipoComprobanteCodigoConsulta(tipo) {
    const map = { FACTURA: 1, BOLETA: 2, NOTA_CREDITO: 3, NOTA_DEBITO: 4 };
    return map[tipo] || 0;
}
function upsertDocumentoCpe({ venta, proveedor, payload, estado, response, error, usuario }) {
    const raw = db.db;
    const ahora = new Date().toISOString();
    const { serie, numero } = separarComprobante(venta.numero_comprobante);
    const previo = raw.prepare(`
        SELECT * FROM cpe_documentos
        WHERE proveedor = ? AND tipo_comprobante = ? AND serie = ? AND numero = ?
    `).get(proveedor, venta.tipo_comprobante, serie, numero);

    if (!previo) {
        const id = randomUUID();
        raw.prepare(`
            INSERT INTO cpe_documentos
                (id_cpe, id_venta, proveedor, tipo_comprobante, serie, numero, estado,
                 request_json, response_json, ultimo_error, intentos, fecha_creacion,
                 fecha_actualizacion, usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(
            id,
            venta.id_venta,
            proveedor,
            venta.tipo_comprobante,
            serie,
            numero,
            estado,
            payload ? JSON.stringify(payload) : null,
            response ? JSON.stringify(response) : null,
            error || '',
            ahora,
            ahora,
            usuario || 'sistema'
        );
        return id;
    }

    raw.prepare(`
        UPDATE cpe_documentos SET
            estado = ?,
            request_json = COALESCE(?, request_json),
            response_json = ?,
            ultimo_error = ?,
            intentos = intentos + 1,
            fecha_actualizacion = ?,
            usuario = ?
        WHERE id_cpe = ?
    `).run(
        estado,
        payload ? JSON.stringify(payload) : null,
        response ? JSON.stringify(response) : null,
        error || '',
        ahora,
        usuario || 'sistema',
        previo.id_cpe
    );
    return previo.id_cpe;
}

function marcarDocumentoCpeEmitido({ venta, proveedor, result, estado = 'ENVIADO_PENDIENTE_SUNAT', usuario }) {
    const raw = db.db;
    const ahora = new Date().toISOString();
    const idCpe = upsertDocumentoCpe({
        venta,
        proveedor,
        payload: result.payload,
        estado,
        response: result.raw?.body,
        usuario,
    });
    raw.prepare(`
        UPDATE cpe_documentos SET
            codigo_hash = ?,
            enlace_pdf = ?,
            enlace_xml = ?,
            enlace_cdr = ?,
            fecha_aceptacion = ?,
            fecha_actualizacion = ?
        WHERE id_cpe = ?
    `).run(
        result.hash || '',
        result.pdfUrl || '',
        result.xmlUrl || '',
        result.cdrUrl || '',
        estado === 'ACEPTADO' ? ahora : null,
        ahora,
        idCpe
    );
    return idCpe;
}

function upsertDocumentoNotaCpe({ venta, proveedor, tipoComprobante, serie, numero, payload, estado, response, error, usuario }) {
    const raw = db.db;
    const ahora = new Date().toISOString();
    const previo = raw.prepare(`
        SELECT * FROM cpe_documentos
        WHERE proveedor = ? AND tipo_comprobante = ? AND serie = ? AND numero = ?
    `).get(proveedor, tipoComprobante, serie, numero);

    if (!previo) {
        const id = randomUUID();
        raw.prepare(`
            INSERT INTO cpe_documentos
                (id_cpe, id_venta, proveedor, tipo_comprobante, serie, numero, estado,
                 request_json, response_json, ultimo_error, intentos, fecha_creacion,
                 fecha_actualizacion, usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(
            id,
            venta.id_venta,
            proveedor,
            tipoComprobante,
            serie,
            numero,
            estado,
            payload ? JSON.stringify(payload) : null,
            response ? JSON.stringify(response) : null,
            error || '',
            ahora,
            ahora,
            usuario || 'sistema'
        );
        return id;
    }

    raw.prepare(`
        UPDATE cpe_documentos SET
            estado = ?,
            request_json = COALESCE(?, request_json),
            response_json = ?,
            ultimo_error = ?,
            intentos = intentos + 1,
            fecha_actualizacion = ?,
            usuario = ?
        WHERE id_cpe = ?
    `).run(
        estado,
        payload ? JSON.stringify(payload) : null,
        response ? JSON.stringify(response) : null,
        error || '',
        ahora,
        usuario || 'sistema',
        previo.id_cpe
    );
    return previo.id_cpe;
}

function marcarDocumentoNotaAceptado({ venta, proveedor, tipoComprobante, serie, numero, result, usuario }) {
    const raw = db.db;
    const ahora = new Date().toISOString();
    const idCpe = upsertDocumentoNotaCpe({
        venta, proveedor, tipoComprobante, serie, numero,
        payload: result.payload,
        estado: 'ACEPTADO',
        response: result.raw?.body,
        usuario,
    });
    raw.prepare(`
        UPDATE cpe_documentos SET
            codigo_hash = ?,
            enlace_pdf = ?,
            enlace_xml = ?,
            enlace_cdr = ?,
            fecha_aceptacion = ?,
            fecha_actualizacion = ?
        WHERE id_cpe = ?
    `).run(result.hash || '', result.pdfUrl || '', result.xmlUrl || '', result.cdrUrl || '', ahora, ahora, idCpe);
    return idCpe;
}

router.post('/emitir/:id_venta', requireRole('ADMIN', 'CAJERO'), async (req, res) => {
    let payload = null;
    let venta = null;
    let proveedorId = 'nubefact';

    try {
        const raw = db.db;
        const cfg = getConfigSunat();
        proveedorId = cfg.cpe_proveedor || 'nubefact';
        const provider = getProvider(proveedorId);

        if (cfg.sunat_activo !== '1') {
            return res.status(400).json({ error: 'Facturacion electronica no esta activada.' });
        }
        if (!cfg.sunat_token || !cfg.sunat_url) {
            return res.status(400).json({ error: 'Falta configurar token o URL de NubeFact.' });
        }

        venta = raw.prepare(`
            SELECT v.*, c.nombre_razon_social, c.tipo_documento,
                   c.numero_documento, c.direccion, c.email
            FROM ventas v
            LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
            WHERE v.id_venta = ?
        `).get(req.params.id_venta);

        if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
        if (venta.estado === 'ANULADA') return res.status(400).json({ error: 'No se puede emitir una venta anulada.' });
        if (venta.cpe_estado === 'ACEPTADO' || venta.cpe_estado === 'ENVIADO_PENDIENTE_SUNAT') {
            return res.status(400).json({ error: 'Esta venta ya tiene comprobante electrónico emitido. Si está pendiente de confirmación, utiliza "Consultar SUNAT".' });
        }
        if (venta.tipo_comprobante === 'FACTURA' && !/^\d{11}$/.test(String(venta.numero_documento || ''))) {
            return res.status(400).json({ error: 'Para factura el cliente debe tener RUC valido de 11 digitos.' });
        }
        if (venta.tipo_comprobante === 'BOLETA' && Number(venta.total) > 700) {
            const numDoc = String(venta.numero_documento || '').trim();
            if (!numDoc || numDoc === '-' || numDoc.length < 8) {
                return res.status(400).json({ error: 'Para boletas mayores a S/ 700.00 es obligatorio registrar al cliente con DNI (8 dígitos) o RUC (11 dígitos) según normativa SUNAT.' });
            }
        }

        const detalles = raw.prepare(`
            SELECT dv.*, p.sku, p.unidad_medida, p.nombre AS nombre_producto_actual, p.codigo_producto_sunat, p.tipo_igv
            FROM detalle_ventas dv
            JOIN productos p ON dv.id_producto = p.id_producto
            WHERE dv.id_venta = ?
        `).all(req.params.id_venta);

        venta.detalles = detalles;
        venta.cliente = venta.numero_documento ? {
            nombre_razon_social: venta.nombre_razon_social,
            tipo_documento: venta.tipo_documento,
            numero_documento: venta.numero_documento,
            direccion: venta.direccion,
            email: venta.email,
        } : null;

        if (venta.forma_pago === 'CREDITO') {
            const creditoRow = raw.prepare(`SELECT fecha_vencimiento FROM creditos WHERE id_venta = ? LIMIT 1`).get(req.params.id_venta);
            if (creditoRow) {
                venta.credito = creditoRow;
            }
        }

        const config = obtenerConfigCompleta();
        payload = provider.buildPayload(venta, config);

        upsertDocumentoCpe({
            venta,
            proveedor: proveedorId,
            payload,
            estado: 'ENVIANDO',
            usuario: req.user?.username,
        });

        const resultado = await provider.emitir({
            venta,
            config,
            token: cfg.sunat_token,
            url: cfg.sunat_url,
        });
        if (resultado.ok) {
            const aceptadaPorSunat = Boolean(resultado.raw?.body?.aceptada_por_sunat);
            const estadoCpe = aceptadaPorSunat ? 'ACEPTADO' : 'ENVIADO_PENDIENTE_SUNAT';

            raw.prepare(`
                UPDATE ventas SET
                    cpe_estado = ?,
                    cpe_codigo_hash = ?,
                    cpe_enlace_pdf = ?,
                    cpe_enlace_xml = ?
                WHERE id_venta = ?
            `).run(
                estadoCpe,
                resultado.hash || '',
                resultado.pdfUrl || '',
                resultado.xmlUrl || '',
                req.params.id_venta
            );

            marcarDocumentoCpeEmitido({
                venta,
                proveedor: proveedorId,
                result: resultado,
                estado: estadoCpe,
                usuario: req.user?.username,
            });

            registrarEvento({
                id_venta: req.params.id_venta,
                operacion: 'EMITIR',
                estado: estadoCpe,
                request: payload,
                response: resultado.raw?.body,
                usuario: req.user?.username,
            });

            auditLog(req, 'EMITIR_CPE', 'COMPROBANTES',
                `CPE emitido: ${venta.tipo_comprobante} ${venta.numero_comprobante} — Venta ${venta.numero_venta} | Estado: ${estadoCpe} | Cliente: ${venta.nombre_razon_social || 'Consumidor Final'}`,
                { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
            );

            return res.json({
                exito: true,
                estado: estadoCpe,
                aceptada_por_sunat: aceptadaPorSunat,
                proveedor: proveedorId,
                enlace_pdf: resultado.pdfUrl,
            });
        }

        if (resultado.alreadyExists) {
            let estadoCpe = 'ENVIADO_PENDIENTE_SUNAT';
            let consultaResult = null;
            try {
                const { serie, numero } = separarComprobante(venta.numero_comprobante);
                consultaResult = await provider.consultarEstado({
                    config,
                    token: cfg.sunat_token,
                    url: cfg.sunat_url,
                    tipo_de_comprobante: tipoComprobanteCodigoConsulta(venta.tipo_comprobante),
                    serie,
                    numero,
                });
                if (consultaResult?.ok && consultaResult?.aceptadaPorSunat) {
                    estadoCpe = 'ACEPTADO';
                }
            } catch (_) {}

            const hashFinal = consultaResult?.hash || resultado.hash || '';
            const pdfUrlFinal = consultaResult?.pdfUrl || resultado.pdfUrl || '';
            const xmlUrlFinal = consultaResult?.xmlUrl || resultado.xmlUrl || '';
            const cdrUrlFinal = consultaResult?.cdrUrl || resultado.cdrUrl || '';

            raw.prepare(`
                UPDATE ventas SET
                    cpe_estado = ?,
                    cpe_codigo_hash = ?,
                    cpe_enlace_pdf = ?,
                    cpe_enlace_xml = ?
                WHERE id_venta = ?
            `).run(
                estadoCpe,
                hashFinal,
                pdfUrlFinal,
                xmlUrlFinal,
                req.params.id_venta
            );

            marcarDocumentoCpeEmitido({
                venta,
                proveedor: proveedorId,
                result: {
                    payload,
                    hash: hashFinal,
                    pdfUrl: pdfUrlFinal,
                    xmlUrl: xmlUrlFinal,
                    cdrUrl: cdrUrlFinal,
                    raw: consultaResult?.raw || resultado.raw,
                },
                estado: estadoCpe,
                usuario: req.user?.username,
            });

            registrarEvento({
                id_venta: req.params.id_venta,
                operacion: 'EMITIR',
                estado: estadoCpe,
                request: payload,
                response: consultaResult?.raw?.body || resultado.raw?.body,
                mensaje: `Comprobante ya existía en NubeFact - registrado como ${estadoCpe}`,
                usuario: req.user?.username,
            });

            auditLog(req, 'EMITIR_CPE', 'COMPROBANTES',
                `CPE emitido: ${venta.tipo_comprobante} ${venta.numero_comprobante} — Venta ${venta.numero_venta} | Ya existía en NubeFact (${estadoCpe})`,
                { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
            );

            return res.json({
                exito: true,
                estado: estadoCpe,
                proveedor: proveedorId,
                mensaje: `Comprobante ya existía en NubeFact - registrado como ${estadoCpe}.`,
                enlace_pdf: pdfUrlFinal,
                nubefact: consultaResult?.raw?.body || resultado.raw?.body,
            });
        }

        raw.prepare(`UPDATE ventas SET cpe_estado = ? WHERE id_venta = ?`)
            .run('RECHAZADO', req.params.id_venta);
        upsertDocumentoCpe({
            venta,
            proveedor: proveedorId,
            payload,
            estado: 'RECHAZADO',
            response: resultado.raw?.body,
            error: typeof resultado.raw?.body?.errors === 'string'
                ? resultado.raw.body.errors
                : JSON.stringify(resultado.raw?.body || {}),
            usuario: req.user?.username,
        });
        registrarEvento({
            id_venta: req.params.id_venta,
            operacion: 'EMITIR',
            estado: 'RECHAZADO',
            request: payload,
            response: resultado.raw?.body,
            usuario: req.user?.username,
        });

        auditLog(req, 'EMITIR_CPE', 'COMPROBANTES',
            `CPE rechazado: ${venta.tipo_comprobante} ${venta.numero_comprobante} — Venta ${venta.numero_venta} | ` +
            `Motivo: ${typeof resultado.raw?.body?.errors === 'string' ? resultado.raw.body.errors : 'Ver detalle en el comprobante'}`,
            { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
        );

        const errorTraducido = translateCpeError(resultado.raw?.body);
        return res.status(422).json({
            exito: false,
            estado: 'RECHAZADO',
            error: errorTraducido,
            proveedor: proveedorId,
            nubefact: resultado.raw?.body,
        });
    } catch (err) {
        logger.error('FACTURACION', 'Error al emitir:', err.message);
        if (err.message.includes('Timeout')) {
            try {
                db.db.prepare(`UPDATE ventas SET cpe_estado = 'PENDIENTE' WHERE id_venta = ?`)
                    .run(req.params.id_venta);
                if (venta) {
                    upsertDocumentoCpe({
                        venta,
                        proveedor: proveedorId,
                        payload,
                        estado: 'PENDIENTE_CONSULTA',
                        error: err.message,
                        usuario: req.user?.username,
                    });
                }
                registrarEvento({
                    id_venta: req.params.id_venta,
                    operacion: 'EMITIR',
                    estado: 'PENDIENTE',
                    request: payload,
                    mensaje: err.message,
                    usuario: req.user?.username,
                });
            } catch (_) {}
            return res.status(408).json({
                error: 'NubeFact tardo demasiado en responder. El comprobante puede haberse emitido. Reintente en unos segundos.',
                cpe_estado: 'PENDIENTE',
            });
        }
        if (venta) {
            try {
                upsertDocumentoCpe({
                    venta,
                    proveedor: proveedorId,
                    payload,
                    estado: 'ERROR',
                    error: err.message,
                    usuario: req.user?.username,
                });
            } catch (_) {}
        }
        registrarEvento({
            id_venta: req.params.id_venta,
            operacion: 'EMITIR',
            estado: 'ERROR',
            request: payload,
            mensaje: err.message,
            usuario: req.user?.username,
        });
        res.status(500).json({ error: err.message });
    }
});

router.post('/emitir-nota/:id_venta', requireRole('ADMIN', 'CAJERO'), async (req, res) => {
    let payload = null;
    let venta = null;
    let proveedorId = 'nubefact';
    const { motivo_codigo, motivo_descripcion } = req.body;

    try {
        const raw = db.db;
        const cfg = getConfigSunat();
        proveedorId = cfg.cpe_proveedor || 'nubefact';
        const provider = getProvider(proveedorId);

        if (cfg.sunat_activo !== '1') {
            return res.status(400).json({ error: 'Facturacion electronica no esta activada.' });
        }
        if (!cfg.sunat_token || !cfg.sunat_url) {
            return res.status(400).json({ error: 'Falta configurar token o URL de NubeFact.' });
        }
        if (!motivo_descripcion || !String(motivo_descripcion).trim()) {
            return res.status(400).json({ error: 'La justificacion de la nota es obligatoria.' });
        }

        venta = raw.prepare(`
            SELECT v.*, c.nombre_razon_social, c.tipo_documento,
                   c.numero_documento, c.direccion, c.email
            FROM ventas v
            LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
            WHERE v.id_venta = ?
        `).get(req.params.id_venta);

        if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
        if (venta.estado !== 'ANULADA' || venta.cpe_estado !== 'NOTA_CREDITO_REQUERIDA') {
            return res.status(400).json({ error: 'Esta venta no requiere una Nota de Credito en este momento.' });
        }

        const config = obtenerConfigCompleta();
        const isBoleta = venta.tipo_comprobante === 'BOLETA';
        const claveSerie = isBoleta ? 'serie_nota_credito_boleta' : 'serie_nota_credito_factura';
        const claveCorrelativo = isBoleta ? 'correlativo_nota_credito_boleta' : 'correlativo_nota_credito_factura';

        if (!config[claveSerie]) {
            return res.status(400).json({ error: 'Falta configurar la serie de Nota de Credito en Ajustes.' });
        }

        const detalles = raw.prepare(`
            SELECT dv.*, p.sku, p.unidad_medida, p.nombre AS nombre_producto_actual, p.codigo_producto_sunat
            FROM detalle_ventas dv
            JOIN productos p ON dv.id_producto = p.id_producto
            WHERE dv.id_venta = ?
        `).all(req.params.id_venta);

        venta.detalles = detalles;
        venta.cliente = venta.numero_documento ? {
            nombre_razon_social: venta.nombre_razon_social,
            tipo_documento: venta.tipo_documento,
            numero_documento: venta.numero_documento,
            direccion: venta.direccion,
            email: venta.email,
        } : null;

        const notaData = { motivo_codigo, motivo_descripcion };
        payload = provider.buildPayloadNota(venta, config, notaData);
        const serieNota = payload.serie;
        const numeroNota = payload.numero;

        upsertDocumentoNotaCpe({
            venta,
            proveedor: proveedorId,
            tipoComprobante: 'NOTA_CREDITO',
            serie: serieNota,
            numero: numeroNota,
            payload,
            estado: 'ENVIANDO',
            usuario: req.user?.username,
        });

        const resultado = await provider.emitirNota({
            venta,
            config,
            token: cfg.sunat_token,
            url: cfg.sunat_url,
            notaData,
        });

        if (resultado.ok) {
            raw.prepare(`
                UPDATE ventas SET
                    cpe_estado = ?,
                    nota_credito_serie = ?,
                    nota_credito_numero = ?,
                    nota_credito_fecha = ?,
                    nota_credito_observacion = ?
                WHERE id_venta = ?
            `).run(
                'NOTA_CREDITO_REGISTRADA',
                serieNota,
                numeroNota,
                new Date().toISOString(),
                motivo_descripcion,
                req.params.id_venta
            );

            db.config.guardar(claveCorrelativo, String(numeroNota + 1));

            marcarDocumentoNotaAceptado({
                venta,
                proveedor: proveedorId,
                tipoComprobante: 'NOTA_CREDITO',
                serie: serieNota,
                numero: numeroNota,
                result: resultado,
                usuario: req.user?.username,
            });

            registrarEvento({
                id_venta: req.params.id_venta,
                operacion: 'EMITIR_NOTA',
                estado: 'ACEPTADO',
                request: payload,
                response: resultado.raw?.body,
                usuario: req.user?.username,
            });

            auditLog(req, 'EMITIR_NOTA', 'COMPROBANTES',
                `Nota de crédito registrada: ${serieNota}-${numeroNota} — Venta ${venta.numero_venta} | Motivo: ${motivo_descripcion}`,
                { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
            );

            return res.json({
                exito: true,
                estado: 'NOTA_CREDITO_REGISTRADA',
                proveedor: proveedorId,
                serie: serieNota,
                numero: numeroNota,
                enlace_pdf: resultado.pdfUrl,
                enlace_xml: resultado.xmlUrl,
                enlace_cdr: resultado.cdrUrl,
                hash: resultado.hash,
                nubefact: resultado.raw?.body,
            });
        }

        upsertDocumentoNotaCpe({
            venta,
            proveedor: proveedorId,
            tipoComprobante: 'NOTA_CREDITO',
            serie: serieNota,
            numero: numeroNota,
            payload,
            estado: 'RECHAZADO',
            response: resultado.raw?.body,
            error: typeof resultado.raw?.body?.errors === 'string'
                ? resultado.raw.body.errors
                : JSON.stringify(resultado.raw?.body || {}),
            usuario: req.user?.username,
        });
        registrarEvento({
            id_venta: req.params.id_venta,
            operacion: 'EMITIR_NOTA',
            estado: 'RECHAZADO',
            request: payload,
            response: resultado.raw?.body,
            usuario: req.user?.username,
        });

        auditLog(req, 'EMITIR_NOTA', 'COMPROBANTES',
            `Nota de crédito rechazada — Venta ${venta.numero_venta} | ` +
            `Motivo: ${typeof resultado.raw?.body?.errors === 'string' ? resultado.raw.body.errors : 'Ver detalle en el comprobante'}`,
            { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
        );

        const errorTraducidoNota = translateCpeError(resultado.raw?.body);
        return res.status(422).json({
            exito: false,
            estado: 'RECHAZADO',
            error: errorTraducidoNota,
            proveedor: proveedorId,
            nubefact: resultado.raw?.body,
        });
    } catch (err) {
        logger.error('FACTURACION', 'Error al emitir nota:', err.message);
        if (err.message.includes('Timeout')) {
            try {
                if (venta) {
                    upsertDocumentoNotaCpe({
                        venta,
                        proveedor: proveedorId,
                        tipoComprobante: 'NOTA_CREDITO',
                        serie: payload?.serie || '',
                        numero: payload?.numero || 0,
                        payload,
                        estado: 'PENDIENTE_CONSULTA',
                        error: err.message,
                        usuario: req.user?.username,
                    });
                }
                registrarEvento({
                    id_venta: req.params.id_venta,
                    operacion: 'EMITIR_NOTA',
                    estado: 'PENDIENTE',
                    request: payload,
                    mensaje: err.message,
                    usuario: req.user?.username,
                });
            } catch (_) {}
            return res.status(408).json({
                error: 'NubeFact tardo demasiado en responder. La nota puede haberse emitido. Verifique antes de reintentar.',
            });
        }
        if (venta) {
            try {
                upsertDocumentoNotaCpe({
                    venta,
                    proveedor: proveedorId,
                    tipoComprobante: 'NOTA_CREDITO',
                    serie: payload?.serie || '',
                    numero: payload?.numero || 0,
                    payload,
                    estado: 'ERROR',
                    error: err.message,
                    usuario: req.user?.username,
                });
            } catch (_) {}
        }
        registrarEvento({
            id_venta: req.params.id_venta,
            operacion: 'EMITIR_NOTA',
            estado: 'ERROR',
            request: payload,
            mensaje: err.message,
            usuario: req.user?.username,
        });
        res.status(500).json({ error: err.message });
    }
});

router.post('/probar-configuracion', requireRole('ADMIN'), async (req, res) => {
    try {
        const cfg = getConfigSunat();
        const proveedorId = cfg.cpe_proveedor || 'nubefact';
        const provider = getProvider(proveedorId);

        if (!cfg.sunat_token || !cfg.sunat_url) {
            return res.status(400).json({ ok: false, error: 'Falta configurar token o URL del proveedor.' });
        }

        const config = obtenerConfigCompleta();
        const resultado = await provider.probarConexion({
            config,
            token: cfg.sunat_token,
            url: cfg.sunat_url,
        });

        res.json({
            ok: true,
            proveedor: proveedorId,
            mensaje: 'Conexion con el proveedor CPE disponible. Si el comprobante de prueba no existe, la respuesta del proveedor puede indicarlo sin que sea un problema.',
            resultado,
        });
    } catch (err) {
        res.status(500).json({
            ok: false,
            error: err.message,
        });
    }
});

router.get('/estado/:id_venta', requireRole('ADMIN', 'CAJERO'), (req, res) => {
    try {
        const fila = db.db.prepare(`
            SELECT cpe_estado, cpe_codigo_hash, cpe_enlace_pdf, cpe_enlace_xml,
                   nota_credito_serie, nota_credito_numero, nota_credito_fecha, nota_credito_observacion
            FROM ventas WHERE id_venta = ?
        `).get(req.params.id_venta);

        if (!fila) return res.status(404).json({ error: 'Venta no encontrada.' });
        const documentos = db.db.prepare(`
            SELECT id_cpe, proveedor, tipo_comprobante, serie, numero, estado,
                   codigo_hash, enlace_pdf, enlace_xml, enlace_cdr, ultimo_error,
                   intentos, fecha_creacion, fecha_actualizacion, fecha_aceptacion
            FROM cpe_documentos
            WHERE id_venta = ?
            ORDER BY fecha_creacion DESC
        `).all(req.params.id_venta);
        res.json({ ...fila, documentos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Offset de negocio Perú (UTC-5) — mismo criterio que reportes.js, para que el
// corte de "inicio de mes" sea medianoche local y no medianoche UTC.
const BUSINESS_UTC_OFFSET_MINUTES = -300;
const BUSINESS_UTC_OFFSET_HOURS = -BUSINESS_UTC_OFFSET_MINUTES / 60;

function getInicioMesPeru() {
    const ahora = new Date();
    const peruMs = ahora.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000;
    const peru = new Date(peruMs);
    const y = peru.getUTCFullYear();
    const m = peru.getUTCMonth();
    return new Date(Date.UTC(y, m, 1, BUSINESS_UTC_OFFSET_HOURS, 0, 0));
}

function getInicioDiaPeru() {
    const ahora = new Date();
    const peruMs = ahora.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000;
    const peru = new Date(peruMs);
    const y = peru.getUTCFullYear();
    const m = peru.getUTCMonth();
    const d = peru.getUTCDate();
    return new Date(Date.UTC(y, m, d, BUSINESS_UTC_OFFSET_HOURS, 0, 0));
}

router.get('/resumen-mes', requireRole('ADMIN', 'CAJERO', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const inicioMes = getInicioMesPeru();
        const inicioDia = getInicioDiaPeru();
        const emitidosMes = db.reportes.cpeEmitidosMes(inicioMes.toISOString());
        const { pendientes, rechazados } = db.reportes.cpeEstadoContadoresHoy(inicioDia.toISOString());
        res.json({ emitidosMes, pendientes, rechazados });
    } catch (err) {
        logger.error('FACTURACION', 'Error al obtener resumen del mes:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const MESES_HISTORIAL = 12;

router.get('/historial-meses', requireRole('ADMIN', 'CAJERO', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const peru = new Date(Date.now() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
        const desde = new Date(Date.UTC(
            peru.getUTCFullYear(),
            peru.getUTCMonth() - (MESES_HISTORIAL - 1),
            1,
            BUSINESS_UTC_OFFSET_HOURS, 0, 0
        ));

        const filas = db.reportes.cpeHistorialMeses(desde.toISOString());

        // Se arman los 12 meses aunque no tengan movimiento, del más reciente
        // al más antiguo, para que la tabla no tenga huecos.
        const meses = [];
        const indice = {};
        for (let i = 0; i < MESES_HISTORIAL; i++) {
            const d = new Date(Date.UTC(peru.getUTCFullYear(), peru.getUTCMonth() - i, 1));
            const clave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            const entrada = { mes: clave, tipos: {}, total: 0 };
            meses.push(entrada);
            indice[clave] = entrada;
        }

        filas.forEach(f => {
            const destino = indice[f.mes];
            if (!destino) return;
            const tipo = f.tipo_comprobante || 'OTRO';
            if (!destino.tipos[tipo]) destino.tipos[tipo] = {};
            destino.tipos[tipo][f.estado] = (destino.tipos[tipo][f.estado] || 0) + f.cantidad;
            destino.total += f.cantidad;
        });

        res.json({ meses });
    } catch (err) {
        logger.error('FACTURACION', 'Error al obtener historial de meses:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/consultar-sunat/:id_venta', requireRole('ADMIN', 'CAJERO'), async (req, res) => {
    try {
        const raw = db.db;
        const cfg = getConfigSunat();
        const proveedorId = cfg.cpe_proveedor || 'nubefact';
        const provider = getProvider(proveedorId);

        if (!cfg.sunat_token || !cfg.sunat_url) {
            return res.status(400).json({ error: 'Falta configurar token o URL de NubeFact.' });
        }

        const documento = raw.prepare(`
            SELECT * FROM cpe_documentos
            WHERE id_venta = ? AND tipo_comprobante IN ('BOLETA', 'FACTURA')
            ORDER BY fecha_creacion DESC
            LIMIT 1
        `).get(req.params.id_venta);

        if (!documento) return res.status(404).json({ error: 'No hay comprobante electronico registrado para esta venta.' });

        const config = obtenerConfigCompleta();

        const resultado = await provider.consultarEstado({
            config,
            token: cfg.sunat_token,
            url: cfg.sunat_url,
            tipo_de_comprobante: tipoComprobanteCodigoConsulta(documento.tipo_comprobante),
            serie: documento.serie,
            numero: documento.numero,
        });

        if (!resultado.ok) {
            return res.status(400).json({
                error: resultado.sunatDescription || resultado.errorMensaje || 'SUNAT no pudo confirmar el estado de este comprobante en este momento. Intenta nuevamente en unos minutos.',
                codigo: resultado.errorCodigo,
            });
        }

        if (resultado.aceptadaPorSunat) {
            raw.prepare(`
                UPDATE ventas SET
                    cpe_estado = ?,
                    cpe_codigo_hash = ?,
                    cpe_enlace_pdf = ?,
                    cpe_enlace_xml = ?
                WHERE id_venta = ?
            `).run(
                'ACEPTADO',
                resultado.hash || '',
                resultado.pdfUrl || '',
                resultado.xmlUrl || '',
                req.params.id_venta
            );
            raw.prepare(`UPDATE cpe_documentos SET estado = ?, codigo_hash = ?, enlace_pdf = ?, enlace_xml = ?, fecha_actualizacion = ? WHERE id_cpe = ?`)
                .run('ACEPTADO', resultado.hash || '', resultado.pdfUrl || '', resultado.xmlUrl || '', new Date().toISOString(), documento.id_cpe);
        }

        registrarEvento({
            id_venta: req.params.id_venta,
            operacion: 'CONSULTAR_SUNAT',
            estado: resultado.aceptadaPorSunat ? 'ACEPTADO' : 'PENDIENTE',
            response: resultado.raw?.body,
            usuario: req.user?.username,
        });

        if (resultado.aceptadaPorSunat) {
            auditLog(req, 'CONSULTAR_SUNAT', 'COMPROBANTES',
                `Comprobante confirmado por SUNAT: ${documento.tipo_comprobante} ${documento.serie}-${documento.numero}`,
                { id_referencia: req.params.id_venta, tipo_referencia: 'VENTA' }
            );
        }

        res.json({
            exito: true,
            aceptada_por_sunat: resultado.aceptadaPorSunat,
            sunat_description: resultado.sunatDescription,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/consultar-anulacion/:id_venta', requireRole('ADMIN', 'CAJERO'), async (req, res) => {
    try {
        const raw = db.db;
        const cfg = getConfigSunat();
        const proveedorId = cfg.cpe_proveedor || 'nubefact';
        const provider = getProvider(proveedorId);

        if (!cfg.sunat_token || !cfg.sunat_url) {
            return res.status(400).json({ error: 'Falta configurar token o URL de NubeFact.' });
        }
        if (!provider.consultarAnulacion) {
            return res.status(400).json({ error: 'El proveedor CPE configurado no soporta consulta de anulaciones.' });
        }

        const venta = raw.prepare(`SELECT * FROM ventas WHERE id_venta = ?`).get(req.params.id_venta);
        if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
        if (venta.cpe_estado !== 'BAJA_ENVIADA') {
            return res.status(400).json({ error: 'Esta venta no tiene una baja pendiente de confirmar.' });
        }

        const [serie, numero] = String(venta.numero_comprobante || '').split('-');
        const resultado = await provider.consultarAnulacion({
            config: cfg,
            token: cfg.sunat_token,
            url: cfg.sunat_url,
            tipo_de_comprobante: tipoComprobanteCodigoConsulta(venta.tipo_comprobante),
            serie,
            numero,
        });

        const nuevoEstado = resultado.aceptadaPorSunat ? 'ANULADO'
            : (resultado.ok ? 'BAJA_ENVIADA' : 'NOTA_CREDITO_REQUERIDA');

        if (nuevoEstado !== 'BAJA_ENVIADA') {
            raw.prepare(`UPDATE ventas SET cpe_estado = ? WHERE id_venta = ?`).run(nuevoEstado, req.params.id_venta);
        }

        const documento = raw.prepare(`
            SELECT id_cpe FROM cpe_documentos
            WHERE proveedor = ? AND tipo_comprobante = ? AND serie = ? AND numero = ?
        `).get(proveedorId, venta.tipo_comprobante, serie, numero);

        if (documento) {
            raw.prepare(`
                UPDATE cpe_documentos SET estado = ?, response_json = ?, fecha_actualizacion = ?
                WHERE id_cpe = ?
            `).run(nuevoEstado, JSON.stringify(resultado.raw?.body || {}), new Date().toISOString(), documento.id_cpe);
        }

        registrarEvento({
            id_venta: req.params.id_venta,
            operacion: 'CONSULTAR_ANULACION',
            estado: nuevoEstado,
            response: resultado.raw?.body,
            usuario: req.user?.username,
        });

        if (nuevoEstado === 'ANULADO') {
            auditLog(req, 'CONFIRMAR_BAJA', 'COMPROBANTES',
                `Baja confirmada por SUNAT: ${venta.tipo_comprobante} ${venta.numero_comprobante} — Venta ${venta.numero_venta}`,
                { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
            );
        }

        res.json({
            exito: true,
            cpe_estado: nuevoEstado,
            aceptada_por_sunat: resultado.aceptadaPorSunat,
            sunat_description: resultado.sunatDescription,
        });
    } catch (err) {
        logger.error('FACTURACION', 'Error al consultar anulacion:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.put('/corregir-cliente/:id_venta', requireRole('ADMIN', 'CAJERO'), (req, res) => {
    try {
        const raw = db.db;
        const { tipo_documento, numero_documento, nombre_razon_social } = req.body;

        if (!numero_documento || !nombre_razon_social) {
            return res.status(400).json({ error: 'Numero de documento y nombre son obligatorios.' });
        }

        const venta = raw.prepare(`SELECT * FROM ventas WHERE id_venta = ?`).get(req.params.id_venta);
        if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
        if (venta.cpe_estado !== 'RECHAZADO') {
            return res.status(400).json({ error: 'Solo se puede corregir una venta con CPE rechazado.' });
        }
        if (!venta.id_cliente) {
            return res.status(400).json({ error: 'Esta venta no tiene cliente asociado.' });
        }

        raw.prepare(`
            UPDATE clientes
            SET tipo_documento = ?,
                numero_documento = ?,
                nombre_razon_social = ?
            WHERE id_cliente = ?
        `).run(tipo_documento, numero_documento, nombre_razon_social, venta.id_cliente);

        raw.prepare(`UPDATE ventas SET cpe_estado = NULL WHERE id_venta = ?`)
            .run(req.params.id_venta);

        registrarEvento({
            id_venta: req.params.id_venta,
            operacion: 'CORREGIR_CLIENTE',
            estado: 'REGISTRADO',
            request: { tipo_documento, numero_documento, nombre_razon_social },
            usuario: req.user?.username,
        });

        auditLog(req, 'CORREGIR_CLIENTE', 'COMPROBANTES',
            `Datos de cliente corregidos para reemitir CPE — Venta ${venta.numero_venta} | ` +
            `Nuevo: ${tipo_documento} ${numero_documento} — ${nombre_razon_social}`,
            { id_referencia: venta.id_venta, tipo_referencia: 'VENTA' }
        );

        res.json({ ok: true, mensaje: 'Datos del cliente corregidos. Ya puedes reemitir el CPE.' });
    } catch (err) {
        logger.error('FACTURACION', 'Error al corregir cliente:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;