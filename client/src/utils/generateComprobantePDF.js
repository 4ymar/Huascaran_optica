import { getPublicConfig, guardarArchivoLocal } from '../services/api';
import { condicionPago, medioPagoLabel } from './helpers';
import logger from './logger';
import QRCode from 'qrcode';

function numeroALetras(monto) {
    const entero = Math.floor(monto);
    const centavos = Math.round((monto - entero) * 100);
    const unidades = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
        'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE'];
    const decenas = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
    const centenas = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
    function convertir(n) {
        if (n === 0) return 'CERO';
        if (n === 100) return 'CIEN';
        if (n <= 20) return unidades[n];
        if (n < 100) { const d = Math.floor(n/10); const u = n%10; return u===0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`; }
        if (n < 1000) { const c = Math.floor(n/100); const r = n%100; return r===0 ? centenas[c] : `${centenas[c]} ${convertir(r)}`; }
        if (n < 1000000) { const m = Math.floor(n/1000); const r = n%1000; const p = m===1 ? 'MIL' : `${convertir(m)} MIL`; return r===0 ? p : `${p} ${convertir(r)}`; }
        return String(n);
    }
    return `${convertir(entero)} Y ${String(centavos).padStart(2,'0')}/100`;
}

export async function generateComprobantePDF(venta, opts = {}) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const config = await getPublicConfig();

    const isAnulado  = venta.estado === 'ANULADA';
    const isBoleta   = venta.tipo_comprobante === 'BOLETA';
    const tituloComprobante = venta.cpe_estado === 'ACEPTADO'
    ? (isBoleta ? 'BOLETA DE VENTA ELECTRONICA' : 'FACTURA DE VENTA ELECTRONICA')
    : (isBoleta ? 'NOTA DE VENTA (Boleta)' : 'NOTA DE VENTA (Factura)');
    const empresa    = config.empresa_nombre || 'MI EMPRESA';
    const ruc        = config.empresa_ruc || '00000000000';
    const direccion  = [config.empresa_direccion, config.empresa_distrito, config.empresa_provincia, config.empresa_departamento].filter(Boolean).join(', ');
    const telefono   = config.empresa_telefono || '';
    const fecha      = new Date(venta.fecha_hora || new Date());
    const fechaStr   = fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaStr    = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const AZUL       = [26, 60, 94];
    const GRIS_TEXTO = [100, 100, 100];
    const GRIS_SOMBRA= [240, 240, 240];

    const nombreCliente = venta.cliente?.nombre_razon_social || 'CONSUMIDOR FINAL';
    const docCliente    = venta.cliente ? `${venta.cliente.tipo_documento}: ${venta.cliente.numero_documento}` : '';
    const subtotalVal   = venta.subtotal ?? (venta.total / 1.18);
    const igvVal        = venta.igv ?? (venta.total - subtotalVal);
    const totalVal      = venta.total ?? 0;
    const items         = venta.detalles || venta.items || [];

    // ── HEADER ───────────────────────────────────────────────
    doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
    doc.rect(10, 10, 118, 28);

    const logoEmpresa = config.ticket_logo || null;
    const textoX = logoEmpresa ? 40 : 14; // desplaza texto si hay logo

    if (logoEmpresa && logoEmpresa.startsWith('data:image')) {
        try {
            const logoBase64 = logoEmpresa.split(',')[1];
            doc.addImage(logoBase64, 'PNG', 12, 14, 22, 22);
        } catch (e) {
            logger.error('COMPROBANTE_PDF', 'Error al insertar logo:', e);
        }
    }

    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text(empresa.toUpperCase(), textoX, 18);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
    doc.text(`RUC: ${ruc}`, textoX, 24);
    doc.text(direccion, textoX, 29);
    if (telefono) doc.text(`Telf: ${telefono}`, textoX, 34);

    doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
    doc.rect(132, 10, 68, 28);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text(tituloComprobante, 166, 18, { align: 'center' });
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
    doc.text(`RUC: ${ruc}`, 166, 23, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text(venta.numero_comprobante || venta.numero_venta, 166, 31, { align: 'center' });

    // ── INFO GENERAL ─────────────────────────────────────────
    let y = 44;
    doc.setFillColor(...GRIS_SOMBRA); doc.rect(10, y, 190, venta.forma_pago === 'CREDITO' && venta.credito ? 34 : 18, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
    doc.text(`Fecha de emision:`, 14, y + 5);
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold');
    doc.text(fechaStr, 43, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
    doc.text(`Hora:`, 75, y + 5);
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold');
    doc.text(horaStr, 85, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
    doc.text(`Condicion de pago:`, 120, y + 5);
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold');
    doc.text(condicionPago(venta.forma_pago), 157, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
    
    if (venta.forma_pago === 'CREDITO' && venta.credito) {
        const cr       = venta.credito;
        const fmtFecha = cr.fecha_vencimiento
            ? new Date(cr.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Sin fecha';
        const medioAd  = medioPagoLabel(cr.medio_pago_adelanto || 'EFECTIVO');

        // Columna izquierda
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
        doc.text(`Tipo de operacion: Venta interna (0101)`, 14, y + 16);
        doc.text(`Moneda: PEN - Soles`, 14, y + 22);

        // Columna derecha — Adelanto
        doc.text(`Adelanto:`, 120, y + 10);
        doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold');
        doc.text(`S/ ${Number(cr.monto_adelanto).toFixed(2)} (${medioAd})`, 142, y + 10);

        // Columna derecha — Saldo pendiente
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
        doc.text(`Saldo pendiente:`, 120, y + 16);
        const [r, g, b] = cr.saldo_pendiente > 0 ? [180, 30, 30] : [30, 120, 30];
        doc.setTextColor(r, g, b); doc.setFont('helvetica', 'bold');
        doc.text(`S/ ${Number(cr.saldo_pendiente).toFixed(2)}`, 196, y + 16, { align: 'right' });

        // Columna derecha — Fecha límite
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
        doc.text(`Fecha limite:`, 120, y + 22);
        doc.setTextColor(30, 30, 30);
        doc.text(fmtFecha, 144, y + 22);

        y += 34;
    } else {
        doc.text(`Medio:`, 120, y + 10);
        doc.setTextColor(30, 30, 30);
        doc.text(medioPagoLabel(venta.forma_pago, venta.monto_efectivo, venta.monto_yape_plin), 134, y + 10);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
        doc.text(`Tipo de operacion: Venta interna (0101)`, 14, y + 16);
        doc.text(`Moneda: PEN - Soles`, 120, y + 16);
        y += 22;
    }

    // ── DATOS CLIENTE ─────────────────────────────────────────
    doc.setFillColor(...GRIS_SOMBRA); doc.rect(10, y, 190, 5, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text('DATOS DEL CLIENTE', 14, y + 4);
    y += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
    doc.text('Senor(es):', 14, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(nombreCliente, 34, y + 6);
    if (docCliente) {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
        doc.text(docCliente, 196, y + 6, { align: 'right' });
    }
    y += 12;

    // ── TABLA ITEMS ───────────────────────────────────────────
    const PAGE_HEIGHT = 287;
    const dibujarCabeceraTabla = () => {
        doc.setFillColor(230, 238, 246); doc.rect(10, y, 190, 7, 'F');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
        doc.text('Cant.', 14, y + 5); doc.text('Und.', 26, y + 5); doc.text('Descripcion', 40, y + 5);
        doc.text('V. Unit. (*)', 118, y + 5, { align: 'right' });
        doc.text('Descto. (*)', 152, y + 5, { align: 'right' });
        doc.text('Importe (**)', 196, y + 5, { align: 'right' });
        doc.setDrawColor(...AZUL); doc.setLineWidth(0.3);
        doc.line(10, y + 7, 200, y + 7);
        y += 7;
    };
    const checkPageBreak = (neededHeight = 7) => {
        if (y + neededHeight > PAGE_HEIGHT) { doc.addPage(); y = 15; dibujarCabeceraTabla(); }
    };

    dibujarCabeceraTabla();
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    items.forEach((d, idx) => {
        const precio    = d.precio_unitario ?? d.precio_venta ?? 0;
        const valorUnit = precio / 1.18;
        const descto    = d.descuento_linea || 0;
        const subtotal  = d.subtotal_linea ?? (precio * d.cantidad);
        const nombre    = (d.nombre_producto || d.nombre || '').substring(0, 55);
        checkPageBreak(7);
        if (idx % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(10, y, 190, 7, 'F'); }
        doc.setFontSize(8);
        doc.text(String(d.cantidad), 17, y + 5, { align: 'center' });
        doc.text('NIU', 26, y + 5); doc.text(nombre, 40, y + 5);
        doc.setTextColor(...GRIS_TEXTO);
        doc.text(`S/ ${valorUnit.toFixed(2)}`, 118, y + 5, { align: 'right' });
        doc.text(`S/ ${descto.toFixed(2)}`, 152, y + 5, { align: 'right' });
        doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold');
        doc.text(`S/ ${subtotal.toFixed(2)}`, 196, y + 5, { align: 'right' });
        doc.setFont('helvetica', 'normal'); y += 7;
    });

    // ── TOTALES ───────────────────────────────────────────────
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2);
    doc.line(10, y, 200, y); y += 6;

    if (y + 61 > PAGE_HEIGHT) { doc.addPage(); y = 15; }

    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
    doc.text('(*) Sin impuestos', 14, y + 4);
    doc.text('(**) Incluye impuestos, de ser Op. Gravada', 14, y + 9);

    const filas = [
        ['Op. Gravada:',    `S/ ${subtotalVal.toFixed(2)}`],
        ['Op. Exonerada:',  'S/ 0.00'],
        ['Op. Inafecta:',   'S/ 0.00'],
        ['ISC:',            'S/ 0.00'],
        [`IGV (${config.igv || 18}%):`, `S/ ${igvVal.toFixed(2)}`],
        ['ICBPER:',         'S/ 0.00'],
    ];
    let ty = y + 4;
    filas.forEach(([label, valor]) => {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO); doc.setFontSize(8);
        doc.text(label, 130, ty); doc.setTextColor(30, 30, 30);
        doc.text(valor, 196, ty, { align: 'right' }); ty += 5;
    });
    y = ty + 2;

    doc.setFillColor(...GRIS_SOMBRA); doc.rect(10, y, 190, 9, 'F');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text('Importe Total:', 130, y + 6.5);
    doc.text(`S/ ${totalVal.toFixed(2)}`, 196, y + 6.5, { align: 'right' });
    y += 13;

    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL);
    doc.text('SON:', 14, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text(`${numeroALetras(totalVal)} ${config.moneda || 'SOLES'}`, 26, y);
    y += 8;

    // ── PIE ───────────────────────────────────────────────────
    // Generar QR antes de dibujar el rect para saber el alto total
    let qrDataUrl = null;
    try {
        const serie   = (venta.numero_comprobante || '').split('-')[0] || '';
        const numero  = (venta.numero_comprobante || '').split('-')[1] || '';
        const tipoDoc = isBoleta ? '03' : '01';
        const qrData  = [
            ruc,
            tipoDoc,
            serie,
            numero,
            igvVal.toFixed(2),
            totalVal.toFixed(2),
            fechaStr.split('/').reverse().join('-'),
            venta.cliente?.tipo_documento ? { 'DNI':'1','RUC':'6','CE':'4','PASAPORTE':'7' }[venta.cliente.tipo_documento] || '-' : '-',
            venta.cliente?.numero_documento || '-',
        ].join('|');
        qrDataUrl = await QRCode.toDataURL(qrData, { width: 120, margin: 1 });
    } catch (_) { /* QR generation is optional */ }

    const qrSize  = 24;
    const pieAlto = qrDataUrl ? Math.max(20, qrSize + 4) : 14;

    doc.setFillColor(...GRIS_SOMBRA);
    doc.rect(10, y, 190, pieAlto, 'F');

    // QR a la derecha dentro del rect
    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', 200 - qrSize - 4, y + 2, qrSize, qrSize);
    }

    // Textos a la izquierda, con ancho limitado para no chocar con el QR
    const _textoMaxX = qrDataUrl ? 155 : 200; // limita ancho si hay QR
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS_TEXTO);
    if (venta.cpe_estado === 'ACEPTADO') {
        doc.text(`Representacion impresa de la ${isBoleta ? 'Boleta' : 'Factura'} de Venta Electronica.`, 14, y + 6);
        doc.text(`Hash: ${(venta.cpe_codigo_hash || '').substring(0, 36)}`, 14, y + 11);
        doc.setTextColor(...AZUL);
        doc.text('Consulte: ww1.sunat.gob.pe/ol-ti-itconsultaunificada', 14, y + 16);
    } else {
        doc.text(`Representacion impresa de la ${isBoleta ? 'Boleta' : 'Factura'} de Venta Electronica.`, 14, y + 6);
        doc.text('Este documento es una representación gráfica del comprobante electrónico emitido.', 14, y + 11);
        doc.setTextColor(...AZUL);
        doc.text('Consulte su validez en www.sunat.gob.pe', 14, y + 16);
    }
    y += pieAlto;
    // ── ANULADO watermark ─────────────────────────────────────
    if (isAnulado) {
        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p); doc.setFontSize(60); doc.setTextColor(220, 50, 50);
            doc.setFont('helvetica', 'bold');
            doc.text('ANULADO', 105, 160, { align: 'center', angle: 45 });
        }
    }

    // ── GUARDAR Y ABRIR ───────────────────────────────────────
    const noEmitido  = venta.cpe_estado !== 'ACEPTADO';
    const letraTipo  = isBoleta ? 'B' : 'F';
    const filename   = noEmitido
        ? `NV_${letraTipo}_${venta.numero_venta}.pdf`
        : `${venta.numero_venta}_${venta.tipo_comprobante}.pdf`;
    const pdfBase64  = doc.output('datauristring');
    const dateStr    = `${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${fecha.getFullYear()}`;
    const modulo     = noEmitido
        ? `emision_electronica/${dateStr}/no_emitidos/a4`
        : `emision_electronica/${dateStr}`;

    try {
        await guardarArchivoLocal({ modulo, filename, content: pdfBase64, isBase64: true });
    } catch (e) { logger.error('COMPROBANTE_PDF', 'Error guardando archivo local:', e); }

    if (!opts.soloGuardar) {
        const base64 = pdfBase64.split(',')[1];
        const numDoc = (venta.numero_comprobante || venta.numero_venta || 'doc').replace(/\//g, '-');
        if (window.electronAPI?.openPDF) await window.electronAPI.openPDF({ base64, filename: `a4_${numDoc}.pdf` });
        else window.open(doc.output('bloburl'), '_blank');
    }
}

