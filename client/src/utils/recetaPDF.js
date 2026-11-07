import { getPublicConfig } from '../services/api';
import logger from './logger';

// ── Paleta (misma familia que generateComprobantePDF) ─────────────────────────
const AZUL       = [26, 60, 94];
const GRIS       = [100, 100, 100];
const GRIS_FONDO = [240, 240, 240];
const GRIS_BORDE = [200, 205, 212];
const NEGRO      = [30, 30, 30];

const vacio = (v) => v === null || v === undefined || v === '';
const fmtGrad = (v) => (vacio(v) ? '—' : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}`);
const fmtEje = (v) => (vacio(v) ? '—' : `${v}°`);
const fmtMM = (v) => (vacio(v) ? '—' : `${v} mm`);
// jsPDF (helvetica) no dibuja el símbolo Δ: se reemplaza por "dp" (dioptrías prismáticas)
const txt = (v) => (vacio(v) ? '' : String(v).replace(/Δ/g, ' dp').replace(/\s+/g, ' ').trim());
const fmtFecha = (s) => {
    if (!s) return '';
    const [a, m, d] = String(s).slice(0, 10).split('-');
    return a && m && d ? `${d}/${m}/${a}` : String(s);
};

/**
 * Genera la receta de lentes en PDF (A5 horizontal) y la abre.
 * @param {object} receta  fila de recetas (con nombre_cliente, tipo_documento, numero_documento)
 * @param {object} config  configuración pública; si no viene, se consulta
 */
export async function generateRecetaPDF(receta, config = null) {
    const { default: jsPDF } = await import('jspdf');
    const cfg = config && config.empresa_nombre ? config : await getPublicConfig().catch(() => ({}));
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' });

    const PAGE_W = 210;
    const PAGE_H = 148;
    const M = 10;
    const CW = PAGE_W - 2 * M;
    let y = M;

    const font = (size, bold = false) => { doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal'); };
    const color = (rgb) => doc.setTextColor(...rgb);
    const ensureSpace = (h) => { if (y + h > PAGE_H - M) { doc.addPage(); y = M; } };

    const sectionTitle = (label) => {
        ensureSpace(9);
        font(7.5, true); color(AZUL);
        doc.text(label.toUpperCase(), M, y, { charSpace: 0.3 });
        y += 1.6;
        doc.setDrawColor(...GRIS_BORDE); doc.setLineWidth(0.2);
        doc.line(M, y, PAGE_W - M, y);
        y += 4.5;
    };

    const bloqueTexto = (label, valor) => {
        const t = txt(valor);
        if (!t) return;
        font(9);
        const lineas = doc.splitTextToSize(t, CW);
        ensureSpace(5 + lineas.length * 4.2);
        font(7, true); color(GRIS);
        doc.text(label.toUpperCase(), M, y, { charSpace: 0.2 });
        y += 4;
        font(9); color(NEGRO);
        lineas.forEach(l => { doc.text(l, M, y); y += 4.2; });
        y += 1.5;
    };

    const dibujarTabla = (encabezados, filas, anchos) => {
        const alto = 6;
        ensureSpace(alto * (filas.length + 1) + 3);
        const total = anchos.reduce((a, b) => a + b, 0);
        doc.setFillColor(...AZUL);
        doc.rect(M, y, total, alto, 'F');
        font(8, true); doc.setTextColor(255, 255, 255);
        let x = M;
        encabezados.forEach((h, i) => { doc.text(h, x + anchos[i] / 2, y + 4.4, { align: 'center' }); x += anchos[i]; });
        y += alto;
        filas.forEach(fila => {
            x = M;
            fila.forEach((celda, i) => {
                doc.setDrawColor(...GRIS_BORDE); doc.setLineWidth(0.2);
                doc.rect(x, y, anchos[i], alto);
                font(9, i === 0); color(i === 0 ? AZUL : NEGRO);
                doc.text(String(celda), x + anchos[i] / 2, y + 4.4, { align: 'center' });
                x += anchos[i];
            });
            y += alto;
        });
        y += 3;
    };

    // ── Cabecera: logo + datos de la empresa | recuadro de la receta ─────────
    const empresa   = cfg.empresa_nombre || 'Óptica';
    const direccion = [cfg.empresa_direccion, cfg.empresa_distrito, cfg.empresa_provincia, cfg.empresa_departamento].filter(Boolean).join(', ');
    const BOX_X = 142;
    const BOX_W = PAGE_W - M - BOX_X;
    const HEADER_H = 22;

    let textoX = M;
    const logo = cfg.ticket_logo;
    if (logo && logo.startsWith('data:image/')) {
        try {
            const props  = doc.getImageProperties(logo);
            const escala = Math.min(28 / props.width, HEADER_H / props.height);
            const w = props.width * escala;
            const h = props.height * escala;
            doc.addImage(logo, logo.includes('image/png') ? 'PNG' : 'JPEG', M, y, w, h, '', 'FAST');
            textoX = M + w + 5;
        } catch (e) { logger.error('RECETA_PDF', 'Error al insertar logo:', e); }
    }

    let ty = y + 4;
    font(12, true); color(AZUL);
    doc.text(doc.splitTextToSize(String(empresa).toUpperCase(), BOX_X - 4 - textoX)[0], textoX, ty); ty += 5;
    font(8); color(GRIS);
    if (cfg.empresa_ruc) { doc.text(`RUC: ${cfg.empresa_ruc}`, textoX, ty); ty += 4; }
    if (direccion) {
        doc.splitTextToSize(direccion, BOX_X - 4 - textoX).slice(0, 2).forEach(l => { doc.text(l, textoX, ty); ty += 4; });
    }
    const contacto = [cfg.empresa_telefono && `Telf: ${cfg.empresa_telefono}`, cfg.empresa_email].filter(Boolean).join('  ·  ');
    if (contacto) { doc.text(contacto, textoX, ty); }

    doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
    doc.rect(BOX_X, y, BOX_W, HEADER_H);
    font(10, true); color(AZUL);
    doc.text('RECETA DE LENTES', BOX_X + BOX_W / 2, y + 9, { align: 'center' });
    font(8.5); color(GRIS);
    doc.text('Fecha', BOX_X + BOX_W / 2, y + 15, { align: 'center' });
    font(10, true); color(NEGRO);
    doc.text(fmtFecha(receta.fecha_receta), BOX_X + BOX_W / 2, y + 20, { align: 'center' });

    y += HEADER_H + 4;

    // ── Paciente ─────────────────────────────────────────────────────────────
    doc.setFillColor(...GRIS_FONDO);
    doc.rect(M, y, CW, 9, 'F');
    font(8); color(GRIS);
    doc.text('Paciente:', M + 3, y + 5.8);
    font(10, true); color(NEGRO);
    doc.text(txt(receta.nombre_cliente), M + 21, y + 5.8);
    if (receta.numero_documento) {
        font(8); color(GRIS);
        doc.text(`${receta.tipo_documento || 'Doc.'}:`, 150, y + 5.8);
        font(10, true); color(NEGRO);
        doc.text(String(receta.numero_documento), 162, y + 5.8);
    }
    y += 13;

    // ── Refracción ───────────────────────────────────────────────────────────
    sectionTitle('Refracción');
    const conAltura = !vacio(receta.od_altura) || !vacio(receta.oi_altura);
    const conPrisma = !vacio(receta.od_prisma) || !vacio(receta.oi_prisma);
    const encabezados = ['Ojo', 'Esfera', 'Cilindro', 'Eje', 'Adición'];
    if (conAltura) encabezados.push('Altura');
    if (conPrisma) encabezados.push('Prisma');
    const anchoResto = (CW - 20) / (encabezados.length - 1);
    const anchos = [20, ...Array(encabezados.length - 1).fill(anchoResto)];
    const fila = (ojo, p) => {
        const f = [ojo, fmtGrad(receta[`${p}_esfera`]), fmtGrad(receta[`${p}_cilindro`]), fmtEje(receta[`${p}_eje`]), fmtGrad(receta[`${p}_adicion`])];
        if (conAltura) f.push(fmtMM(receta[`${p}_altura`]));
        if (conPrisma) f.push(txt(receta[`${p}_prisma`]) || '—');
        return f;
    };
    dibujarTabla(encabezados, [fila('OD', 'od'), fila('OI', 'oi')], anchos);

    // ── Agudeza visual (solo si hay datos) ───────────────────────────────────
    const av = (p, t) => txt(receta[`${p}_av_${t}`]) || '—';
    const hayAV = ['od', 'oi'].some(p => ['sc', 'ae', 'cc'].some(t => !vacio(receta[`${p}_av_${t}`])));
    if (hayAV) {
        dibujarTabla(
            ['Agudeza visual', 'Sin corrección', 'Con agujero estenopeico', 'Con lentes'],
            [['OD', av('od', 'sc'), av('od', 'ae'), av('od', 'cc')], ['OI', av('oi', 'sc'), av('oi', 'ae'), av('oi', 'cc')]],
            [40, 50, 50, 50]
        );
    }

    // ── Especificaciones ─────────────────────────────────────────────────────
    const specs = [
        ['Tipo de lente', txt(receta.tipo_lente)],
        ['Material', txt(receta.material_lente)],
        ['DIP', vacio(receta.dip) ? '' : fmtMM(receta.dip)],
        ['Período de uso', txt(receta.periodo_uso)],
        ['Próximo control', fmtFecha(receta.fecha_proximo_control)],
    ].filter(([, v]) => v);
    if (specs.length) {
        y += 3;
        const porFila = Math.min(specs.length, 5);
        const colW = CW / porFila;
        for (let i = 0; i < specs.length; i += porFila) {
            ensureSpace(11);
            specs.slice(i, i + porFila).forEach(([label, valor], j) => {
                const x = M + j * colW;
                font(7, true); color(GRIS);
                doc.text(label.toUpperCase(), x, y, { charSpace: 0.2 });
                font(9.5, true); color(NEGRO);
                doc.text(doc.splitTextToSize(valor, colW - 3)[0], x, y + 4.6);
            });
            y += 11;
        }
    }

    // ── Diagnóstico, indicaciones y observaciones ────────────────────────────
    const diag = [txt(receta.diagnostico), txt(receta.codigo_cie10) && `(CIE-10: ${txt(receta.codigo_cie10)})`].filter(Boolean).join(' ');
    bloqueTexto('Diagnóstico', diag);
    bloqueTexto('Indicaciones', receta.indicaciones);
    bloqueTexto('Observaciones', receta.observaciones);

    // ── Firma del profesional ────────────────────────────────────────────────
    const profesional = txt(receta.profesional_nombre) || txt(cfg.optica_profesional_nombre);
    const registro    = txt(receta.profesional_registro) || txt(cfg.optica_profesional_registro);
    const cargo       = txt(cfg.optica_profesional_cargo);
    if (profesional || registro || cargo) {
        ensureSpace(14);
        y = Math.max(y + 6, PAGE_H - M - 12);
        const cx = PAGE_W - M - 35;
        doc.setDrawColor(...NEGRO); doc.setLineWidth(0.3);
        doc.line(cx - 35, y, cx + 35, y);
        font(9, true); color(NEGRO);
        if (profesional) { doc.text(profesional, cx, y + 4.5, { align: 'center' }); }
        font(8); color(GRIS);
        const detalle = [cargo, registro && `Colegiatura: ${registro}`].filter(Boolean).join(' · ');
        if (detalle) doc.text(detalle, cx, y + 8.5, { align: 'center' });
    }

    // ── Guardar y abrir ──────────────────────────────────────────────────────
    const nombreArchivo = `receta_${txt(receta.nombre_cliente || 'paciente').replace(/[^\w]+/g, '_')}_${String(receta.fecha_receta || '').slice(0, 10)}.pdf`;
    const base64 = doc.output('datauristring').split(',')[1];
    if (window.electronAPI?.openPDF) await window.electronAPI.openPDF({ base64, filename: nombreArchivo });
    else window.open(doc.output('bloburl'), '_blank');
}