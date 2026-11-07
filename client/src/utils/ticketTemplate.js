import QRCode from 'qrcode';
import { condicionPago, medioPagoLabel } from './helpers';

/**
 * Genera el HTML completo del ticket térmico.
 * Recibe venta + config, devuelve string HTML listo para
 * ser enviado a Electron vía print-ticket IPC.
 *
 * El ancho del papel (58mm u 80mm) controla el CSS.
 * El logo se renderiza como <img src="data:..."> — no hay race condition.
 */
export async function buildTicketHTML(venta, config) {

    // ── Datos base ────────────────────────────────────────────
    const anchoMM   = parseInt(config.ticket_ancho || '80');
    const items     = venta.detalles || venta.items || [];
    const isBoleta  = (venta.tipo_comprobante || '').toUpperCase() === 'BOLETA';
    const isAnulado = venta.estado === 'ANULADA';

    const empresa   = config.empresa_nombre || 'MI EMPRESA';
    const ruc       = config.empresa_ruc    || '00000000000';
    const direccion = [
        config.empresa_direccion,
        config.empresa_distrito,
        config.empresa_provincia,
    ].filter(Boolean).join(', ');
    const telefono = config.empresa_telefono || '';

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
    let qrDataUrl  = '';
    let qrInterno  = false;

    try {
        let qrData = '';
        if (venta.cpe_estado === 'ACEPTADO') {
            const numComp  = venta.numero_comprobante || '';
            const guionIdx = numComp.indexOf('-');
            const serie    = guionIdx > -1 ? numComp.slice(0, guionIdx) : numComp;
            const numero   = guionIdx > -1
                ? String(parseInt(numComp.slice(guionIdx + 1), 10) || 0)
                : '';
            const TABLA2_SUNAT = {
                'DNI': '1', 'RUC': '6', 'CE': '4',
                'PASAPORTE': '7', 'CARNET_EXTRANJERIA': '4', 'PARTIDA_NACIMIENTO': '0',
            };
            const tipoDocCli = venta.cliente?.tipo_documento
                ? (TABLA2_SUNAT[venta.cliente.tipo_documento] || '-')
                : '0';
            const nroDocCli  = venta.cliente?.numero_documento || '-';
            const tipoDocComp = isBoleta ? '03' : '01';
            const fechaQR     = fecha.toISOString().slice(0, 10);
            qrData = [ruc, tipoDocComp, serie, numero,
                igvVal.toFixed(2), totalVal.toFixed(2),
                fechaQR, tipoDocCli, nroDocCli].join('|');
        } else {
            qrInterno = true;
            const fechaQR = fecha.toISOString().slice(0, 10);
            qrData = `HUASCARAN|${venta.numero_venta}|${totalVal.toFixed(2)}|${fechaQR}`;
        }
        qrDataUrl = await QRCode.toDataURL(qrData, { width: 200, margin: 1 });
    } catch (_) { /* continúa sin QR */ }

    // ── Items HTML ────────────────────────────────────────────
    const itemsHTML = items.map((d, idx) => {
        const precio   = Number(d.precio_unitario ?? d.precio_venta ?? 0);
        const subtotal = Number(d.subtotal_linea  ?? (precio * d.cantidad));
        const nombre   = d.nombre_producto || d.nombre || '';
        const descuento = d.descuento_linea > 0
            ? `<div class="descuento">Descuento: -S/ ${Number(d.descuento_linea).toFixed(2)}</div>`
            : '';
        return `
        <div class="item${idx > 0 ? ' item-gap' : ''}">
            <div class="item-row">
                <span class="item-nombre">${d.cantidad} x ${escHtml(nombre)}</span>
                <span class="item-importe">S/ ${subtotal.toFixed(2)}</span>
            </div>
            <div class="item-precio">S/ ${precio.toFixed(2)} c/u</div>
            ${descuento}
        </div>`;
    }).join('');

    // ── Crédito HTML ──────────────────────────────────────────
    let creditoHTML = '';
    if (venta.forma_pago === 'CREDITO' && venta.credito) {
        const cr = venta.credito;
        const fmtFecha = cr.fecha_vencimiento
            ? new Date(cr.fecha_vencimiento + 'T00:00:00')
                .toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Sin fecha';
        const saldo = Number(cr.saldo_pendiente);
        const colorSaldo = saldo > 0 ? '#c82828' : '#1e7820';
        creditoHTML = `
        <div class="par"><span class="par-izq">Adelanto:</span><span class="par-der">S/ ${Number(cr.monto_adelanto).toFixed(2)}</span></div>
        <div class="par"><span class="par-izq">Saldo:</span><span class="par-der" style="color:${colorSaldo}">S/ ${saldo.toFixed(2)}</span></div>
        <div class="par"><span class="par-izq">Vence:</span><span class="par-der">${fmtFecha}</span></div>`;
    } else {
        creditoHTML = `<div class="par"><span class="par-izq">Medio:</span><span class="par-der">${escHtml(medioPagoLabel(venta.forma_pago, venta.monto_efectivo, venta.monto_yape_plin))}</span></div>`;
    }

    // ── IGV HTML ──────────────────────────────────────────────
    const igvHTML = mostrarIGV ? `
        <div class="par par-sm">
            <span class="par-izq">Op. Gravada:</span>
            <span class="par-der">S/ ${subtotalVal.toFixed(2)}</span>
        </div>
        <div class="par par-sm">
            <span class="par-izq">IGV (${tasaIGV}%):</span>
            <span class="par-der">S/ ${igvVal.toFixed(2)}</span>
        </div>` : '';

    // ── Logo HTML ─────────────────────────────────────────────
    const logoHTML = (config.ticket_logo && config.ticket_logo.startsWith('data:image/'))
        ? `<div class="logo-wrap"><img class="logo" src="${config.ticket_logo}" alt="Logo" /></div>`
        : '';

    // ── Serie máquina ─────────────────────────────────────────
    const serieMaqHTML = config.ticket_serie_maquina
        ? `<div class="centro sm gris" style="margin-bottom:4px">Serie máquina: ${escHtml(config.ticket_serie_maquina)}</div>`
        : '';

    // ── Pie legal ─────────────────────────────────────────────
    const pieLegalHTML = venta.cpe_estado === 'ACEPTADO' ? `
        <div class="centro sm gris">Representación impresa del CPE electrónico.</div>
        <div class="centro sm gris">Consulte en: www1.sunat.gob.pe</div>` : `
        <div class="centro sm gris">Documento interno de respaldo de operación comercial.</div>
        <div class="centro sm gris">No es comprobante de pago electrónico (CPE).</div>`;

    const qrInternoHTML = qrInterno
        ? `<div class="centro sm gris" style="margin-top:6px">Verificación interna — no válido ante SUNAT</div>`
        : '';

    const qrHTML = qrDataUrl
        ? `<div class="qr-wrap"><img class="qr" src="${qrDataUrl}" alt="QR" /></div>`
        : '';

    const anuladoHTML = isAnulado
        ? `<div class="anulado">ANULADO</div>`
        : '';

    // ── CSS ───────────────────────────────────────────────────
    const fs      = anchoMM === 58 ? '7.5pt' : '8.5pt';
    const fsSm    = anchoMM === 58 ? '6.5pt' : '7.5pt';
    const padding = anchoMM === 58 ? '4mm' : '5mm';

    const css = `
        @page {
            size: ${anchoMM}mm auto;
            margin: 0;
        }
    * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: ${fs};
            color: #1e1e1e;
            background: #fff;
            width: ${anchoMM}mm;
            padding: ${padding};
        }

        /* ── Tipografía ── */
        .sm   { font-size: ${fsSm}; }
        .bold { font-weight: 700; }
        .gris { color: #6e6e6e; }
        .azul { color: #1a3c5e; }
        .azul-claro { color: #376999; }
        .rojo { color: #c82828; }

        /* ── Logo ── */
        .logo-wrap { text-align: center; margin-bottom: 6px; }
        .logo { max-width: 55%; max-height: 24mm; object-fit: contain; }

        /* ── Centro ── */
        .centro { text-align: center; line-height: 1.55; }

        /* ── Empresa ── */
        .empresa { font-size: ${anchoMM === 58 ? '9pt' : '10pt'}; font-weight: 700; }

        /* ── Separadores ── */
        .sep {
            border: none;
            border-top: 0.3px solid #6e6e6e;
            margin: 5px 0 6px;
        }
        .sep-doble {
            border: none;
            border-top: 0.8px double #1a3c5e;
            margin: 5px 0 6px;
        }

        /* ── Par clave/valor ── */
        .par {
            display: flex;
            justify-content: space-between;
            line-height: 1.7;
        }
        .par-sm { font-size: ${fsSm}; }
        .par-izq { color: #6e6e6e; }
        .par-der { font-weight: 700; }

        /* ── Cabecera tabla ── */
        .tabla-header {
            display: flex;
            justify-content: space-between;
            font-size: ${fsSm};
            font-weight: 700;
            color: #1a3c5e;
            padding-bottom: 3px;
            border-bottom: 0.4px solid #1a3c5e;
            margin-bottom: 5px;
        }

        /* ── Items ── */
        .item { line-height: 1.55; }
        .item-gap { margin-top: 6px; }
        .item-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
        }
        .item-nombre { font-weight: 700; flex: 1; padding-right: 4px; }
        .item-importe { font-weight: 700; color: #376999; white-space: nowrap; }
        .item-precio  { font-size: ${fsSm}; color: #6e6e6e; margin-left: 2px; }
        .descuento    { font-size: ${fsSm}; color: #c82828; margin-left: 2px; }

        /* ── Total ── */
        .total-row {
            display: flex;
            justify-content: space-between;
            font-size: ${anchoMM === 58 ? '12pt' : '13pt'};
            font-weight: 700;
            color: #1a3c5e;
            line-height: 1.5;
            margin: 2px 0 3px;
        }

        /* ── QR ── */
        .qr-wrap { text-align: center; margin-top: 6px; }
        .qr { width: ${anchoMM === 58 ? '32mm' : '38mm'}; height: auto; }

        /* ── Anulado watermark ── */
        .anulado {
            position: fixed;
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-35deg);
            font-size: 28pt;
            font-weight: 700;
            color: rgba(200, 40, 40, 0.25);
            pointer-events: none;
            white-space: nowrap;
        }
    `;

    // ── HTML final ────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>${css}</style>
</head>
<body>

    ${anuladoHTML}

    ${logoHTML}

    <div class="centro empresa azul">${escHtml(empresa.toUpperCase())}</div>
    <div class="centro sm gris">RUC: ${escHtml(ruc)}</div>
    ${direccion ? `<div class="centro sm gris">${escHtml(direccion)}</div>` : ''}
    ${telefono  ? `<div class="centro sm gris">Telf: ${escHtml(telefono)}</div>` : ''}

    <hr class="sep-doble">

    <div class="centro bold azul" style="font-size:${anchoMM === 58 ? '8.5pt' : '9.5pt'}">${escHtml(tipoComprobante)}</div>
    <div class="centro bold" style="margin-bottom:2px">${escHtml(venta.numero_comprobante || venta.numero_venta || '')}</div>

    <hr class="sep-doble">

    ${serieMaqHTML}

    <div class="par"><span class="par-izq">Fecha:</span><span class="par-der">${fechaStr}</span></div>
    <div class="par"><span class="par-izq">Hora:</span><span class="par-der">${horaStr}</span></div>
    <div class="par"><span class="par-izq">Condición:</span><span class="par-der">${escHtml(condicionPago(venta.forma_pago))}</span></div>
    ${creditoHTML}

    <hr class="sep">

    <div class="sm gris" style="margin-bottom:3px">Cliente:</div>
    <div class="bold" style="margin-bottom:${docCliente ? '2px' : '0'}">${escHtml(nombreCliente)}</div>
    ${docCliente ? `<div class="sm gris">${escHtml(docCliente)}</div>` : ''}

    <hr class="sep">

    <div class="tabla-header">
        <span>Cant. Descripción</span>
        <span>Importe</span>
    </div>

    ${itemsHTML}

    <hr class="sep-doble" style="margin-top:6px">

    ${igvHTML}

    <div class="total-row">
        <span>TOTAL:</span>
        <span>S/ ${totalVal.toFixed(2)}</span>
    </div>

    <hr class="sep">

    <div class="centro bold sm gris" style="margin-bottom:3px">${escHtml(mensajePie)}</div>
    ${pieLegalHTML}
    ${qrInternoHTML}
    ${qrHTML}

</body>
</html>`;

    return { html, anchoMM };
}

// ── Utilidad: escapar caracteres HTML ─────────────────────
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
