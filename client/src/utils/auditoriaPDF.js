/**
 * auditoriaPDF.js
 * Genera un reporte PDF formal de auditoría usando jsPDF + jspdf-autotable.
 * Uso: exportarAuditoriaPDF(logs, configEmpresa, filtrosActivos, usuarioActual)
 *
 * Requiere en package.json (client):
 *   "jspdf": "^2.x",
 *   "jspdf-autotable": "^3.x"
 */

import logger from './logger';



// ── Resolver referencia legible (misma lógica que en Auditoria.jsx) ─────────
function resolverReferencia(log) {
    if (!log.id_referencia) return '-';
    switch (log.tipo_referencia) {
        case 'VENTA':
            return log.ref_numero_venta || log.id_referencia;
        case 'DEVOLUCION':
            return log.ref_numero_venta
                ? `Devolución de ${log.ref_numero_venta}`
                : log.id_referencia;
        case 'SESION_CAJA':
            return log.sesion_apertura
                ? `Turno ${new Date(log.sesion_apertura).toLocaleString('es-PE', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                  })}`
                : log.id_referencia;
        default:
            return log.id_referencia;
    }
}

// ── Paleta del sistema ────────────────────────────────────────
const COLOR_PRIMARIO  = [113, 93, 255];  // #735DFF
const COLOR_SECUNDARIO = [46, 109, 164]; // #2e6da4
const COLOR_HEADER_BG  = [113, 93, 255];
const COLOR_HEADER_FG  = [255, 255, 255];
const COLOR_FILA_PAR   = [255, 255, 255];
const COLOR_FILA_IMPAR = [248, 247, 255];
const COLOR_BORDE      = [226, 232, 240];
const COLOR_TEXTO      = [30,  41,  59];
const COLOR_SUBTEXTO   = [100, 116, 139];

// ── Helpers internos ──────────────────────────────────────────
const BIZ_OFFSET_MS = -300 * 60 * 1000;

function fechaHoraLocal(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(new Date(isoStr).getTime() + BIZ_OFFSET_MS);
    const dd   = String(d.getUTCDate()).padStart(2, '0');
    const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const hh   = String(d.getUTCHours()).padStart(2, '0');
    const min  = String(d.getUTCMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function ahora() {
    return fechaHoraLocal(new Date().toISOString());
}

// ── Función principal ─────────────────────────────────────────
/**
 * @param {Array}  logs           - Array de registros de auditoría ya filtrados
 * @param {Object} configEmpresa  - Objeto con empresa_nombre, empresa_ruc, empresa_direccion, etc.
 * @param {Object} filtrosActivos - { desde, hasta, modulo, usuario, accion, busqueda }
 * @param {string} usuarioActual  - Username del admin que exporta
 */
export async function exportarAuditoriaPDF(logs, configEmpresa = {}, filtrosActivos = {}, usuarioActual = 'admin') {
    // ── Importación dinámica (no carga en bundle si no se usa) ──
    const { default: jsPDF }    = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const PW  = doc.internal.pageSize.getWidth();   // 297mm landscape
    const PH  = doc.internal.pageSize.getHeight();  // 210mm landscape

    // ══════════════════════════════════════════════════════════
    //  FUNCIÓN CABECERA — se llama en cada página nueva
    // ══════════════════════════════════════════════════════════
    const dibujarCabecera = () => {
        const pageNum = doc.internal.getCurrentPageInfo().pageNumber;

        // Barra superior morada
        doc.setFillColor(...COLOR_PRIMARIO);
        doc.rect(0, 0, PW, 16, 'F');

        // Nombre empresa (izquierda)
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const empresa = configEmpresa.empresa_nombre || 'EMPRESA';
        doc.text(empresa.toUpperCase(), 10, 10);

        // RUC (izquierda, debajo del nombre)
        if (configEmpresa.empresa_ruc) {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text(`RUC: ${configEmpresa.empresa_ruc}`, 10, 14.5);
        }

        // Título centrado
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('REPORTE DE AUDITORÍA DEL SISTEMA', PW / 2, 10, { align: 'center' });

        // Página (derecha)
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(`Pág. ${pageNum}`, PW - 10, 10, { align: 'right' });

        // Línea separadora gris
        doc.setDrawColor(...COLOR_BORDE);
        doc.setLineWidth(0.3);
        doc.line(10, 18, PW - 10, 18);
    };

    // ══════════════════════════════════════════════════════════
    //  FUNCIÓN PIE — se llama en cada página nueva
    // ══════════════════════════════════════════════════════════
    const dibujarPie = () => {
        const totalPags = '{totalPages}'; // placeholder que jsPDF reemplaza al final
        doc.setDrawColor(...COLOR_BORDE);
        doc.setLineWidth(0.3);
        doc.line(10, PH - 10, PW - 10, PH - 10);

        doc.setFontSize(6.5);
        doc.setTextColor(...COLOR_SUBTEXTO);
        doc.setFont('helvetica', 'normal');
        doc.text('Sistema HUASCARÁN — GiraDevs', 10, PH - 6);
        doc.text(`Exportado por: ${usuarioActual}  |  ${ahora()}`, PW / 2, PH - 6, { align: 'center' });
        doc.text(`Pág. ${doc.internal.getCurrentPageInfo().pageNumber} de ${totalPags}`, PW - 10, PH - 6, { align: 'right' });
    };

    // ══════════════════════════════════════════════════════════
    //  PÁGINA 1 — Encabezado, info empresa, filtros, tabla
    // ══════════════════════════════════════════════════════════
    dibujarCabecera();

    let cursorY = 22;

    // ── Bloque info empresa ───────────────────────────────────
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_TEXTO);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DE LA EMPRESA', 10, cursorY);

    cursorY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    const dir = [
        configEmpresa.empresa_direccion,
        configEmpresa.empresa_distrito,
        configEmpresa.empresa_provincia,
        configEmpresa.empresa_departamento,
    ].filter(Boolean).join(', ');

    if (dir) {
        doc.setTextColor(...COLOR_SUBTEXTO);
        doc.text(`Dirección: ${dir}`, 10, cursorY);
        cursorY += 4;
    }

    // ── Línea separadora ─────────────────────────────────────
    doc.setDrawColor(...COLOR_BORDE);
    doc.line(10, cursorY, PW - 10, cursorY);
    cursorY += 4;

    // ── Bloque filtros activos ────────────────────────────────
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_TEXTO);
    doc.setFont('helvetica', 'bold');
    doc.text('FILTROS APLICADOS', 10, cursorY);

    cursorY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_SUBTEXTO);

    const filtroTextos = [];
    if (filtrosActivos.desde && filtrosActivos.hasta)
        filtroTextos.push(`Período: ${filtrosActivos.desde} al ${filtrosActivos.hasta}`);
    else if (filtrosActivos.desde)
        filtroTextos.push(`Desde: ${filtrosActivos.desde}`);
    else if (filtrosActivos.hasta)
        filtroTextos.push(`Hasta: ${filtrosActivos.hasta}`);

    if (filtrosActivos.modulo)   filtroTextos.push(`Módulo: ${filtrosActivos.modulo}`);
    if (filtrosActivos.usuario)  filtroTextos.push(`Usuario: ${filtrosActivos.usuario}`);
    if (filtrosActivos.accion)   filtroTextos.push(`Acción: ${filtrosActivos.accion}`);
    if (filtrosActivos.busqueda) filtroTextos.push(`Búsqueda: "${filtrosActivos.busqueda}"`);
    if (filtrosActivos.horaDesde || filtrosActivos.horaHasta)
        filtroTextos.push(`Hora: ${filtrosActivos.horaDesde || '00:00'} – ${filtrosActivos.horaHasta || '23:59'}`);

    const filtroStr = filtroTextos.length ? filtroTextos.join('   |   ') : 'Sin filtros (todos los registros)';
    doc.text(filtroStr, 10, cursorY, { maxWidth: PW - 20 });

    cursorY += 4;

    // Total de registros
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR_PRIMARIO);
    doc.text(`Total de registros: ${logs.length}`, 10, cursorY);
    doc.setTextColor(...COLOR_SUBTEXTO);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado: ${ahora()}`, PW - 10, cursorY, { align: 'right' });

    cursorY += 5;

    // ── Tabla principal ───────────────────────────────────────
    autoTable(doc, {
        startY: cursorY,
        margin: { top: 22, left: 10, right: 10, bottom: 16 },
        head: [[
            'Fecha / Hora',
            'Usuario',
            'Acción',
            'Módulo',
            'Detalle',
            'Referencia',
            'IP',
        ]],
        body: logs.map(l => [
            fechaHoraLocal(l.fecha_hora),
            l.usuario || '-',
            l.accion  || '-',
            l.modulo  || '-',
            l.detalles || '-',
            resolverReferencia(l),
            l.ip || '-',
        ]),
        columnStyles: {
            0: { cellWidth: 32 },  // Fecha/Hora
            1: { cellWidth: 26 },  // Usuario
            2: { cellWidth: 20 },  // Acción
            3: { cellWidth: 24 },  // Módulo
            4: { cellWidth: 'auto' }, // Detalle — ocupa el resto
            5: { cellWidth: 36 },  // Referencia
            6: { cellWidth: 22 },  // IP
        },
        headStyles: {
            fillColor: COLOR_HEADER_BG,
            textColor: COLOR_HEADER_FG,
            fontSize: 7.5,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 3,
        },
        bodyStyles: {
            fontSize: 6.8,
            textColor: COLOR_TEXTO,
            cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            overflow: 'linebreak',
        },
        alternateRowStyles: {
            fillColor: COLOR_FILA_IMPAR,
        },
        rowStyles: {
            fillColor: COLOR_FILA_PAR,
        },
        tableLineColor: COLOR_BORDE,
        tableLineWidth: 0.1,
        didDrawPage: () => {
            dibujarCabecera();
            dibujarPie();
        },
        // No llamar dibujarCabecera en la primera página (ya se dibujó arriba)
        willDrawCell: () => {},
    });

    // ── Reemplazar placeholder de total de páginas ────────────
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
        doc.setPage(i);
        // Sobreescribir el placeholder '{totalPages}' borrando y redibujando
        doc.setFillColor(255, 255, 255);
        doc.rect(PW - 35, PH - 9, 25, 5, 'F');
        doc.setFontSize(6.5);
        doc.setTextColor(...COLOR_SUBTEXTO);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `Pág. ${i} de ${totalPaginas}`,
            PW - 10, PH - 6,
            { align: 'right' }
        );
    }

    // ── Guardar vía Electron o descarga directa ───────────────
    const fecha = new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
    const nombreArchivo = `Auditoria_${fecha}.pdf`;

    if (window.electronAPI?.savePDF) {
        try {
            const buffer = doc.output('arraybuffer');
            const base64 = btoa(
                new Uint8Array(buffer).reduce((acc, b) => acc + String.fromCharCode(b), '')
            );
            const result = await window.electronAPI.savePDF({ buffer: base64, suggestedName: nombreArchivo });
            if (result?.canceled) return;
            if (!result?.ok) throw new Error(result?.error || 'Error desconocido');
        } catch (err) {
            logger.error('AUDITORIA_PDF', 'Error al guardar PDF:', err);
            // Fallback: descarga directa en el navegador
            doc.save(nombreArchivo);
        }
    } else {
        doc.save(nombreArchivo);
    }
}
