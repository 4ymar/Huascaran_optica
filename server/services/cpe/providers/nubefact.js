const https = require('https');

function tipoDocCodigo(tipo) {
    const map = { DNI: '1', RUC: '6', CE: '4', PASAPORTE: '7' };
    return map[(tipo || '').toUpperCase()] || '-';
}

function unidadCodigo(unidad) {
    function unidadCodigo(unidad) {
        const map = {
            UND: 'NIU',
            UNIDAD: 'NIU',
            KG: 'KGM',
            KILO: 'KGM',
            M: 'MTR',
            METRO: 'MTR',
            M2: 'MTK',
            M3: 'MTQ',
            LT: 'LTR',
            LITRO: 'LTR',
            GALON: 'GLL',
            CAJA: 'BX',
            PAR: 'PR',
            MILLAR: 'MIL',
            BOLSA: 'NIU',
            VARILLA: 'NIU',
            PLANCHA: 'NIU',
            ROLLO: 'NIU',
            JUEGO: 'NIU',
        };
        return map[(unidad || '').toUpperCase()] || 'NIU';
    }

        const map = {
        UND: 'NIU',
        UNIDAD: 'NIU',
        KG: 'KGM',
        KILO: 'KGM',
        M: 'MTR',
        METRO: 'MTR',
        M2: 'MTK',
        LT: 'LTR',
        LITRO: 'LTR',
        BOLSA: 'NIU',
        VARILLA: 'NIU',
        PLANCHA: 'NIU',
        ROLLO: 'NIU',
        JUEGO: 'NIU',
    };
    return map[(unidad || '').toUpperCase()] || 'NIU';
}

function formatFechaNubefact(fechaISO) {
    const d = new Date(fechaISO);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function buildItems(venta) {
    return (venta.detalles || []).map((d) => {
        const precioConIgv = Number(d.precio_unitario);
        const subtotalLinea = Number(d.subtotal_linea);
        const cantidad = Number(d.cantidad || 1);
        const tipoIgv = Number(d.tipo_igv) || 1; // 1: Gravado, 8: Exonerado, 9: Inafecto

        let igvLinea = 0;
        let subtotalSinIgv = subtotalLinea;

        if (tipoIgv === 1) {
            igvLinea = Math.round((subtotalLinea * 18 / 118) * 100) / 100;
            subtotalSinIgv = Math.round((subtotalLinea - igvLinea) * 100) / 100;
        } else {
            igvLinea = 0;
            subtotalSinIgv = subtotalLinea;
        }

        const valorUnitario = Math.round((subtotalSinIgv / cantidad) * 1000000) / 1000000;

        return {
            unidad_de_medida: unidadCodigo(d.unidad_medida),
            codigo: d.sku || d.id_producto,
            descripcion: d.nombre_producto || d.nombre_producto_actual,
            codigo_producto_sunat: d.codigo_producto_sunat || '',
            cantidad,
            valor_unitario: valorUnitario,
            precio_unitario: precioConIgv,
            subtotal: subtotalSinIgv,
            tipo_de_igv: tipoIgv,
            igv: igvLinea,
            total: subtotalLinea,
            anticipo_regularizacion: false,
        };
    });
}

function calcularTotales(items) {
    let totalGravada = 0;
    let totalExonerada = 0;
    let totalInafecta = 0;
    let totalIgv = 0;

    for (const item of items) {
        if (item.tipo_de_igv === 8) {
            totalExonerada += item.subtotal;
        } else if (item.tipo_de_igv === 9) {
            totalInafecta += item.subtotal;
        } else {
            totalGravada += item.subtotal;
            totalIgv += item.igv;
        }
    }

    return {
        total_gravada: Math.round(totalGravada * 100) / 100,
        total_exonerada: Math.round(totalExonerada * 100) / 100,
        total_inafecta: Math.round(totalInafecta * 100) / 100,
        total_igv: Math.round(totalIgv * 100) / 100,
    };
}

function buildPayload(venta, config) {
    const isBoleta = venta.tipo_comprobante === 'BOLETA';
    const items = buildItems(venta);
    const totales = calcularTotales(items);

    const cliente = venta.cliente || {};
    const tieneCliente = cliente.numero_documento;
    const fechaVenc = venta.credito?.fecha_vencimiento || venta.fecha_vencimiento || '';

    return {
        operacion: 'generar_comprobante',
        tipo_de_comprobante: isBoleta ? 2 : 1,
        serie: separarNumeroComprobante(venta.numero_comprobante).serie,
        numero: separarNumeroComprobante(venta.numero_comprobante).numero,
        sunat_transaction: 1,
        cliente_tipo_de_documento: tieneCliente ? tipoDocCodigo(cliente.tipo_documento) : '-',
        cliente_numero_de_documento: tieneCliente ? cliente.numero_documento : '-',
        cliente_denominacion: tieneCliente ? cliente.nombre_razon_social : 'CONSUMIDOR FINAL',
        cliente_direccion: cliente.direccion || '',
        cliente_email: cliente.email || '',
        cliente_email_1: '',
        cliente_email_2: '',
        fecha_de_emision: formatFechaNubefact(venta.fecha_hora),
        fecha_de_vencimiento: fechaVenc ? formatFechaNubefact(fechaVenc) : '',
        moneda: 1,
        porcentaje_de_igv: Number(config.igv || 18),
        descuento_global: Number(venta.descuento || 0),
        total_descuento: Number(venta.descuento || 0),
        total_anticipo: 0,
        total_gravada: totales.total_gravada,
        total_inafecta: totales.total_inafecta,
        total_exonerada: totales.total_exonerada,
        total_igv: totales.total_igv,
        total_gratuita: 0,
        total_otros_cargos: 0,
        total: Number(venta.total || 0),
        percepcion_tipo: '',
        percepcion_base_imponible: 0,
        total_percepcion: 0,
        total_incluido_percepcion: 0,
        detraccion: false,
        observaciones: venta.notas || '',
        documento_que_se_modifica_tipo: '',
        documento_que_se_modifica_serie: '',
        documento_que_se_modifica_numero: '',
        tipo_de_nota_de_credito: '',
        tipo_de_nota_de_debito: '',
        enviar_automaticamente_a_la_sunat: true,
        enviar_automaticamente_al_cliente: config.cpe_envio_email_cliente !== '0' && !!cliente.email,
        formato_de_pdf: config.cpe_formato_pdf || 'A4',
        items,
    };
}

function separarNumeroComprobante(numeroComprobante = '') {
    const partes = String(numeroComprobante).split('-');
    return {
        serie: partes[0] || '',
        numero: Number(partes[1] || 0),
    };
}

function buildPayloadNota(venta, config, notaData) {
    const isBoleta = venta.tipo_comprobante === 'BOLETA';
    const { serie: serieOriginal, numero: numeroOriginal } = separarNumeroComprobante(venta.numero_comprobante);

    const serieNota = isBoleta
        ? (config.serie_nota_credito_boleta || '')
        : (config.serie_nota_credito_factura || '');
    const correlativoNota = isBoleta
        ? Number(config.correlativo_nota_credito_boleta || 1)
        : Number(config.correlativo_nota_credito_factura || 1);

    const cliente = venta.cliente || {};
    const tieneCliente = cliente.numero_documento;
    const fechaVenc = venta.credito?.fecha_vencimiento || venta.fecha_vencimiento || '';
    const items = buildItems(venta);
    const totales = calcularTotales(items);

    return {
        operacion: 'generar_comprobante',
        tipo_de_comprobante: 3,
        serie: serieNota,
        numero: correlativoNota,
        sunat_transaction: 1,
        cliente_tipo_de_documento: tieneCliente ? tipoDocCodigo(cliente.tipo_documento) : '-',
        cliente_numero_de_documento: tieneCliente ? cliente.numero_documento : '-',
        cliente_denominacion: tieneCliente ? cliente.nombre_razon_social : 'CONSUMIDOR FINAL',
        cliente_direccion: cliente.direccion || '',
        cliente_email: cliente.email || '',
        cliente_email_1: '',
        cliente_email_2: '',
        fecha_de_emision: formatFechaNubefact(new Date().toISOString()),
        fecha_de_vencimiento: fechaVenc ? formatFechaNubefact(fechaVenc) : '',
        moneda: 1,
        porcentaje_de_igv: Number(config.igv || 18),
        descuento_global: Number(venta.descuento || 0),
        total_descuento: Number(venta.descuento || 0),
        total_anticipo: 0,
        total_gravada: totales.total_gravada,
        total_inafecta: totales.total_inafecta,
        total_exonerada: totales.total_exonerada,
        total_igv: totales.total_igv,
        total_gratuita: 0,
        total_otros_cargos: 0,
        total: Number(venta.total || 0),
        percepcion_tipo: '',
        percepcion_base_imponible: 0,
        total_percepcion: 0,
        total_incluido_percepcion: 0,
        detraccion: false,
        observaciones: notaData.motivo_descripcion || '',
        documento_que_se_modifica_tipo: isBoleta ? 2 : 1,
        documento_que_se_modifica_serie: serieOriginal,
        documento_que_se_modifica_numero: numeroOriginal,
        tipo_de_nota_de_credito: Number(notaData.motivo_codigo || 1),
        tipo_de_nota_de_debito: '',
        enviar_automaticamente_a_la_sunat: true,
        enviar_automaticamente_al_cliente: config.cpe_envio_email_cliente !== '0' && !!cliente.email,
        formato_de_pdf: config.cpe_formato_pdf || 'A4',
        items: buildItems(venta),
    };
}

async function emitirNota({ venta, config, token, url, notaData }) {
    const payload = buildPayloadNota(venta, config, notaData);
    const result = await requestJson(url, token, payload);
    return {
        provider: 'nubefact',
        payload,
        raw: result,
        ok: result.status === 200 && !!(result.body?.enlace_del_pdf || result.body?.codigo_hash),
        alreadyExists: result.body?.codigo === 23,
        hash: result.body?.codigo_hash || '',
        pdfUrl: result.body?.enlace_del_pdf || '',
        xmlUrl: result.body?.enlace_del_xml || '',
        cdrUrl: result.body?.enlace_del_cdr || '',
    };
}

function requestJson(url, token, payload, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: `${urlObj.pathname}${urlObj.search || ''}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Token token="${token}"`,
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (_) { resolve({ status: res.statusCode, body: data }); }
            });
        });

        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('Timeout NubeFact - intente nuevamente')); });
        req.write(body);
        req.end();
    });
}

async function emitir({ venta, config, token, url }) {
    const payload = buildPayload(venta, config);
    const result = await requestJson(url, token, payload);
    return {
        provider: 'nubefact',
        payload,
        raw: result,
        ok: result.status === 200 && !!(result.body?.enlace_del_pdf || result.body?.codigo_hash),
        alreadyExists: result.body?.codigo === 23,
        hash: result.body?.codigo_hash || '',
        pdfUrl: result.body?.enlace_del_pdf || '',
        xmlUrl: result.body?.enlace_del_xml || '',
        cdrUrl: result.body?.enlace_del_cdr || '',
    };
}

async function probarConexion({ config, token, url }) {
    const serie = config.serie_factura || 'F001';
    const result = await requestJson(url, token, {
        operacion: 'consultar_comprobante',
        tipo_de_comprobante: 1,
        serie,
        numero: 1,
    }, 15000);

    return {
        provider: 'nubefact',
        reachable: true,
        status: result.status,
        body: result.body,
    };
}

async function consultarEstado({ config, token, url, tipo_de_comprobante, serie, numero }) {
    const result = await requestJson(url, token, {
        operacion: 'consultar_comprobante',
        tipo_de_comprobante,
        serie,
        numero: Number(numero),
    }, 15000);

    return {
        provider: 'nubefact',
        raw: result,
        ok: result.status === 200 && !result.body?.errors,
        errorCodigo: result.body?.codigo,
        errorMensaje: result.body?.errors,
        aceptadaPorSunat: result.body?.aceptada_por_sunat,
        sunatDescription: result.body?.sunat_description || '',
        anulado: result.body?.anulado,
        hash: result.body?.codigo_hash || '',
        pdfUrl: result.body?.enlace_del_pdf || '',
        xmlUrl: result.body?.enlace_del_xml || '',
        cdrUrl: result.body?.enlace_del_cdr || '',
    };
}

async function anular({ venta, config, token, url, motivo }) {
    const isBoleta = venta.tipo_comprobante === 'BOLETA';
    const serie = isBoleta ? (config.serie_boleta || 'B001') : (config.serie_factura || 'F001');
    const numero = parseInt((venta.numero_comprobante || '').split('-')[1] || '1', 10);

    const payload = {
        operacion: 'generar_anulacion',
        tipo_de_comprobante: isBoleta ? 2 : 1,
        serie,
        numero,
        motivo: motivo || venta.notas || 'Anulacion',
    };

    const result = await requestJson(url, token, payload, 20000);

    return {
        provider: 'nubefact',
        payload,
        raw: result,
        ok: result.status === 200 && !result.body?.errors,
        ticket: result.body?.ticket || result.body?.numero_ticket || '',
        aceptadaPorSunat: result.body?.aceptada_por_sunat,
        sunatDescription: result.body?.sunat_description || '',
        errorMensaje: result.body?.errors,
    };
}

async function consultarAnulacion({ token, url, tipo_de_comprobante, serie, numero }) {
    const result = await requestJson(url, token, {
        operacion: 'consultar_anulacion',
        tipo_de_comprobante,
        serie,
        numero: Number(numero),
    }, 15000);

    return {
        provider: 'nubefact',
        raw: result,
        ok: result.status === 200 && !result.body?.errors,
        errorMensaje: result.body?.errors,
        aceptadaPorSunat: result.body?.aceptada_por_sunat,
        sunatDescription: result.body?.sunat_description || '',
    };
}

module.exports = {
    id: 'nubefact',
    buildPayload,
    buildPayloadNota,
    emitir,
    emitirNota,
    consultarEstado,
    probarConexion,
    anular,
    consultarAnulacion,
};
