import { guardarArchivoLocal } from '../services/api';
import logger from './logger';

export function formatCurrency(amount) {
    return `S/ ${Number(amount || 0).toFixed(2)}`;
}

export function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function getStockLevel(stock, minimo) {
    if (stock === 0) return 'critico';
    if (stock <= minimo) return 'bajo';
    return 'normal';
}

export function getStockBadge(stock, minimo) {
    const level = getStockLevel(stock, minimo);
    const labels = { critico: 'Sin Stock', bajo: 'Stock Bajo', normal: 'Normal' };
    const classes = { critico: 'badge-danger', bajo: 'badge-warning', normal: 'badge-success' };
    return { label: labels[level], class: classes[level] };
}

/**
 * Descompone un total con IGV incluido en sus partes.
 * @param {number} total - Monto total con IGV incluido.
 * @param {number} [tasa=18] - Tasa de IGV en porcentaje (ej: 18). Retrocompatible: si no se pasa, usa 18.
 */
export function calcularIGV(total, tasa = 18) {
    const factor   = 1 + tasa / 100;
    const subtotal = Math.round((total / factor) * 100) / 100;
    const igv      = Math.round((total - subtotal) * 100) / 100;
    return { subtotal, igv, total };
}

export async function downloadCSV(data, filename, modulo, toast) {
    if (!data || !data.length) {
        if (toast) toast('No hay datos para exportar', 'warning');
        return;
    }

    // 1. Generar el contenido CSV
    const headers = Object.keys(data[0]);
    const csvRows = data.map(row =>
        headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers.join(','), ...csvRows].join('\n');

    const suggestedName = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    const _blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    // 2. Guardado automático en el servidor (sin ventana, solo notificación)
    try {
        await guardarArchivoLocal({
            modulo: modulo || 'general',
            filename: suggestedName,
            content: csv,
            isBase64: false
        });
        if (toast) toast('Archivo guardado automáticamente en el servidor', 'success');
    } catch (e) {
        logger.error('HELPERS', 'Error al guardar en servidor:', e);
        if (toast) toast('Error al guardar automáticamente', 'error');
    }

    // 3. Permitir al usuario elegir dónde guardar una copia local
    if (window.electronAPI?.saveCSV) {
        try {
            const result = await window.electronAPI.saveCSV({ content: csv, suggestedName });
            if (result.canceled) return;
            if (!result.ok) logger.error('HELPERS', 'Error al guardar CSV:', result.error);
        } catch (err) {
            logger.error('HELPERS', 'Error al guardar CSV:', err);
        }
      }
    }
// ── Zona horaria del negocio ──────────────────────────────────
// Offset en minutos respecto a UTC (Perú = UTC-5 = -300).
// Ajustar según el país del cliente final.
const BUSINESS_UTC_OFFSET_MINUTES = -300;

/**
 * Devuelve 'YYYY-MM-DD' en hora del negocio, independiente
 * de la zona horaria del navegador o servidor del cliente.
 */
export function hoyLocalNegocio() {
    const ahora = new Date();
    const localMs = ahora.getTime() + (BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
    const local = new Date(localMs);
    const yyyy = local.getUTCFullYear();
    const mm   = String(local.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(local.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convierte un fecha_hora UTC (guardado en BD con Z) al día
 * del negocio como 'YYYY-MM-DD'.
 * Usar para comparar fechas de registros contra filtros de fecha.
 */
export function fechaNegocio(fechaHoraUTC) {
    if (!fechaHoraUTC) return '';
    const utc = new Date(fechaHoraUTC);
    const localMs = utc.getTime() + (BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
    const local = new Date(localMs);
    return local.getUTCFullYear() + '-' +
        String(local.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(local.getUTCDate()).padStart(2, '0');
}

// ── Exportar Excel con formato y diálogo nativo ───────────
export async function downloadExcel(data, filename, modulo, toast, opcionesColumnas = null) {
    if (!data || !data.length) {
        if (toast) toast('No hay datos para exportar', 'warning');
        return;
    }

    const ExcelJS = (await import('exceljs')).default;
    const fecha = new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
    const suggestedName = `${filename}_${fecha}.xlsx`;

    const wb = new ExcelJS.Workbook();
    wb.creator   = 'Sistema HUASCARAN';
    wb.company   = 'HUASCARAN';
    wb.created   = new Date();

    const ws = wb.addWorksheet('Datos', {
        views: [{ state: 'frozen', ySplit: 1 }]  // congela fila de encabezado
    });

    // ── Definir columnas ──────────────────────────────────────
    const columnas = opcionesColumnas
        ? opcionesColumnas
        : Object.keys(data[0]).map(k => ({ header: k, value: row => row[k] }));

    ws.columns = columnas.map(col => ({
        header: col.header,
        key:    col.header,
        width:  Math.min(
            Math.max(
                col.header.length + 4,
                ...data.slice(0, 50).map(r => String(col.value(r) ?? '').length + 2)
            ),
            45
        )
    }));

    // ── Estilo encabezados ────────────────────────────────────
    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF735DFF' } };
        cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            bottom: { style: 'medium', color: { argb: 'FF5A45D6' } }
        };
    });

    // ── Agregar filas con estilo alterno ──────────────────────
    data.forEach((row, idx) => {
        const valores = {};
        columnas.forEach(col => { valores[col.header] = col.value(row); });

        const fila = ws.addRow(valores);
        fila.height = 18;

        const esPar = idx % 2 === 0;
        fila.eachCell({ includeEmpty: true }, (cell, _colIdx) => {
            // Fondo alterno
            cell.fill = {
                type: 'pattern', pattern: 'solid',
                fgColor: { argb: esPar ? 'FFFFFFFF' : 'FFF8F7FF' }
            };
            cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF1E293B' } };
            cell.alignment = { vertical: 'middle' };
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };

            // Alinear números a la derecha
            const val = cell.value;
            if (typeof val === 'number') {
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
                // Formato con 2 decimales si tiene decimales
                if (!Number.isInteger(val)) {
                    cell.numFmt = '#,##0.00';
                }
            }
        });
    });

    // ── Guardar CSV liviano en servidor (igual que antes) ─────
    try {
        const headers = columnas.map(c => c.header);
        const csvRows = data.map(row =>
            columnas.map(col => `"${String(col.value(row) ?? '').replace(/"/g, '""')}"`).join(',')
        );
        const csv = [headers.join(','), ...csvRows].join('\n');
        await guardarArchivoLocal({
            modulo: modulo || 'general',
            filename: `${filename}_${fecha}.csv`,
            content: csv,
            isBase64: false
        });
    } catch (e) {
        logger.error('HELPERS', 'Error al guardar CSV en servidor:', e);
    }

    // ── Enviar a Electron como base64 ─────────────────────────
    if (window.electronAPI?.saveExcel) {
        try {
            const buffer = await wb.xlsx.writeBuffer();
            const base64 = btoa(
                new Uint8Array(buffer).reduce((acc, byte) => acc + String.fromCharCode(byte), '')
            );
            const result = await window.electronAPI.saveExcel({
                buffer: base64,
                suggestedName
            });
            if (result.canceled) return;
            if (!result.ok) {
                if (toast) toast('Error al guardar el archivo', 'error');
            }
        } catch (err) {
            logger.error('HELPERS', 'Error al guardar Excel:', err);
            if (toast) toast('Error al guardar el archivo', 'error');
        }
    }
}
// ── Condición de pago (para comprobante SUNAT) ─────────────
export function condicionPago(forma_pago) {
    return forma_pago === 'CREDITO' ? 'CRÉDITO' : 'CONTADO';
}

// ── Medio de pago legible ──────────────────────────────────
export function medioPagoLabel(forma_pago, monto_efectivo = 0, monto_yape_plin = 0) {
    switch (forma_pago) {
        case 'EFECTIVO':      return 'Efectivo';
        case 'YAPE_PLIN':     return 'Yape / Plin';
        case 'TRANSFERENCIA': return 'Transferencia bancaria';
        case 'MIXTO':
            return `Mixto (Efectivo S/ ${Number(monto_efectivo).toFixed(2)} + Yape S/ ${Number(monto_yape_plin).toFixed(2)})`;
        case 'CREDITO':       return '—';
        default:              return forma_pago;
    }
}
