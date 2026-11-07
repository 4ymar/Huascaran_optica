import { buildTicketHTML } from './ticketTemplate';
import { buildTicketPDF } from './ticketPDF';
import { guardarArchivoLocal } from '../services/api';
import logger from './logger';
/**
 * Genera y muestra el ticket térmico.
 * Firma idéntica al archivo anterior — Ventas.jsx y Comprobantes.jsx
 * no requieren ningún cambio.
 *
 * Flujo:
 *   1. buildTicketHTML()  → genera HTML+CSS completo
 *   2. electronAPI.printTicket() → Electron abre ventana oculta,
 *      llama webContents.printToPDF() y abre el visor nativo
 *
 * @param {object} venta   — objeto de venta con detalles, cliente, etc.
 * @param {object} config  — configuración del sistema (empresa, ticket, igv…)
 * @param {object} opts    — { silent: bool } — true = imprime directo sin diálogo
 */
export async function generateTicketPDF(venta, config, opts = {}) {
    try {
        logger.debug('TICKET_PDF', 'Iniciando generateTicketPDF, config keys:', Object.keys(config || {}));
        const { html, anchoMM } = await buildTicketHTML(venta, config);
        logger.debug('TICKET_PDF', 'HTML generado, largo:', html?.length);
        logger.debug('TICKET_PDF', 'Llamando printTicket...');

        if (opts.silent === true) {
            if (!window.electronAPI?.printTicket) {
                logger.warn('TICKET_PDF', 'electronAPI.printTicket no disponible');
                return;
            }
            const result = await window.electronAPI.printTicket({
                html,
                anchoMM,
                silent: true,
            });
            if (!result?.ok) {
                logger.error('TICKET_PDF', 'Error impresión:', result?.error);
            }
            return result;
        }

        const { base64 } = await buildTicketPDF(venta, config);
        const numDoc     = (venta.numero_comprobante || venta.numero_venta || 'doc').replace(/\//g, '-');
        const isBoleta   = (venta.tipo_comprobante || '').toUpperCase() === 'BOLETA';
        const letraTipo  = isBoleta ? 'B' : 'F';
        const fechaTK    = new Date(venta.fecha_hora || new Date());
        const dateStrTK  = `${String(fechaTK.getDate()).padStart(2,'0')}-${String(fechaTK.getMonth()+1).padStart(2,'0')}-${fechaTK.getFullYear()}`;
        const filenameTK = `TK_${letraTipo}_${venta.numero_venta || numDoc}.pdf`;
        try {
            await guardarArchivoLocal({
                modulo:   `emision_electronica/${dateStrTK}/no_emitidos/tickets`,
                filename: filenameTK,
                content:  `data:application/pdf;base64,${base64}`,
                isBase64: true,
            });
        } catch (e) { logger.error('TICKET_PDF', 'Error guardando ticket en servidor:', e); }
        if (window.electronAPI?.openPDF) {
            await window.electronAPI.openPDF({ base64, anchoMM, filename: `ticket_${numDoc}.pdf` });
        } else {
            const byteChars = atob(base64);
            const byteNumbers = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
            const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
            window.open(URL.createObjectURL(blob), '_blank');
        }
        return { ok: true };

    } catch (err) {
        logger.error('TICKET_PDF', 'Error generando ticket:', err);
    }
}
