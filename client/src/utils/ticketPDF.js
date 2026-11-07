import QRCode from 'qrcode';
import { condicionPago, medioPagoLabel } from './helpers';
import logger from './logger';

// ── Paleta y tipografía compartidas entre todos los tickets ──
// Navy corporativo + gris + rojo/verde semántico (alerta / saldo cubierto)
const PALETTE = {
    AZUL:       [21, 42, 66],    // navy — títulos, total
    AZUL_MEDIO: [58, 91, 130],   // navy secundario — bordes, montos de línea
    GRIS:       [115, 115, 118], // etiquetas
    GRIS_CLARO: [222, 225, 230], // bordes suaves / fondo franja total
    NEGRO:      [33, 33, 33],    // texto principal
    ROJO:       [188, 44, 44],   // alertas / descuentos / saldo pendiente
    VERDE:      [33, 122, 58],   // saldo cubierto
};

function getFontSizes(anchoMM) {
    return {
        fsNormal: anchoMM === 58 ? 7  : 8,
        fsSm:     anchoMM === 58 ? 6  : 7,
        fsTitle:  anchoMM === 58 ? 9  : 10,
        fsTotal:  anchoMM === 58 ? 12 : 13,
    };
}

/**
 * Función de dibujo pura — recibe el doc y todos los datos ya calculados.
 * Se llama dos veces: primera para medir el alto real, segunda para el PDF final.
 * Devuelve el valor final de y (cursor vertical).
 */
function drawTicket(doc, data) {
    const {
        anchoMM, pad, contentW,
        fsNormal, fsSm, fsTitle, fsTotal,
        AZUL, AZUL_MEDIO, GRIS, GRIS_CLARO, NEGRO, ROJO, VERDE,
        empresa, ruc, direccion, telefono,
        fechaStr, horaStr,
        nombreCliente, docCliente,
        tasaIGV, subtotalVal, igvVal, totalVal, mostrarIGV,
        tipoComprobante, mensajePie,
        qrDataUrl, qrInterno, isAnulado,
        items, venta, config,
    } = data;

    let y = pad;

    // ── Helpers ──────────────────────────────────────────────
    function setColor(rgb) { doc.setTextColor(...rgb); }
    function setDraw(rgb)  { doc.setDrawColor(...rgb); }
    function setFill(rgb)  { doc.setFillColor(...rgb); }

    // Línea divisoria centrada: respeta un espacio antes Y después,
    // en vez de pegarse al texto inmediatamente anterior.
    function lineSep(color = GRIS, lw = 0.2, gapBefore = 2, gapAfter = 2.5) {
        y += gapBefore;
        setDraw(color);
        doc.setLineWidth(lw);
        doc.line(pad, y, anchoMM - pad, y);
        y += gapAfter;
    }

    function textCenter(str, opts = {}) {
        if (!str) return;
        const { color = NEGRO, bold = false, size = fsNormal, charSpace = 0 } = opts;
        doc.setFontSize(size);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        setColor(color);
        doc.text(String(str), anchoMM / 2, y, { align: 'center', charSpace });
    }

    function textPair(label, value, opts = {}) {
        const { colorVal = NEGRO, bold = true, size = fsNormal, h = 5 } = opts;
        doc.setFontSize(size);
        doc.setFont('helvetica', 'normal');
        setColor(GRIS);
        doc.text(label, pad, y);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        setColor(colorVal);
        doc.text(value, anchoMM - pad, y, { align: 'right' });
        y += h;
    }

    // Etiqueta corta en mayúsculas con leve espaciado de letras (estilo "kicker")
    function sectionLabel(str, opts = {}) {
        const { color = GRIS, size = fsSm, x = pad } = opts;
        doc.setFontSize(size);
        doc.setFont('helvetica', 'bold');
        setColor(color);
        doc.text(String(str).toUpperCase(), x, y, { charSpace: 0.3 });
    }

    function nl(h = 4) { y += h; }

    // ── Logo ─────────────────────────────────────────────────
    if (config.ticket_logo && config.ticket_logo.startsWith('data:image/')) {
        try {
            const logoW  = anchoMM * 0.3;
            const props  = doc.getImageProperties(config.ticket_logo);
            const logoH  = logoW * (props.height / props.width);
            const logoX = (anchoMM - logoW) / 2;
            const ext   = config.ticket_logo.includes('image/png') ? 'PNG' : 'JPEG';
            doc.addImage(config.ticket_logo, ext, logoX, y, logoW, logoH, '', 'FAST');
            y += logoH + 3;
        } catch (_) { /* sin logo */ }
    }

    // ── Encabezado empresa ───────────────────────────────────
    textCenter(empresa, { color: AZUL, bold: true, size: fsTitle }); nl(4.8);
    textCenter(`RUC: ${ruc}`, { color: GRIS, size: fsSm }); nl(3.6);
    if (direccion) {
        doc.setFontSize(fsSm);
        doc.setFont('helvetica', 'normal');
        setColor(GRIS);
        const lines = doc.splitTextToSize(direccion, contentW);
        lines.forEach(l => { doc.text(l, anchoMM / 2, y, { align: 'center' }); y += 3.6; });
    }
    if (telefono) { textCenter(`Telf: ${telefono}`, { color: GRIS, size: fsSm }); nl(3.6); }

    // ── Tipo comprobante (recuadro con borde) ───────────────
    nl(2.5);
    {
        const boxTop = y;
        y += 4.3;
        textCenter(tipoComprobante, { color: AZUL, bold: true, size: fsNormal + 1, charSpace: 0.2 });
        y += 4.4;
        textCenter(venta.numero_comprobante || venta.numero_venta || '', { bold: true, color: NEGRO, size: fsNormal + 1 });
        y += 3;
        const boxH = y - boxTop;
        setDraw(AZUL_MEDIO); doc.setLineWidth(0.3);
        doc.roundedRect(pad, boxTop, contentW, boxH, 1.3, 1.3, 'S');
    }
    nl(3.2);

    // ── Serie máquina ────────────────────────────────────────
    if (config.ticket_serie_maquina) {
        textCenter(`Serie máquina: ${config.ticket_serie_maquina}`, { color: GRIS, size: fsSm }); nl(4);
    }

    // ── Fecha / Hora / Condición / Pago ─────────────────────
    lineSep(GRIS, 0.2, 1, 3);
    textPair('Fecha:', fechaStr);
    textPair('Hora:', horaStr);
    textPair('Condición:', condicionPago(venta.forma_pago));

    if (venta.forma_pago === 'CREDITO' && venta.credito) {
        const cr = venta.credito;
        const fmtFecha = cr.fecha_vencimiento
            ? new Date(cr.fecha_vencimiento + 'T00:00:00')
                .toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Sin fecha';
        const saldo = Number(cr.saldo_pendiente);
        textPair('Adelanto:', `S/ ${Number(cr.monto_adelanto).toFixed(2)}`);
        textPair('Saldo:', `S/ ${saldo.toFixed(2)}`, { colorVal: saldo > 0 ? ROJO : VERDE });
        textPair('Vence:', fmtFecha);
    } else {
        textPair('Medio:', medioPagoLabel(venta.forma_pago, venta.monto_efectivo, venta.monto_yape_plin));
    }

    // ── Cliente (filo de color a la izquierda) ───────────────
    nl(2.2);
    {
        const barW  = 1;
        const textX = pad + barW + 2.5;
        const blockTop = y - 2.4; // sube un poco para alinear con el alto de la letra de "CLIENTE"

        sectionLabel('Cliente', { x: textX }); y += 3.6;

        doc.setFontSize(fsNormal); doc.setFont('helvetica', 'bold'); setColor(NEGRO);
        const nombreLines = doc.splitTextToSize(nombreCliente, contentW - barW - 2.5 - 3);
        nombreLines.forEach(l => { doc.text(l, textX, y); y += 4; });

        let lastBaseline = y - 4; // línea base del último renglón del nombre

        if (docCliente) {
            doc.setFontSize(fsSm); doc.setFont('helvetica', 'normal'); setColor(GRIS);
            doc.text(docCliente, textX, y);
            lastBaseline = y;
            y += 3.6;
        }

        const blockBottom = lastBaseline + 1.3; // margen chico para el descendente, no la línea completa
        setFill(AZUL_MEDIO);
        doc.rect(pad, blockTop, barW, (blockBottom - blockTop), 'F');
    }
    nl(4.2);

    // ── Items ────────────────────────────────────────────────
    sectionLabel('Detalle', { color: AZUL });
    doc.setFontSize(fsSm); doc.setFont('helvetica', 'bold'); setColor(AZUL);
    doc.text('IMPORTE', anchoMM - pad, y, { align: 'right' });
    y += 2.2;
    lineSep(AZUL_MEDIO, 0.3, 0, 3);

    items.forEach((d, idx) => {
        if (idx > 0) nl(2.6);
        const precio     = Number(d.precio_unitario ?? d.precio_venta ?? 0);
        const subtotal   = Number(d.subtotal_linea  ?? (precio * d.cantidad));
        const nombre     = d.nombre_producto || d.nombre || '';
        const importeStr = `S/ ${subtotal.toFixed(2)}`;
        const linea1     = `${d.cantidad} x ${nombre}`;

        doc.setFontSize(fsNormal); doc.setFont('helvetica', 'bold'); setColor(NEGRO);
        const wrapped = doc.splitTextToSize(linea1, contentW - 18);
        doc.text(wrapped[0], pad, y);
        setColor(AZUL_MEDIO); doc.text(importeStr, anchoMM - pad, y, { align: 'right' }); y += 4.2;
        for (let i = 1; i < wrapped.length; i++) { setColor(NEGRO); doc.text(wrapped[i], pad, y); y += 4.2; }

        doc.setFontSize(fsSm); doc.setFont('helvetica', 'normal'); setColor(GRIS);
        doc.text(`S/ ${precio.toFixed(2)} c/u`, pad + 2, y); y += 3.6;

        if (d.descuento_linea > 0) {
            setColor(ROJO);
            doc.text(`Descuento: -S/ ${Number(d.descuento_linea).toFixed(2)}`, pad + 2, y); y += 3.6;
        }
    });

    // ── Totales ──────────────────────────────────────────────
    lineSep(GRIS, 0.2, 2.5, 2.5);
    if (mostrarIGV) {
        textPair('Op. Gravada:', `S/ ${subtotalVal.toFixed(2)}`, { size: fsSm, h: 4.2 });
        textPair(`IGV (${tasaIGV}%):`, `S/ ${igvVal.toFixed(2)}`, { size: fsSm, h: 4.2 });
        nl(1.5);
    }

    // Franja resaltada para el TOTAL
    {
        const bandH = anchoMM === 58 ? 7.5 : 8.2;
        setFill(GRIS_CLARO);
        doc.roundedRect(pad, y, contentW, bandH, 1.3, 1.3, 'F');
        const textY = y + bandH / 2 + (fsTotal * 0.16);
        doc.setFontSize(fsTotal); doc.setFont('helvetica', 'bold'); setColor(AZUL);
        doc.text('TOTAL', pad + 2, textY, { charSpace: 0.3 });
        doc.text(`S/ ${totalVal.toFixed(2)}`, anchoMM - pad - 2, textY, { align: 'right' });
        y += bandH + 3.5;
    }

    // ── Pie ──────────────────────────────────────────────────
    lineSep(GRIS, 0.2, 0, 3);
    textCenter(mensajePie, { color: GRIS, bold: true, size: fsSm }); nl(3.6);
    if (venta.cpe_estado === 'ACEPTADO') {
        textCenter('Representación impresa del CPE electrónico.', { color: GRIS, size: fsSm }); nl(3.6);
        textCenter('Consulte en: www1.sunat.gob.pe', { color: GRIS, size: fsSm }); nl(3.6);
    } else {
        textCenter('Documento interno de respaldo de operación comercial.', { color: GRIS, size: fsSm }); nl(3.6);
        textCenter('No es comprobante de pago electrónico (CPE).', { color: GRIS, size: fsSm }); nl(3.6);
    }
    if (qrInterno) { textCenter('Verificación interna — no válido ante SUNAT', { color: GRIS, size: fsSm }); nl(3.6); }

    // ── QR ───────────────────────────────────────────────────
    if (qrDataUrl) {
        const qrSize = anchoMM === 58 ? 28 : 34;
        const qrX    = (anchoMM - qrSize) / 2;
        nl(2.5);
        doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize);
        y += qrSize + 4;
    }

    // ── Marca ANULADO ────────────────────────────────────────
    if (isAnulado) {
        const midY = y / 2;
        doc.setFontSize(30); doc.setFont('helvetica', 'bold');
        doc.setTextColor(205, 95, 95);
        doc.text('ANULADO', anchoMM / 2, midY, { align: 'center', angle: 35 });

        // Borde perimetral para que la anulación se note incluso en vista rápida
        doc.setDrawColor(190, 44, 44);
        doc.setLineWidth(0.6);
        doc.roundedRect(1, 1, anchoMM - 2, (y + pad) - 2, 1.5, 1.5, 'S');
    }

    return y;
}

/**
 * Genera el PDF del ticket térmico directamente con jsPDF.
 * Usa dos pasadas para calcular el alto real antes de generar el PDF final.
 */
export async function buildTicketPDF(venta, config) {
    const { jsPDF } = await import('jspdf');
    const anchoMM  = parseInt(config.ticket_ancho || '80');
    const pad      = anchoMM === 58 ? 4 : 5;
    const contentW = anchoMM - pad * 2;
    const items    = venta.detalles || venta.items || [];
    const isBoleta = (venta.tipo_comprobante || '').toUpperCase() === 'BOLETA';
    const isAnulado = venta.estado === 'ANULADA';

    const empresa   = (config.empresa_nombre || 'MI EMPRESA').toUpperCase();
    const ruc       = config.empresa_ruc || '00000000000';
    const direccion = [config.empresa_direccion, config.empresa_distrito, config.empresa_provincia]
        .filter(Boolean).join(', ');
    const telefono  = config.empresa_telefono || '';

    const fecha    = new Date(venta.fecha_hora || new Date());
    const fechaStr = fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaStr  = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const nombreCliente = venta.cliente?.nombre_razon_social || 'CONSUMIDOR FINAL';
    const docCliente    = venta.cliente
        ? `${venta.cliente.tipo_documento}: ${venta.cliente.numero_documento}`
        : '';

    const tasaIGV     = parseFloat(config.igv || 18);
    const divisorIGV  = 1 + (tasaIGV / 100);
    const subtotalVal = venta.subtotal ?? (venta.total / divisorIGV);
    const igvVal      = venta.igv      ?? (venta.total - subtotalVal);
    const totalVal    = venta.total    ?? 0;
    const mostrarIGV  = config.ticket_mostrar_igv === '1' || config.ticket_mostrar_igv === true;

    const tipoComprobante = venta.cpe_estado === 'ACEPTADO'
        ? (isBoleta ? 'BOLETA DE VENTA' : 'FACTURA DE VENTA')
        : (isBoleta ? 'NOTA DE VENTA (Boleta)' : 'NOTA DE VENTA (Factura)');

    const mensajePie = config.ticket_mensaje_pie || '¡Gracias por su compra!';

    // ── QR ────────────────────────────────────────────────────
    let qrDataUrl = '';
    let qrInterno = false;
    try {
        let qrData = '';
        if (venta.cpe_estado === 'ACEPTADO') {
            const numComp  = venta.numero_comprobante || '';
            const guionIdx = numComp.indexOf('-');
            const serie    = guionIdx > -1 ? numComp.slice(0, guionIdx) : numComp;
            const numero   = guionIdx > -1 ? String(parseInt(numComp.slice(guionIdx + 1), 10) || 0) : '';
            const TABLA2   = { 'DNI': '1', 'RUC': '6', 'CE': '4', 'PASAPORTE': '7', 'CARNET_EXTRANJERIA': '4', 'PARTIDA_NACIMIENTO': '0' };
            const tipoDocCli  = venta.cliente?.tipo_documento ? (TABLA2[venta.cliente.tipo_documento] || '-') : '0';
            const nroDocCli   = venta.cliente?.numero_documento || '-';
            const tipoDocComp = isBoleta ? '03' : '01';
            const fechaQR = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
            qrData = [ruc, tipoDocComp, serie, numero, igvVal.toFixed(2), totalVal.toFixed(2), fechaQR, tipoDocCli, nroDocCli].join('|');
        } else {
            qrInterno = true;
            const fechaQR = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
            qrData = `HUASCARAN|${venta.numero_venta}|${totalVal.toFixed(2)}|${fechaQR}`;
        }
        qrDataUrl = await QRCode.toDataURL(qrData, { width: 200, margin: 1 });
    } catch (_) { /* sin QR */ }

    const drawData = {
        anchoMM, pad, contentW,
        ...getFontSizes(anchoMM),
        ...PALETTE,
        empresa, ruc, direccion, telefono,
        fechaStr, horaStr,
        nombreCliente, docCliente,
        tasaIGV, subtotalVal, igvVal, totalVal, mostrarIGV,
        tipoComprobante, mensajePie,
        qrDataUrl, qrInterno, isAnulado,
        items, venta, config,
    };

    // ── Primera pasada: medir alto real ──────────────────────
    const docMedicion = new jsPDF({ unit: 'mm', format: [anchoMM, 2000], orientation: 'portrait' });
    const yFinal = drawTicket(docMedicion, drawData);
    const altoReal = yFinal + pad;
    logger.debug('TICKET_PDF', 'altoReal calculado:', altoReal, 'mm');

    // ── Segunda pasada: PDF final con alto exacto ────────────
    const docFinal = new jsPDF({ unit: 'mm', format: [anchoMM, altoReal], orientation: 'portrait' });
    drawTicket(docFinal, drawData);

    const base64 = docFinal.output('datauristring').split(',')[1];
    return { base64, anchoMM };
}

/**
 * Función de dibujo del ticket de constancia de abono — mismo patrón que drawTicket
 * (doble pasada: medir alto real, luego generar el PDF final).
 */
function drawAbonoTicket(doc, data) {
    const {
        anchoMM, pad, contentW,
        fsNormal, fsSm, fsTitle, fsTotal,
        AZUL, AZUL_MEDIO, GRIS, GRIS_CLARO, NEGRO, ROJO, VERDE,
        empresa, ruc, direccion, telefono,
        fechaStr, horaStr,
        nombreCliente, docCliente,
        comprobanteOrigen, numeroVenta, medioPagoStr,
        montoAbonado, saldoNuevo,
        montoTotalDeuda, totalAbonado, historial,
        config,
    } = data;

    let y = pad;

    // ── Helpers (mismo estilo que drawTicket) ──────────────────
    function setColor(rgb) { doc.setTextColor(...rgb); }
    function setDraw(rgb)  { doc.setDrawColor(...rgb); }
    function setFill(rgb)  { doc.setFillColor(...rgb); }

    function lineSep(color = GRIS, lw = 0.2, gapBefore = 2, gapAfter = 2.5) {
        y += gapBefore;
        setDraw(color);
        doc.setLineWidth(lw);
        doc.line(pad, y, anchoMM - pad, y);
        y += gapAfter;
    }

    function textCenter(str, opts = {}) {
        if (!str) return;
        const { color = NEGRO, bold = false, size = fsNormal, charSpace = 0 } = opts;
        doc.setFontSize(size);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        setColor(color);
        doc.text(String(str), anchoMM / 2, y, { align: 'center', charSpace });
    }

    function textPair(label, value, opts = {}) {
        const { colorVal = NEGRO, bold = true, size = fsNormal, h = 5 } = opts;
        doc.setFontSize(size);
        doc.setFont('helvetica', 'normal');
        setColor(GRIS);
        doc.text(label, pad, y);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        setColor(colorVal);
        doc.text(value, anchoMM - pad, y, { align: 'right' });
        y += h;
    }

    function sectionLabel(str, opts = {}) {
        const { color = GRIS, size = fsSm, x = pad } = opts;
        doc.setFontSize(size);
        doc.setFont('helvetica', 'bold');
        setColor(color);
        doc.text(String(str).toUpperCase(), x, y, { charSpace: 0.3 });
    }

    function nl(h = 4) { y += h; }

    // ── Logo ─────────────────────────────────────────────────
    if (config.ticket_logo && config.ticket_logo.startsWith('data:image/')) {
        try {
            const logoW = anchoMM * 0.3;
            const props = doc.getImageProperties(config.ticket_logo);
            const logoH = logoW * (props.height / props.width);
            const logoX = (anchoMM - logoW) / 2;
            const ext = config.ticket_logo.includes('image/png') ? 'PNG' : 'JPEG';
            doc.addImage(config.ticket_logo, ext, logoX, y, logoW, logoH, '', 'FAST');
            y += logoH + 3;
        } catch (_) { /* sin logo */ }
    }

    // ── Encabezado empresa ───────────────────────────────────
    textCenter(empresa, { color: AZUL, bold: true, size: fsTitle }); nl(4.8);
    textCenter(`RUC: ${ruc}`, { color: GRIS, size: fsSm }); nl(3.6);
    if (direccion) {
        doc.setFontSize(fsSm);
        doc.setFont('helvetica', 'normal');
        setColor(GRIS);
        const lines = doc.splitTextToSize(direccion, contentW);
        lines.forEach(l => { doc.text(l, anchoMM / 2, y, { align: 'center' }); y += 3.6; });
    }
    if (telefono) { textCenter(`Telf: ${telefono}`, { color: GRIS, size: fsSm }); nl(3.6); }

    // ── Título (recuadro con borde) ─────────────────────────
    nl(2.5);
    {
        const boxTop = y;
        y += 4.3;
        textCenter('CONSTANCIA DE ABONO', { color: AZUL, bold: true, size: fsNormal + 1, charSpace: 0.2 });
        y += 4.4;
        textCenter(comprobanteOrigen || numeroVenta || 'S/N', { bold: true, color: NEGRO, size: fsNormal + 1 });
        y += 3;
        const boxH = y - boxTop;
        setDraw(AZUL_MEDIO); doc.setLineWidth(0.3);
        doc.roundedRect(pad, boxTop, contentW, boxH, 1.3, 1.3, 'S');
    }
    nl(3.2);

    // ── Fecha / hora / venta / medio de pago ────────────────
    lineSep(GRIS, 0.2, 1, 3);
    textPair('Fecha:', fechaStr);
    textPair('Hora:', horaStr);
    if (numeroVenta) textPair('N° Venta:', numeroVenta);
    textPair('Medio de pago:', medioPagoStr);

    // ── Cliente (filo de color a la izquierda) ──────────────
    nl(2.2);
    {
        const barW = 1;
        const textX = pad + barW + 2.5;
        const blockTop = y - 2.4;

        sectionLabel('Cliente', { x: textX }); y += 3.6;

        doc.setFontSize(fsNormal); doc.setFont('helvetica', 'bold'); setColor(NEGRO);
        const nombreLines = doc.splitTextToSize(nombreCliente, contentW - barW - 2.5 - 3);
        nombreLines.forEach(l => { doc.text(l, textX, y); y += 4; });

        let lastBaseline = y - 4;

        if (docCliente) {
            doc.setFontSize(fsSm); doc.setFont('helvetica', 'normal'); setColor(GRIS);
            doc.text(docCliente, textX, y);
            lastBaseline = y;
            y += 3.6;
        }

        const blockBottom = lastBaseline + 1.3;
        setFill(AZUL_MEDIO);
        doc.rect(pad, blockTop, barW, (blockBottom - blockTop), 'F');
    }
    nl(4.2);

    // ── Franja resaltada: monto abonado ─────────────────────
    lineSep(AZUL_MEDIO, 0.3, 0, 3);
    {
        const bandH = anchoMM === 58 ? 7.5 : 8.2;
        setFill(GRIS_CLARO);
        doc.roundedRect(pad, y, contentW, bandH, 1.3, 1.3, 'F');
        const textY = y + bandH / 2 + (fsTotal * 0.16);
        doc.setFontSize(fsTotal); doc.setFont('helvetica', 'bold'); setColor(AZUL);
        doc.text('ABONADO', pad + 2, textY, { charSpace: 0.3 });
        doc.text(`S/ ${montoAbonado.toFixed(2)}`, anchoMM - pad - 2, textY, { align: 'right' });
        y += bandH + 3.5;
    }

    // ── Deuda original ───────────────────────────────────────
    lineSep(GRIS, 0.2, 0, 3);
    textPair('Deuda original:', `S/ ${montoTotalDeuda.toFixed(2)}`, { size: fsSm, h: 4.2, bold: true });

    // ── Historial de abonos (cronológico; este pago queda al final) ──
    if (historial.length > 0) {
        nl(1.5);
        sectionLabel('Historial de abonos'); y += 3.8;
        historial.forEach((h, i) => {
            const esEste = i === historial.length - 1;
            const fechaCorta = h.fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
            doc.setFontSize(fsSm);
            doc.setFont('helvetica', esEste ? 'bold' : 'normal');
            setColor(esEste ? AZUL : GRIS);
            doc.text(esEste ? `${fechaCorta} (este pago)` : fechaCorta, pad, y);
            setColor(esEste ? AZUL : NEGRO);
            doc.text(`S/ ${h.monto.toFixed(2)}`, anchoMM - pad, y, { align: 'right' });
            y += 3.8;
        });
        nl(0.5);
    }

    // ── Totales ──────────────────────────────────────────────
    lineSep(GRIS, 0.2, 0, 3);
    textPair('Total abonado:', `S/ ${totalAbonado.toFixed(2)}`, { size: fsSm, h: 4.2 });
    nl(1);
    textPair('Saldo pendiente:', `S/ ${saldoNuevo.toFixed(2)}`, {
        colorVal: saldoNuevo > 0 ? ROJO : VERDE, size: fsNormal + 0.5, h: 5.5,
    });

    // ── Pie ──────────────────────────────────────────────────
    lineSep(GRIS, 0.2, 2, 3);
    textCenter('¡Gracias por su pago!', { color: GRIS, bold: true, size: fsSm }); nl(3.6);
    textCenter('Documento interno de respaldo de operación comercial.', { color: GRIS, size: fsSm }); nl(3.6);
    textCenter('No es comprobante de pago electrónico (CPE).', { color: GRIS, size: fsSm }); nl(2);

    return y;
}

/**
 * Genera el PDF de constancia de abono con el mismo formato de ticket térmico
 * que las boletas/facturas de venta (ancho configurable, doble pasada).
 *
 * @param {object} data
 * @param {object} data.venta          - venta/crédito origen (numero_comprobante, numero_venta)
 * @param {object} data.cliente        - cliente (nombre_razon_social, tipo_documento, numero_documento)
 * @param {number} data.montoAbonado
 * @param {string} data.medioPago
 * @param {number} data.saldoAnterior
 * @param {object} config              - configuración pública de la empresa (misma que usa buildTicketPDF)
 */
export async function buildAbonoTicketPDF(data, config) {
    const { jsPDF } = await import('jspdf');
    const anchoMM  = parseInt(config.ticket_ancho || '80');
    const pad      = anchoMM === 58 ? 4 : 5;
    const contentW = anchoMM - pad * 2;

    const empresa   = (config.empresa_nombre || 'MI EMPRESA').toUpperCase();
    const ruc       = config.empresa_ruc || '00000000000';
    const direccion = [config.empresa_direccion, config.empresa_distrito, config.empresa_provincia]
        .filter(Boolean).join(', ');
    const telefono  = config.empresa_telefono || '';

    const { venta, cliente, montoAbonado, medioPago, saldoAnterior, fechaAbono, montoTotalDeuda, historialAbonos } = data;

    // Usa la fecha real del abono (reimpresión) en vez de la hora del clic; si no viene, es un abono recién hecho
    const ahora    = fechaAbono ? new Date(fechaAbono) : new Date();
    const fechaStr = ahora.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaStr  = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    const montoAbonadoNum   = Number(montoAbonado);
    const saldoAnteriorNum  = Number(saldoAnterior);
    const saldoNuevo        = Math.max(0, saldoAnteriorNum - montoAbonadoNum);
    const montoTotalDeudaNum = Number(montoTotalDeuda) || 0;

    // historialAbonos viene en orden DESC (más reciente primero, terminando en el abono de este ticket);
    // para mostrarlo como cronología de lectura natural, se invierte a ASC (más antiguo primero, este pago al final)
    const historial = Array.isArray(historialAbonos)
        ? [...historialAbonos].reverse().map(a => ({
            fecha: new Date(a.fecha_abono),
            monto: Number(a.monto_abonado),
        }))
        : [];
    const totalAbonadoNum = historial.length
        ? historial.reduce((s, a) => s + a.monto, 0)
        : montoAbonadoNum; // fallback si no hay historial disponible

    const nombreCliente = cliente?.nombre_razon_social || 'CONSUMIDOR FINAL';
    const docCliente     = cliente
        ? `${cliente.tipo_documento || ''}: ${cliente.numero_documento || ''}`.trim()
        : '';

    const drawData = {
        anchoMM, pad, contentW,
        ...getFontSizes(anchoMM),
        ...PALETTE,
        empresa, ruc, direccion, telefono,
        fechaStr, horaStr,
        nombreCliente, docCliente,
        comprobanteOrigen: venta?.numero_comprobante || venta?.numero_venta || 'S/N',
        numeroVenta: venta?.numero_venta || '',
        medioPagoStr: medioPagoLabel(medioPago),
        montoAbonado: montoAbonadoNum,
        saldoAnterior: saldoAnteriorNum,
        saldoNuevo,
        montoTotalDeuda: montoTotalDeudaNum,
        totalAbonado: totalAbonadoNum,
        historial,
        config,
    };

    // ── Primera pasada: medir alto real ──────────────────────
    const docMedicion = new jsPDF({ unit: 'mm', format: [anchoMM, 2000], orientation: 'portrait' });
    const yFinal = drawAbonoTicket(docMedicion, drawData);
    const altoReal = yFinal + pad;

    // ── Segunda pasada: PDF final con alto exacto ────────────
    const docFinal = new jsPDF({ unit: 'mm', format: [anchoMM, altoReal], orientation: 'portrait' });
    drawAbonoTicket(docFinal, drawData);

    const base64 = docFinal.output('datauristring').split(',')[1];
    return { base64, anchoMM };
}
