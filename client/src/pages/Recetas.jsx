import { useState, useEffect, useMemo, useRef } from 'react';
import { getRecetas, createReceta, updateReceta, deleteReceta, getClientes, getPublicConfig, createCliente } from '../services/api';
import { useToast } from '../components/Toast';
import {
    Plus, Search, Edit2, X, FileText,
    Calendar, Download, History, User,
    Glasses, AlertTriangle, CheckCircle2,
    RotateCcw, ChevronLeft, Database,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { generateRecetaPDF } from '../utils/recetaPDF';

// ─── Helpers oftalmológicos ────────────────────────────────────────────────
const fmtGrad = (val) => {
    if (val === null || val === undefined || val === '') return '—';
    const n = parseFloat(val);
    return (n >= 0 ? '+' : '') + n.toFixed(2);
};
const fmtEje = (val) => (val !== null && val !== undefined && val !== '' ? `${val}°` : '—');

const _vacio = (v) => v === null || v === undefined || v === '';
const fmtPorOjo = (od, oi, fmt = (v) => v) => {
    if (_vacio(od) && _vacio(oi)) return '—';
    if (!_vacio(od) && !_vacio(oi) && Number(od) === Number(oi)) return fmt(od);
    return [!_vacio(od) && `OD ${fmt(od)}`, !_vacio(oi) && `OI ${fmt(oi)}`].filter(Boolean).join(' · ');
};
const fmtAdicion = (r) => fmtPorOjo(r.od_adicion, r.oi_adicion, fmtGrad);
const fmtAltura  = (r) => fmtPorOjo(r.od_altura, r.oi_altura, (v) => `${v}mm`);
const controlVencido = (r) => !!r.fecha_proximo_control && r.fecha_proximo_control.slice(0, 10) < getTodayLocal();

const TIPOS_LENTE = ['Monofocal', 'Bifocal', 'Progresivo', 'Ocupacional', 'Fotocromático', 'Lente de contacto'];

const TIPO_COLORS = {
    'Monofocal':         { color: '#10B981', bg: 'rgba(16,185,129,0.1)'  },
    'Bifocal':           { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)'  },
    'Progresivo':        { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)'  },
    'Ocupacional':       { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'  },
    'Fotocromático':     { color: '#EC4899', bg: 'rgba(236,72,153,0.1)'  },
    'Lente de contacto': { color: '#06B6D4', bg: 'rgba(6,182,212,0.1)'   },
};
const getTipoStyle = (tipo) => TIPO_COLORS[tipo] || { color: '#64748b', bg: '#f1f5f9' };

const FORM_EMPTY = {
    id_cliente: '', fecha_receta: '',
    od_esfera: '', od_cilindro: '', od_eje: '', od_adicion: '', od_altura: '', od_prisma: '',
    od_av_sc: '', od_av_ae: '', od_av_cc: '',
    oi_esfera: '', oi_cilindro: '', oi_eje: '', oi_adicion: '', oi_altura: '', oi_prisma: '',
    oi_av_sc: '', oi_av_ae: '', oi_av_cc: '',
    dip: '', tipo_lente: '', material_lente: '', periodo_uso: '',
    diagnostico: '', codigo_cie10: '', indicaciones: '', fecha_proximo_control: '',
    profesional_nombre: '', profesional_registro: '',
    observaciones: '',
};

// ─── Generador de PDF via ventana de impresión ────────────────────────────
const generarPDF = (receta, config = {}) =>
    generateRecetaPDF(receta, config).catch(err => console.error('Error al generar la receta en PDF:', err));

// Versión anterior (HTML + impresión). Ya no se usa; se puede borrar cuando se compruebe el PDF nuevo.
const _generarPDFHtmlAntiguo = (receta, config = {}) => {
    const empresa = {
        nombre:       config.empresa_nombre       || 'Óptica',
        ruc:          config.empresa_ruc          || '',
        direccion:    config.empresa_direccion    || '',
        distrito:     config.empresa_distrito     || '',
        provincia:    config.empresa_provincia    || '',
        departamento: config.empresa_departamento || '',
        telefono:     config.empresa_telefono     || '',
        email:        config.empresa_email        || '',
    };
    const ubicacion = [empresa.distrito, empresa.provincia, empresa.departamento].filter(Boolean).join(', ');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Receta — ${receta.nombre_cliente}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,sans-serif;color:#1a1a2e;background:white;}
.page{width:210mm;min-height:148mm;padding:12mm 14mm;}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:2.5px solid #735DFF;margin-bottom:14px;}
.empresa-nombre{font-size:18px;font-weight:800;color:#1D1136;}
.empresa-sub{font-size:10px;color:#64748b;margin-top:4px;line-height:1.6;}
.titulo h2{font-size:13px;font-weight:700;color:#735DFF;text-transform:uppercase;letter-spacing:.08em;text-align:right;}
.titulo p{font-size:10px;color:#64748b;margin-top:4px;text-align:right;}
.badge-tipo{display:inline-block;padding:3px 10px;border-radius:5px;font-size:10px;font-weight:700;background:#f0f7ff;color:#3B82F6;border:1px solid #bfdbfe;margin-top:5px;}
.sec-title{font-size:9px;font-weight:700;color:#735DFF;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin:12px 0 8px;}
.paciente-grid{display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:4px;}
.dato-label{font-size:8px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.05em;}
.dato-value{font-size:12px;color:#1D1136;font-weight:600;margin-top:1px;}
table{width:100%;border-collapse:collapse;margin-bottom:12px;}
thead tr{background:#f8f7ff;}
th{padding:7px 10px;font-size:9px;font-weight:700;color:#475569;text-align:center;text-transform:uppercase;letter-spacing:.06em;border:1px solid #e2e8f0;}
th:first-child{text-align:left;}
td{padding:9px 10px;font-size:12px;text-align:center;border:1px solid #e2e8f0;font-family:monospace;font-weight:600;color:#1D1136;}
td:first-child{font-family:Arial,sans-serif;font-size:11px;}
.od{color:#EF4444;font-weight:800;}
.oi{color:#3B82F6;font-weight:800;}
.specs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;}
.spec-card{border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px;text-align:center;}
.spec-label{font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
.spec-value{font-size:14px;font-weight:800;color:#1D1136;font-family:monospace;margin-top:2px;}
.obs-box{background:#f8f7ff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;font-size:11px;color:#475569;line-height:1.6;margin-bottom:12px;}
.footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;}
.firma{text-align:center;}
.firma-linea{width:140px;border-top:1.5px solid #1D1136;margin:0 auto 5px;}
.firma-label{font-size:9px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.06em;}
.nota{font-size:8px;color:#94a3b8;text-align:right;max-width:200px;line-height:1.4;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style>
</head>
<body><div class="page">
<div class="header">
  <div>
    <div class="empresa-nombre">${empresa.nombre}</div>
    <div class="empresa-sub">
      ${empresa.ruc ? `RUC: ${empresa.ruc}<br/>` : ''}
      ${empresa.direccion ? `${empresa.direccion}${ubicacion ? ', ' + ubicacion : ''}<br/>` : ''}
      ${[empresa.telefono ? `Tel: ${empresa.telefono}` : '', empresa.email].filter(Boolean).join(' · ')}
    </div>
  </div>
  <div class="titulo">
    <h2>Receta Oftalmológica</h2>
    <p>Fecha: ${receta.fecha_receta?.slice(0,10) || '—'}</p>
    ${receta.tipo_lente ? `<div><span class="badge-tipo">${receta.tipo_lente}</span></div>` : ''}
  </div>
</div>

<div class="sec-title">Datos del Paciente</div>
<div class="paciente-grid">
  <div><div class="dato-label">Nombre completo</div><div class="dato-value" style="font-size:14px">${receta.nombre_cliente}</div></div>
  <div><div class="dato-label">Fecha de receta</div><div class="dato-value">${receta.fecha_receta?.slice(0,10) || '—'}</div></div>
</div>

<div class="sec-title">Graduación</div>
<table>
  <thead><tr><th style="width:100px">Ojo</th><th>Esfera</th><th>Cilindro</th><th>Eje</th></tr></thead>
  <tbody>
    <tr><td class="od">OD — Derecho</td><td>${fmtGrad(receta.od_esfera)}</td><td>${fmtGrad(receta.od_cilindro)}</td><td>${fmtEje(receta.od_eje)}</td></tr>
    <tr><td class="oi">OI — Izquierdo</td><td>${fmtGrad(receta.oi_esfera)}</td><td>${fmtGrad(receta.oi_cilindro)}</td><td>${fmtEje(receta.oi_eje)}</td></tr>
  </tbody>
</table>

${(receta.adicion || receta.dip || receta.altura) ? `
<div class="sec-title">Especificaciones adicionales</div>
<div class="specs">
  ${receta.adicion ? `<div class="spec-card"><div class="spec-label">Adición</div><div class="spec-value">${fmtGrad(receta.adicion)}</div></div>` : ''}
  ${receta.dip     ? `<div class="spec-card"><div class="spec-label">DIP</div><div class="spec-value">${receta.dip} mm</div></div>` : ''}
  ${receta.altura  ? `<div class="spec-card"><div class="spec-label">Altura</div><div class="spec-value">${receta.altura} mm</div></div>` : ''}
</div>` : ''}

${receta.observaciones ? `<div class="sec-title">Observaciones</div><div class="obs-box">${receta.observaciones}</div>` : ''}

<div class="footer">
  <div class="firma"><div class="firma-linea"></div><div class="firma-label">Optómetra / Responsable</div></div>
  <div class="firma"><div class="firma-linea"></div><div class="firma-label">Sello de la óptica</div></div>
  <div class="nota">Generado el ${new Date().toLocaleDateString('es-PE')}.<br/>Válido con sello y firma del responsable.</div>
</div>
</div></body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.onload = () => setTimeout(() => { w.focus(); w.print(); }, 400);
};

// ─── Columnas canónicas para export / plantilla ───────────────────────────
const XLSX_COLS = [
    { key: 'nombre_cliente',        header: 'Paciente',        width: 28 },
    { key: 'dni_ruc',               header: 'DNI / RUC',       width: 14 },
    { key: 'telefono',              header: 'Teléfono',        width: 14 },
    { key: 'fecha_receta',          header: 'Fecha',           width: 13 },
    { key: 'tipo_lente',            header: 'Tipo de lente',   width: 18 },
    { key: 'od_esfera',             header: 'OD Esfera',       width: 11 },
    { key: 'od_cilindro',           header: 'OD Cilindro',     width: 12 },
    { key: 'od_eje',                header: 'OD Eje (°)',      width: 11 },
    { key: 'od_adicion',            header: 'OD Adición',      width: 11 },
    { key: 'od_altura',             header: 'OD Altura (mm)',  width: 14 },
    { key: 'oi_esfera',             header: 'OI Esfera',       width: 11 },
    { key: 'oi_cilindro',           header: 'OI Cilindro',     width: 12 },
    { key: 'oi_eje',                header: 'OI Eje (°)',      width: 11 },
    { key: 'oi_adicion',            header: 'OI Adición',      width: 11 },
    { key: 'oi_altura',             header: 'OI Altura (mm)',  width: 14 },
    { key: 'dip',                   header: 'DIP (mm)',        width: 10 },
    { key: 'material_lente',        header: 'Material',        width: 16 },
    { key: 'periodo_uso',           header: 'Período de uso',  width: 16 },
    { key: 'od_av_sc',              header: 'OD AV s/c',       width: 10 },
    { key: 'od_av_ae',              header: 'OD AV a.e.',      width: 10 },
    { key: 'od_av_cc',              header: 'OD AV c/l',       width: 10 },
    { key: 'oi_av_sc',              header: 'OI AV s/c',       width: 10 },
    { key: 'oi_av_ae',              header: 'OI AV a.e.',      width: 10 },
    { key: 'oi_av_cc',              header: 'OI AV c/l',       width: 10 },
    { key: 'od_prisma',             header: 'OD Prisma',       width: 11 },
    { key: 'oi_prisma',             header: 'OI Prisma',       width: 11 },
    { key: 'diagnostico',           header: 'Diagnóstico',     width: 24 },
    { key: 'codigo_cie10',          header: 'CIE-10',          width: 10 },
    { key: 'fecha_proximo_control', header: 'Próximo control', width: 15 },
    { key: 'indicaciones',          header: 'Indicaciones',    width: 30 },
    { key: 'profesional_nombre',    header: 'Profesional',     width: 22 },
    { key: 'profesional_registro',  header: 'Colegiatura',     width: 14 },
    { key: 'observaciones',         header: 'Observaciones',   width: 36 },
];

// Columnas numéricas (esfera, cilindro, adición, altura, DIP) y de eje (entero)
const COLS_NUM = new Set(['od_esfera', 'od_cilindro', 'od_adicion', 'od_altura', 'oi_esfera', 'oi_cilindro', 'oi_adicion', 'oi_altura', 'dip']);
const COLS_EJE = new Set(['od_eje', 'oi_eje']);

// Fila de ejemplo de la hoja "Plantilla" (se arma por clave para no desalinear columnas)
const EJEMPLO_PLANTILLA = {
    nombre_cliente: 'Juan Pérez López', dni_ruc: '12345678', telefono: '987654321', fecha_receta: '2025-01-15',
    tipo_lente: 'Monofocal',
    od_esfera: -1.75, od_cilindro: -0.5, od_eje: 180, od_altura: 18,
    oi_esfera: -2.0, oi_cilindro: -0.25, oi_eje: 175, oi_altura: 18,
    dip: 62, material_lente: 'Policarbonato', periodo_uso: 'Uso permanente',
    od_av_sc: '20/100', oi_av_sc: '20/100',
    diagnostico: 'Miopía', codigo_cie10: 'H52.1', fecha_proximo_control: '2025-07-15',
    indicaciones: 'Control a los 6 meses', observaciones: 'Sin observaciones',
};

// ─── Estilos reutilizables ────────────────────────────────────────────────
const XL_STYLE = {
    headerFill:   { patternType: 'solid', fgColor: { rgb: '735DFF' } },
    headerFont:   { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Calibri' },
    headerAlign:  { horizontal: 'center', vertical: 'center', wrapText: true },
    headerBorder: { top: { style: 'thin', color: { rgb: 'FFFFFF' } }, bottom: { style: 'medium', color: { rgb: 'FFFFFF' } }, left: { style: 'thin', color: { rgb: 'FFFFFF' } }, right: { style: 'thin', color: { rgb: 'FFFFFF' } } },
    dataFont:     { sz: 10, name: 'Calibri' },
    dataAlign:    { vertical: 'center' },
    dataAlignC:   { horizontal: 'center', vertical: 'center' },
    dataAlignR:   { horizontal: 'right',  vertical: 'center' },
    dataBorder:   { top: { style: 'thin', color: { rgb: 'E2E8F0' } }, bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }, left: { style: 'thin', color: { rgb: 'E2E8F0' } }, right: { style: 'thin', color: { rgb: 'E2E8F0' } } },
    evenFill:     { patternType: 'solid', fgColor: { rgb: 'F8F7FF' } },
    oddFill:      { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
    gradFont:     { sz: 10, name: 'Courier New', bold: true },
    accentFill:   { patternType: 'solid', fgColor: { rgb: 'EEF2FF' } },
};

const applyHeaderStyle = (ws, cellRef) => {
    if (!ws[cellRef]) return;
    ws[cellRef].s = {
        fill: XL_STYLE.headerFill, font: XL_STYLE.headerFont,
        alignment: XL_STYLE.headerAlign, border: XL_STYLE.headerBorder,
    };
};

const applyDataStyle = (ws, cellRef, isEven, isNumeric, isText) => {
    if (!ws[cellRef]) return;
    ws[cellRef].s = {
        fill: isEven ? XL_STYLE.evenFill : XL_STYLE.oddFill,
        font: isNumeric ? XL_STYLE.gradFont : XL_STYLE.dataFont,
        alignment: isText ? XL_STYLE.dataAlign : isNumeric ? XL_STYLE.dataAlignC : XL_STYLE.dataAlignC,
        border: XL_STYLE.dataBorder,
    };
};

// ─── Exportar recetas a XLSX ──────────────────────────────────────────────
const exportarXLSX = (recetas, clientes, config = {}) => {
    const wb = XLSX.utils.book_new();
    wb.Props = { Title: 'Recetas Oftalmológicas', Author: config.empresa_nombre || 'Óptica', CreatedDate: new Date() };

    // ── Hoja 1: Recetas ──────────────────────────────────────────────────
    const clienteMap = Object.fromEntries(clientes.map(c => [String(c.id_cliente), c]));

    const rows = recetas.map(r => {
        const c = clienteMap[String(r.id_cliente)] || {};
        return XLSX_COLS.map(col => {
            if (col.key === 'dni_ruc')   return r.numero_documento || c.numero_documento || '';
            if (col.key === 'telefono')  return c.telefono  || '';
            const v = r[col.key];
            if (v === null || v === undefined) return '';
            return v;
        });
    });

    const wsData = [XLSX_COLS.map(c => c.header), ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // anchos de columna
    ws['!cols'] = XLSX_COLS.map(c => ({ wch: c.width }));
    // altura de filas
    ws['!rows'] = [{ hpt: 32 }, ...rows.map(() => ({ hpt: 20 }))];

    // estilos encabezado
    XLSX_COLS.forEach((_, ci) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
        applyHeaderStyle(ws, cellRef);
    });

    // estilos datos
    const NUMERIC_KEYS = new Set([...COLS_NUM, ...COLS_EJE]);
    const TEXT_KEYS    = new Set(['nombre_cliente','observaciones','tipo_lente','material_lente','periodo_uso','diagnostico','indicaciones','profesional_nombre']);
    rows.forEach((_, ri) => {
        const isEven = ri % 2 === 0;
        XLSX_COLS.forEach((col, ci) => {
            const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
            applyDataStyle(ws, cellRef, isEven, NUMERIC_KEYS.has(col.key), TEXT_KEYS.has(col.key));
        });
    });

    // congelar primera fila
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, 'Recetas');

    // ── Hoja 2: Resumen ──────────────────────────────────────────────────
    const total   = recetas.length;
    const activas = recetas.filter(r => r.activa).length;
    const conteoTipo = TIPOS_LENTE.map(t => [t, recetas.filter(r => r.tipo_lente === t).length]);
    const empresa = config.empresa_nombre || 'Óptica';
    const hoy     = new Date().toLocaleDateString('es-PE');

    const wsRes = XLSX.utils.aoa_to_sheet([
        [`${empresa} — Resumen de Recetas`],
        [`Generado: ${hoy}`],
        [],
        ['Métrica', 'Valor'],
        ['Total de recetas', total],
        ['Recetas activas', activas],
        ['Recetas inactivas', total - activas],
        [],
        ['Tipo de lente', 'Cantidad'],
        ...conteoTipo,
    ]);
    wsRes['!cols'] = [{ wch: 26 }, { wch: 14 }];
    wsRes['!rows'] = [{ hpt: 28 }, { hpt: 16 }];

    // título resumen
    if (wsRes['A1']) wsRes['A1'].s = { font: { bold: true, sz: 14, name: 'Calibri', color: { rgb: '1D1136' } }, alignment: { horizontal: 'left', vertical: 'center' } };
    // cabeceras de tabla resumen
    ['A4','B4','A9','B9'].forEach(ref => {
        if (wsRes[ref]) wsRes[ref].s = { fill: XL_STYLE.headerFill, font: XL_STYLE.headerFont, alignment: XL_STYLE.headerAlign, border: XL_STYLE.headerBorder };
    });

    XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen');

    // ── Hoja 3: Plantilla ────────────────────────────────────────────────
    const wsPlantilla = XLSX.utils.aoa_to_sheet([
        XLSX_COLS.map(c => c.header),
        XLSX_COLS.map(c => EJEMPLO_PLANTILLA[c.key] ?? ''),
    ]);
    wsPlantilla['!cols'] = XLSX_COLS.map(c => ({ wch: c.width }));
    wsPlantilla['!rows'] = [{ hpt: 32 }, { hpt: 20 }];
    XLSX_COLS.forEach((_, ci) => applyHeaderStyle(wsPlantilla, XLSX.utils.encode_cell({ r: 0, c: ci })));
    // fila ejemplo con fondo amarillo suave
    XLSX_COLS.forEach((col, ci) => {
        const ref = XLSX.utils.encode_cell({ r: 1, c: ci });
        if (wsPlantilla[ref]) wsPlantilla[ref].s = { fill: { patternType: 'solid', fgColor: { rgb: 'FFFBEB' } }, font: { sz: 10, name: 'Calibri', italic: true, color: { rgb: '92400E' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: XL_STYLE.dataBorder };
    });
    XLSX.utils.book_append_sheet(wb, wsPlantilla, 'Plantilla');

    const fecha = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `recetas_${fecha}.xlsx`);
};

// ─── Importar recetas desde XLSX / CSV ───────────────────────────────────
const importarXLSX = (file, clientes, onCreate, onToast) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const wb   = XLSX.read(e.target.result, { type: 'array' });
            // busca hoja "Recetas" o usa la primera que no sea Resumen/Plantilla
            const sheetName = wb.SheetNames.find(n => n === 'Recetas') || wb.SheetNames.find(n => !['Resumen','Plantilla'].includes(n));
            if (!sheetName) { onToast('No se encontró hoja de datos válida', 'error'); return; }

            const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
            if (rows.length === 0) { onToast('El archivo no contiene filas de datos', 'warning'); return; }

            const clientePorNombre = Object.fromEntries(
                clientes.map(c => [c.nombre_razon_social?.toLowerCase().trim(), c])
            );
            const clientePorDoc = Object.fromEntries(
                clientes.filter(c => c.numero_documento).map(c => [String(c.numero_documento).trim(), c])
            );

            let ok = 0, errores = 0;
            for (const row of rows) {
                const nombre  = String(row['Paciente'] || '').trim();
                const docNum  = String(row['DNI / RUC'] || '').trim();
                const cliente = (docNum && clientePorDoc[docNum]) || clientePorNombre[nombre.toLowerCase()];
                if (!cliente) { errores++; continue; }

                const parseNum = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
                const parseInt2 = (v) => { const n = parseInt(v); return isNaN(n) ? null : n; };

                const payload = {
                    id_cliente:   cliente.id_cliente,
                    fecha_receta: String(row['Fecha'] || '').slice(0,10) || new Date().toISOString().slice(0,10),
                };
                XLSX_COLS.forEach(col => {
                    if (['nombre_cliente', 'dni_ruc', 'telefono', 'fecha_receta'].includes(col.key)) return;
                    const raw = row[col.header];
                    if (COLS_NUM.has(col.key))      payload[col.key] = parseNum(raw);
                    else if (COLS_EJE.has(col.key)) payload[col.key] = parseInt2(raw);
                    else if (col.key === 'fecha_proximo_control') payload[col.key] = String(raw ?? '').trim().slice(0, 10) || null;
                    else                            payload[col.key] = String(raw ?? '').trim() || null;
                });
                // Compatibilidad con archivos exportados antes (una sola Adición / Altura para ambos ojos)
                if (payload.od_adicion == null && payload.oi_adicion == null && row['Adición'] !== undefined) {
                    payload.od_adicion = payload.oi_adicion = parseNum(row['Adición']);
                }
                if (payload.od_altura == null && payload.oi_altura == null && row['Altura (mm)'] !== undefined) {
                    payload.od_altura = payload.oi_altura = parseNum(row['Altura (mm)']);
                }
                try { await onCreate(payload); ok++; }
                catch { errores++; }
            }

            if (ok > 0)      onToast(`${ok} receta${ok > 1 ? 's' : ''} importada${ok > 1 ? 's' : ''} correctamente`, 'success');
            if (errores > 0) onToast(`${errores} fila${errores > 1 ? 's' : ''} no pudieron importarse (paciente no encontrado o error de API)`, 'warning');
        } catch {
            onToast('Error al leer el archivo. Verifica el formato.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
};

// ══════════════════════════════════════════════════════════════════════════
const getTodayLocal = () => {                          // ← AGREGAR AQUÍ
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// ══════════════════════════════════════════════════════════════════════════
export default function Recetas() {
    const toast = useToast();
    const [vista, setVista]               = useState('lista');
    const [recetas, setRecetas]           = useState([]);
    const [todasRecetas, setTodasRecetas] = useState([]);
    const [clientes, setClientes]         = useState([]);
    const [configEmpresa, setConfigEmpresa] = useState({});
    const [loading, setLoading]           = useState(true);
    const [search, setSearch]             = useState('');
    const [filterCliente, setFilterCliente] = useState('');
    const [filterTipo, setFilterTipo]     = useState('');
    const [showInactivas, setShowInactivas] = useState(false);
    const todayISO = getTodayLocal();    
    const [filterFechaDesde, setFilterFechaDesde] = useState('');
    const [filterFechaHasta, setFilterFechaHasta] = useState('');
    const [showForm, setShowForm]         = useState(false);
    const [editing, setEditing]           = useState(null);
    const [form, setForm]                 = useState(FORM_EMPTY);
    const [saving, setSaving]             = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const fileInputRef = useRef(null);
    const [showDatosMenu, setShowDatosMenu] = useState(false);

    // Historial paciente
    const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
    const [recetasPaciente, setRecetasPaciente]           = useState([]);
    const [loadingPaciente, setLoadingPaciente]           = useState(false);

    // Historial general
    const [histFechaDesde, setHistFechaDesde]         = useState('');
    const [histFechaHasta, setHistFechaHasta]         = useState('');
    const [histSearchPaciente, setHistSearchPaciente] = useState('');

    useEffect(() => {
        loadData();
        getClientes().then(setClientes);
        getPublicConfig().then(setConfigEmpresa).catch(() => {});
    }, []);

    useEffect(() => { loadData(); }, [filterCliente, showInactivas]);

    const loadData = () => {
        setLoading(true);
        getRecetas({ id_cliente: filterCliente || undefined, activa: showInactivas ? undefined : true })
            .then(setRecetas).catch(() => toast('Error al cargar', 'error')).finally(() => setLoading(false));
    };

    const loadTodasRecetas = () => getRecetas({}).then(setTodasRecetas).catch(() => {});

    const abrirHistorialGeneral = () => {
        loadTodasRecetas(); setVista('historial_general');
        setHistFechaDesde(''); setHistFechaHasta(''); setHistSearchPaciente('');
    };

    const abrirHistorialPaciente = async (cliente) => {
        setPacienteSeleccionado(cliente); setLoadingPaciente(true); setVista('historial_paciente');
        try {
            const data = await getRecetas({ id_cliente: cliente.id_cliente });
            setRecetasPaciente(data.sort((a, b) => new Date(b.fecha_receta) - new Date(a.fecha_receta)));
        } catch { toast('Error al cargar historial', 'error'); }
        finally { setLoadingPaciente(false); }
    };

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return recetas.filter(r => {
            // Filtro de texto
            const matchQ = !q || 
                r.nombre_cliente?.toLowerCase().includes(q) || 
                r.tipo_lente?.toLowerCase().includes(q) || 
                r.fecha_receta?.includes(q);
            // Filtro de tipo
            const matchTipo = !filterTipo || r.tipo_lente === filterTipo;
            // Filtro de fechas (compara solo la parte de fecha, no la hora)
            const fecha = r.fecha_receta?.slice(0,10) || '';
            const matchFechaDesde = !filterFechaDesde || fecha >= filterFechaDesde;
            const matchFechaHasta = !filterFechaHasta || fecha <= filterFechaHasta;
            return matchQ && matchTipo && matchFechaDesde && matchFechaHasta;
        });
    }, [recetas, search, filterTipo, filterFechaDesde, filterFechaHasta]);

    const filteredHistorial = useMemo(() => {
        return todasRecetas.filter(r => {
            const matchQ = !histSearchPaciente || r.nombre_cliente?.toLowerCase().includes(histSearchPaciente.toLowerCase());
            const matchD = !histFechaDesde || r.fecha_receta >= histFechaDesde;
            const matchH = !histFechaHasta || r.fecha_receta <= histFechaHasta;
            return matchQ && matchD && matchH;
        }).sort((a, b) => new Date(b.fecha_receta) - new Date(a.fecha_receta));
    }, [todasRecetas, histSearchPaciente, histFechaDesde, histFechaHasta]);

    const f = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
    const openCreate = (preClienteId = '') => {
        setForm({
            ...FORM_EMPTY,
            id_cliente: preClienteId,
            fecha_receta: getTodayLocal(),
            profesional_nombre: configEmpresa.optica_profesional_nombre || '',
            profesional_registro: configEmpresa.optica_profesional_registro || '',
        });
        setEditing(null);
        setShowForm(true);
    };
    // Los null del servidor se pasan a '' para que los inputs sigan controlados
    const openEdit = (r) => {
        const limpio = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? '']));
        setForm({ ...FORM_EMPTY, ...limpio });
        setEditing(r);
        setShowForm(true);
    };

    // ── Callback cuando se crea un cliente desde el modal ─────────────────
    const handleClienteCreado = (nuevoCliente) => {
        setClientes(prev => [...prev, nuevoCliente]);
        toast(`Cliente "${nuevoCliente.nombre_razon_social}" creado`, 'success');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.id_cliente) return toast('Selecciona un cliente', 'error');

        // ── Validación clínica: OD e OI idénticos ────────────────────────
        const tieneOD = form.od_esfera !== '' || form.od_cilindro !== '' || form.od_eje !== '';
        const tieneOI = form.oi_esfera !== '' || form.oi_cilindro !== '' || form.oi_eje !== '';
        if (tieneOD && tieneOI &&
            form.od_esfera   === form.oi_esfera   &&
            form.od_cilindro === form.oi_cilindro &&
            form.od_eje      === form.oi_eje) {
            toast('⚠️ OD e OI tienen valores idénticos — verifica antes de guardar', 'warning');
            // No bloqueamos, solo advertimos. El usuario puede guardar igual.
        }

        setSaving(true);
        try {
            const payload = {
                ...form,
                od_esfera:    form.od_esfera    !== '' ? parseFloat(form.od_esfera)    : null,
                od_cilindro:  form.od_cilindro  !== '' ? parseFloat(form.od_cilindro)  : null,
                od_eje:       form.od_eje       !== '' ? parseInt(form.od_eje)          : null,
                oi_esfera:    form.oi_esfera    !== '' ? parseFloat(form.oi_esfera)    : null,
                oi_cilindro:  form.oi_cilindro  !== '' ? parseFloat(form.oi_cilindro)  : null,
                oi_eje:       form.oi_eje       !== '' ? parseInt(form.oi_eje)          : null,
                tipo_lente:   form.tipo_lente   || null,
                od_adicion:   form.od_adicion   !== '' ? parseFloat(form.od_adicion)   : null,
                oi_adicion:   form.oi_adicion   !== '' ? parseFloat(form.oi_adicion)   : null,
                od_altura:    form.od_altura    !== '' ? parseFloat(form.od_altura)    : null,
                oi_altura:    form.oi_altura    !== '' ? parseFloat(form.oi_altura)    : null,
                dip:          form.dip          !== '' ? parseFloat(form.dip)          : null,
                observaciones: form.observaciones || null,
            };
            if (editing) { await updateReceta(editing.id_receta, payload); toast('Receta actualizada'); }
            else         { await createReceta(payload); toast('Receta registrada'); }
            setShowForm(false); loadData();
            if (vista === 'historial_paciente' && pacienteSeleccionado) abrirHistorialPaciente(pacienteSeleccionado);
        } catch (err) { toast(err.response?.data?.error || 'Error al guardar', 'error'); }
        finally { setSaving(false); }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try { await deleteReceta(deleteTarget.id); toast('Receta desactivada'); setDeleteTarget(null); loadData(); }
        catch { toast('Error al desactivar', 'error'); }
    };

    // ── Historial General ──────────────────────────────────────────────────
    if (vista === 'historial_general') return (
        <div className="page-enter">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <button onClick={() => setVista('lista')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>
                    <ChevronLeft size={15} /> Volver
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,rgba(139,92,246,0.15),rgba(59,130,246,0.15))', border: '1.5px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <History size={18} color="#8B5CF6" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 19, fontWeight: 800, color: '#1D1136', margin: 0 }}>Historial General de Recetas</h1>
                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{filteredHistorial.length} recetas · activas e inactivas</p>
                    </div>
                </div>
            </div>
            <div className="card mb-4" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
                        <Search size={14} className="search-icon" />
                        <input className="form-input" placeholder="Buscar paciente…" value={histSearchPaciente} onChange={e => setHistSearchPaciente(e.target.value)} style={{ paddingLeft: 38 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>Desde</label>
                        <input className="form-input" type="date" value={histFechaDesde} onChange={e => setHistFechaDesde(e.target.value)} style={{ width: 150 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>Hasta</label>
                        <input className="form-input" type="date" value={histFechaHasta} onChange={e => setHistFechaHasta(e.target.value)} style={{ width: 150 }} />
                    </div>
                    {(histSearchPaciente || histFechaDesde || histFechaHasta) && (
                        <button onClick={() => { setHistSearchPaciente(''); setHistFechaDesde(''); setHistFechaHasta(''); }} style={{ padding: 8, borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#94a3b8' }}><RotateCcw size={14} /></button>
                    )}
                </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {filteredHistorial.length === 0 ? (
                    <div className="empty-state" style={{ padding: 48 }}><History size={44} style={{ color: '#cbd5e1' }} /><p style={{ color: '#94a3b8', marginTop: 12 }}>Sin recetas en el período</p></div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead><tr><th>Paciente</th><th>Fecha</th><th>Tipo</th><th style={{ textAlign: 'center' }}>OD</th><th style={{ textAlign: 'center' }}>OI</th><th style={{ textAlign: 'center' }}>Adición</th><th style={{ textAlign: 'center' }}>Estado</th><th style={{ textAlign: 'center' }}>PDF</th></tr></thead>
                            <tbody>
                                {filteredHistorial.map(r => {
                                    const ts = getTipoStyle(r.tipo_lente);
                                    return (
                                        <tr key={r.id_receta} style={{ opacity: r.activa ? 1 : 0.6 }}>
                                            <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#735DFF22,#C516E122)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#735DFF', flexShrink: 0 }}>{r.nombre_cliente?.slice(0,2).toUpperCase()}</div><span style={{ fontSize: 13, fontWeight: 600, color: '#1D1136' }}>{r.nombre_cliente}</span></div></td>
                                            <td style={{ fontSize: 12, color: '#64748b' }}>{r.fecha_receta?.slice(0,10)}</td>
                                            <td>{r.tipo_lente ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: ts.bg, color: ts.color }}>{r.tipo_lente}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                            <td style={{ textAlign: 'center' }}><GradCell esf={r.od_esfera} cil={r.od_cilindro} eje={r.od_eje} /></td>
                                            <td style={{ textAlign: 'center' }}><GradCell esf={r.oi_esfera} cil={r.oi_cilindro} eje={r.oi_eje} /></td>
                                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{fmtAdicion(r)}</td>
                                            <td style={{ textAlign: 'center' }}>{r.activa ? <span className="badge badge-success" style={{ fontSize: 10 }}><CheckCircle2 size={10} /> Activa</span> : <span className="badge badge-neutral" style={{ fontSize: 10 }}>Inactiva</span>}</td>
                                            <td style={{ textAlign: 'center' }}><button onClick={() => generarPDF(r, configEmpresa)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', background: 'rgba(115,93,255,0.06)', border: '1.5px solid rgba(115,93,255,0.2)', fontSize: 11, fontWeight: 700, color: '#735DFF' }}><Download size={12} /> PDF</button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );

    // ── Historial por Paciente ─────────────────────────────────────────────
    if (vista === 'historial_paciente') return (
        <div className="page-enter">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <button onClick={() => setVista('lista')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>
                    <ChevronLeft size={15} /> Volver
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(59,130,246,0.15))', border: '1.5px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={18} color="#10B981" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 19, fontWeight: 800, color: '#1D1136', margin: 0 }}>{pacienteSeleccionado?.nombre_razon_social}</h1>
                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{recetasPaciente.length} receta{recetasPaciente.length !== 1 ? 's' : ''} registrada{recetasPaciente.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                {/* ── MEJORA: Nueva receta para este paciente sin volver ── */}
                <button
                    className="btn btn-primary btn-sm"
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => openCreate(String(pacienteSeleccionado?.id_cliente || ''))}
                >
                    <Plus size={14} /> Nueva receta
                </button>
            </div>

            {loadingPaciente ? <div className="loader"><div className="spinner" /></div> : recetasPaciente.length === 0 ? (
                <div className="empty-state" style={{ padding: 64 }}><FileText size={44} style={{ color: '#cbd5e1' }} /><p style={{ color: '#94a3b8', marginTop: 12 }}>Sin recetas registradas</p></div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: recetasPaciente.length > 1 ? '1fr 1fr' : '1fr', gap: 16 }}>
                    {recetasPaciente.map((r, idx) => {
                        const ts = getTipoStyle(r.tipo_lente);
                        const esMasReciente = idx === 0;
                        return (
                            <div key={r.id_receta} className="card" style={{ padding: 0, overflow: 'hidden', border: esMasReciente ? '2px solid rgba(115,93,255,0.3)' : '1.5px solid #e2e8f0', opacity: r.activa ? 1 : 0.65 }}>
                                <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: esMasReciente ? 'linear-gradient(135deg,#f8f7ff,#f0f7ff)' : '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                                            {esMasReciente && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: 'rgba(115,93,255,0.1)', color: '#735DFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Más reciente</span>}
                                            {!r.activa && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#f1f5f9', color: '#94a3b8', textTransform: 'uppercase' }}>Inactiva</span>}
                                        </div>
                                        <p style={{ fontSize: 14, fontWeight: 700, color: '#1D1136', margin: 0 }}>{r.fecha_receta?.slice(0,10)}</p>
                                        {r.tipo_lente && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: ts.bg, color: ts.color, marginTop: 4, display: 'inline-block' }}>{r.tipo_lente}</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => generarPDF(r, configEmpresa)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', background: 'rgba(115,93,255,0.06)', border: '1.5px solid rgba(115,93,255,0.2)', fontSize: 11, fontWeight: 700, color: '#735DFF' }}><Download size={13} /> PDF</button>
                                        <button onClick={() => openEdit(r)} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: 7, cursor: 'pointer', background: '#f8f7ff', border: '1.5px solid #e2e8f0', color: '#64748b' }}><Edit2 size={13} /></button>
                                    </div>
                                </div>
                                <div style={{ padding: '14px 18px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                                        <thead><tr style={{ background: '#f8f7ff' }}>{['Ojo','Esfera','Cilindro','Eje'].map(h => <th key={h} style={{ padding: '6px 10px', fontSize: 9, fontWeight: 700, color: '#64748b', textAlign: h==='Ojo'?'left':'center', textTransform: 'uppercase', border: '1px solid #e2e8f0' }}>{h}</th>)}</tr></thead>
                                        <tbody>
                                            {[['OD','#EF4444',r.od_esfera,r.od_cilindro,r.od_eje],['OI','#3B82F6',r.oi_esfera,r.oi_cilindro,r.oi_eje]].map(([ojo,color,esf,cil,eje]) => (
                                                <tr key={ojo}>
                                                    <td style={{ padding: '8px 10px', border: '1px solid #e2e8f0' }}><span style={{ fontSize: 11, fontWeight: 800, color, background: color+'14', padding: '2px 7px', borderRadius: 4 }}>{ojo}</span></td>
                                                    {[fmtGrad(esf),fmtGrad(cil),fmtEje(eje)].map((v,i) => <td key={i} style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, border: '1px solid #e2e8f0', color: v==='—'?'#cbd5e1':'#1D1136' }}>{v}</td>)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {(r.od_adicion != null || r.oi_adicion != null || r.dip != null || r.od_altura != null || r.oi_altura != null || r.material_lente || r.fecha_proximo_control) && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: r.observaciones ? 10 : 0 }}>
                                            {(r.od_adicion != null || r.oi_adicion != null) && <SpecMini label="Adición" value={fmtAdicion(r)} />}
                                            {r.dip != null && <SpecMini label="DIP" value={`${r.dip}mm`} />}
                                            {(r.od_altura != null || r.oi_altura != null) && <SpecMini label="Altura" value={fmtAltura(r)} />}
                                            {r.material_lente && <SpecMini label="Material" value={r.material_lente} />}
                                            {r.fecha_proximo_control && <SpecMini label="Próx. control" value={r.fecha_proximo_control.slice(0, 10)} />}
                                        </div>
                                    )}
                                    {r.observaciones && <div style={{ fontSize: 11, color: '#64748b', background: '#f8f7ff', borderRadius: 7, padding: '7px 10px', fontStyle: 'italic' }}>{r.observaciones}</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {showForm && (
                <FormModal
                    form={form} f={f} editing={editing} saving={saving}
                    clientes={clientes}
                    onClose={() => setShowForm(false)}
                    onSubmit={handleSubmit}
                    onClienteCreado={handleClienteCreado}
                />
            )}
        </div>
    );

    // ── Lista principal ────────────────────────────────────────────────────
    return (
        <div className="page-enter">
            <div className="page-header" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 50, height: 50, borderRadius: 14, background: 'linear-gradient(135deg,rgba(16,185,129,0.18),rgba(59,130,246,0.18))', border: '1.5px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Glasses size={23} color="#10B981" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1D1136', margin: 0, letterSpacing: '-0.02em' }}>Recetas Oftalmológicas</h1>
                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontWeight: 700, borderRadius: 5, padding: '1px 7px', fontSize: 11 }}>
                                <Calendar size={10} />
                                {recetas.filter(r => r.activa && r.fecha_receta?.slice(0,10) === getTodayLocal()).length} hoy
                            </span>
                            <span style={{ color: '#e2e8f0' }}>·</span>
                            <b style={{ color: '#1D1136' }}>{recetas.filter(r => r.activa).length}</b> activas
                            <span style={{ color: '#e2e8f0' }}>·</span>
                            {recetas.length} total
                        </p>
                    </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {/* ── input file oculto ── */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: 'none' }}
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        importarXLSX(file, clientes, createReceta, toast);
                        e.target.value = '';
                        setTimeout(loadData, 1200);
                    }}
                />

                {/* ── Datos (dropdown) ── */}
                {/* ── Datos (dropdown) ── */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowDatosMenu(v => !v)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7,
                            padding: '10px 16px', borderRadius: 10,
                            border: '1.5px solid #e2e8f0', background: 'white',
                            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}
                    >
                        <Database size={15} /> Datos ▾
                    </button>

                    {showDatosMenu && (
                        <>
                            {/* overlay para cerrar al hacer clic fuera */}
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                                onClick={() => setShowDatosMenu(false)}
                            />
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                background: 'white', borderRadius: 10, zIndex: 20,
                                border: '1.5px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                                minWidth: 180, overflow: 'hidden',
                            }}>
                                <button
                                    onClick={() => { exportarXLSX(recetas, clientes, configEmpresa); setShowDatosMenu(false); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 9,
                                        width: '100%', padding: '11px 16px', background: 'none',
                                        border: 'none', cursor: 'pointer', fontSize: 13,
                                        fontWeight: 600, color: '#10B981', textAlign: 'left',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.07)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <Download size={14} /> Exportar
                                </button>
                                <div style={{ height: 1, background: '#f1f5f9', margin: '0 12px' }} />
                                <button
                                    onClick={() => { fileInputRef.current?.click(); setShowDatosMenu(false); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 9,
                                        width: '100%', padding: '11px 16px', background: 'none',
                                        border: 'none', cursor: 'pointer', fontSize: 13,
                                        fontWeight: 600, color: '#3B82F6', textAlign: 'left',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.07)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <Plus size={14} /> Importar
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <button
                        onClick={abrirHistorialGeneral}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                    >
                        <History size={15} /> Historial general
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => openCreate()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, borderRadius: 10,lineHeight: 1, boxShadow: '0 2px 8px rgba(115,93,255,0.25)' }}
                    >
                        <Plus size={16} style={{ flexShrink: 0 }} /> Nueva Receta
                    </button>
                </div>
            </div>

            <div className="card mb-4" style={{ padding: '16px 20px' }}>
                {/* Fila 1: búsqueda + selects */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                    <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
                        <Search size={14} className="search-icon" />
                        <input className="form-input" placeholder="Buscar por cliente, tipo o fecha…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
                    </div>
                    <select className="form-select" style={{ maxWidth: 220 }} value={filterCliente} onChange={e => setFilterCliente(e.target.value)}>
                        <option value="">Todos los clientes</option>
                        {clientes.map(c => <option key={c.id_cliente} value={c.id_cliente}>{c.nombre_razon_social}</option>)}
                    </select>
                    <select className="form-select" style={{ maxWidth: 170 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
                        <option value="">Todos los tipos</option>
                        {TIPOS_LENTE.map(t => <option key={t}>{t}</option>)}
                    </select>
                </div>
                {/* Fila 2: fechas + acciones */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Grupo de fechas con borde contenedor */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0, border: '1.5px solid #e2e8f0', borderRadius: 9, overflow: 'hidden', background: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', borderRight: '1px solid #f1f5f9' }}>
                            <Calendar size={13} color="#94a3b8" />
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>Desde</span>
                            <input
                                type="date"
                                value={filterFechaDesde}
                                onChange={e => setFilterFechaDesde(e.target.value)}
                                style={{ border: 'none', outline: 'none', fontSize: 12, fontWeight: 500, color: '#1D1136', background: 'transparent', padding: '8px 0', width: 130, cursor: 'pointer' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>Hasta</span>
                            <input
                                type="date"
                                value={filterFechaHasta}
                                onChange={e => setFilterFechaHasta(e.target.value)}
                                style={{ border: 'none', outline: 'none', fontSize: 12, fontWeight: 500, color: '#1D1136', background: 'transparent', padding: '8px 0', width: 130, cursor: 'pointer' }}
                            />
                        </div>
                    </div>
                    {/* Botón Hoy con estado activo */}
                    {(() => {
                        const t = getTodayLocal();
                        const isHoy = filterFechaDesde === t && filterFechaHasta === t;
                        return (
                            <button
                                onClick={() => { setFilterFechaDesde(t); setFilterFechaHasta(t); }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    border: `1.5px solid ${isHoy ? '#10B981' : '#d1fae5'}`,
                                    background: isHoy ? '#10B981' : 'rgba(16,185,129,0.07)',
                                    color: isHoy ? 'white' : '#10B981',
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                    boxShadow: isHoy ? '0 2px 8px rgba(16,185,129,0.3)' : 'none',
                                    transition: 'all 0.15s',
                                }}
                            >
                                <Calendar size={12} style={{ flexShrink: 0 }} /> Hoy
                            </button>
                        );
                    })()}
                    <button
                        onClick={() => setShowInactivas(p => !p)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                            borderColor: showInactivas ? '#8B5CF6' : '#e2e8f0',
                            background: showInactivas ? 'rgba(139,92,246,0.08)' : 'white',
                            color: showInactivas ? '#8B5CF6' : '#64748b',
                        }}
                    >
                        {showInactivas ? 'Mostrando todas' : 'Ver inactivas'}
                    </button>
                    {/* Separador + Reset: solo visible con filtros activos */}
                    {(search || filterCliente || filterTipo || filterFechaDesde || filterFechaHasta) && (
                        <>
                            <div style={{ width: 1, height: 20, background: '#e2e8f0', flexShrink: 0 }} />
                            <button
                                onClick={() => {
                                    setSearch('');
                                    setFilterCliente('');
                                    setFilterTipo('');
                                    setFilterFechaDesde('');
                                    setFilterFechaHasta('');
                                }}
                                title="Limpiar filtros"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #fecaca', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', color: '#EF4444', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                                <RotateCcw size={13} /> Limpiar
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? <div className="loader"><div className="spinner" /></div> : filtered.length === 0 ? (
                    <div className="empty-state" style={{ padding: '72px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: '100%' }}>
                        <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, rgba(115,93,255,0.08), rgba(139,92,246,0.12))', border: '1.5px solid rgba(115,93,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'center', marginBottom: 20, lineHeight: 0 }}>
                            <Glasses size={34} color="#735DFF" strokeWidth={1.5} style={{ display: 'block' }} />
                        </div>
                        <p style={{ fontSize: 16, fontWeight: 700, color: '#1D1136', margin: '0 0 6px' }}>
                            {search || filterCliente || filterTipo ? 'Sin resultados para tu búsqueda' : 'No hay recetas registradas'}
                        </p>
                        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 24px', textAlign: 'center', maxWidth: 280 }}>
                            {search || filterCliente || filterTipo
                                ? 'Intenta ajustar los filtros o limpiar la búsqueda.'
                                : 'Registra la primera receta oftalmológica del día.'}
                        </p>
                        {!search && !filterCliente && (
                            <button
                                className="btn btn-primary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, borderRadius: 10, lineHeight: 1, boxShadow: '0 2px 10px rgba(115,93,255,0.28)' }}
                                onClick={() => openCreate()}
                            >
                                <FileText
                                        size={16}
                                        style={{
                                            height: '1em',        // fuerza a que la altura sea igual a la del texto
                                            width: 'auto',        // mantiene proporción
                                            flexShrink: 0,
                                            display: 'block'      // elimina cualquier alineación de línea base
                                        }}
                                    /> Nueva receta
                                </button>
                           )}
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead><tr><th>Cliente</th><th>Fecha</th><th>Tipo</th><th style={{ textAlign: 'center' }}>OD</th><th style={{ textAlign: 'center' }}>OI</th><th style={{ textAlign: 'center' }}>Adición</th><th style={{ textAlign: 'center' }}>Próx. control</th><th style={{ textAlign: 'center' }}>Estado</th><th style={{ textAlign: 'center' }}>Acciones</th></tr></thead>
                            <tbody>
                                {filtered.map(r => {
                                    const ts = getTipoStyle(r.tipo_lente);
                                    const cliente = clientes.find(c => c.id_cliente === r.id_cliente);
                                    return (
                                        <tr key={r.id_receta} style={{ opacity: r.activa ? 1 : 0.55 }}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#735DFF22,#C516E122)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#735DFF', flexShrink: 0 }}>{r.nombre_cliente?.slice(0,2).toUpperCase()}</div>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1136' }}>{r.nombre_cliente}</span>
                                                </div>
                                            </td>
                                            <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{r.fecha_receta?.slice(0,10)}</td>
                                            <td>{r.tipo_lente ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: ts.bg, color: ts.color }}>{r.tipo_lente}</span> : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}</td>
                                            <td style={{ textAlign: 'center' }}><GradCell esf={r.od_esfera} cil={r.od_cilindro} eje={r.od_eje} /></td>
                                            <td style={{ textAlign: 'center' }}><GradCell esf={r.oi_esfera} cil={r.oi_cilindro} eje={r.oi_eje} /></td>
                                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#475569' }}>{fmtAdicion(r)}</td>
                                            <td style={{ textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap', fontWeight: controlVencido(r) ? 700 : 400, color: controlVencido(r) ? '#EF4444' : '#64748b' }}>{r.fecha_proximo_control ? r.fecha_proximo_control.slice(0, 10) : '—'}</td>
                                            <td style={{ textAlign: 'center' }}>{r.activa ? <span className="badge badge-success" style={{ fontSize: 10 }}><CheckCircle2 size={10} /> Activa</span> : <span className="badge badge-neutral" style={{ fontSize: 10 }}>Inactiva</span>}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                                                    <button onClick={() => cliente && abrirHistorialPaciente(cliente)} title="Historial paciente" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7, cursor: 'pointer', background: 'rgba(16,185,129,0.06)', border: '1.5px solid rgba(16,185,129,0.2)', fontSize: 11, fontWeight: 600, color: '#10B981' }}><History size={12} /></button>
                                                    <button onClick={() => generarPDF(r, configEmpresa)} title="PDF" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7, cursor: 'pointer', background: 'rgba(115,93,255,0.06)', border: '1.5px solid rgba(115,93,255,0.2)', fontSize: 11, fontWeight: 700, color: '#735DFF' }}><Download size={12} /></button>
                                                    <button onClick={() => openEdit(r)} title="Editar" style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', borderRadius: 7, cursor: 'pointer', background: '#f8f7ff', border: '1.5px solid #e2e8f0', color: '#64748b' }}><Edit2 size={13} /></button>
                                                    {r.activa && <button onClick={() => setDeleteTarget({ id: r.id_receta, nombre: r.nombre_cliente })} title="Desactivar" style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', borderRadius: 7, cursor: 'pointer', background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.2)', color: '#EF4444' }}><X size={13} /></button>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showForm && (
                <FormModal
                    form={form} f={f} editing={editing} saving={saving}
                    clientes={clientes}
                    onClose={() => setShowForm(false)}
                    onSubmit={handleSubmit}
                    onClienteCreado={handleClienteCreado}
                />
            )}

            {deleteTarget && (
                <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center', padding: '36px 32px' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 14, margin: '0 auto 18px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={26} color="#F59E0B" /></div>
                        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1D1136', marginBottom: 8 }}>¿Desactivar receta?</h3>
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>Quedará inactiva pero visible en el historial.</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1D1136', background: '#f8f7ff', padding: '7px 14px', borderRadius: 8, display: 'inline-block', margin: '0 0 22px' }}>{deleteTarget.nombre}</p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                            <button className="btn" onClick={confirmDelete} style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', color: 'white' }}>Desactivar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Modal Formulario ──────────────────────────────────────────────────────
function FormModal({ form, f, editing, saving, clientes, onClose, onSubmit, onClienteCreado }) {
    const [busqCliente, setBusqCliente] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [showNuevoCliente, setShowNuevoCliente] = useState(false);
    const [nuevoCliente, setNuevoCliente] = useState({ nombre_razon_social: '', telefono: '', dni_ruc: '' });
    const [creandoCliente, setCreandoCliente] = useState(false);

    const clientesFiltrados = busqCliente.trim().length > 0
        ? clientes.filter(c => c.nombre_razon_social?.toLowerCase().includes(busqCliente.toLowerCase()))
        : clientes;

    const clienteSeleccionado = clientes.find(c => String(c.id_cliente) === String(form.id_cliente));

    const seleccionarCliente = (c) => {
        f('id_cliente')({ target: { value: String(c.id_cliente) } });
        setBusqCliente('');
        setShowDropdown(false);
        setShowNuevoCliente(false);
    };

    const handleCrearCliente = async () => {
        if (!nuevoCliente.nombre_razon_social.trim()) return;
        setCreandoCliente(true);
        try {
            const creado = await createCliente(nuevoCliente);
            onClienteCreado(creado);
            f('id_cliente')({ target: { value: String(creado.id_cliente) } });
            setShowNuevoCliente(false);
            setShowDropdown(false);
            setBusqCliente('');
            setNuevoCliente({ nombre_razon_social: '', telefono: '', dni_ruc: '' });
        } catch {
            // el padre maneja toast
        } finally {
            setCreandoCliente(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>

                {/* Header */}
                <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg,#f0fff8,#f0f7ff)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#10B981,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 0 }}><Glasses size={17} color="white" /></div>                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1D1136', margin: 0 }}>{editing ? 'Editar Receta' : 'Nueva Receta'}</h2>
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{editing ? editing.nombre_cliente : 'Ingresa la graduación del paciente'}</p>
                        </div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}><X size={15} /></button>
                </div>

                <form onSubmit={onSubmit} style={{ padding: '22px 28px', overflowY: 'auto', flex: 1 }}>

                    {/* ── Sección Paciente ── */}
                    <FormSec label="Paciente" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>

                        {/* Selector de cliente con búsqueda + creación rápida */}
                        <div style={{ position: 'relative' }}>
                            <label className="form-label">Cliente *</label>

                            {clienteSeleccionado ? (
                                /* Cliente ya seleccionado — mostrar pill */
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #10B981', background: 'rgba(16,185,129,0.06)', minHeight: 40 }}>
                                    <div style={{ width: 26, height: 26, borderRadius: 6, background: 'linear-gradient(135deg,#735DFF22,#C516E122)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#735DFF', flexShrink: 0 }}>
                                        {clienteSeleccionado.nombre_razon_social?.slice(0,2).toUpperCase()}
                                    </div>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1136', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {clienteSeleccionado.nombre_razon_social}
                                    </span>
                                    {!editing && (
                                        <button
                                            type="button"
                                            onClick={() => { f('id_cliente')({ target: { value: '' } }); setBusqCliente(''); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex', alignItems: 'center' }}
                                            title="Cambiar cliente"
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                /* Buscador */
                                <div style={{ position: 'relative' }}>
                                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', zIndex: 1 }} />
                                    <input
                                        className="form-input"
                                        placeholder="Buscar cliente…"
                                        value={busqCliente}
                                        onChange={e => { setBusqCliente(e.target.value); setShowDropdown(true); setShowNuevoCliente(false); }}
                                        onFocus={() => setShowDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
                                        style={{ paddingLeft: 32 }}
                                    />
                                    {showDropdown && busqCliente.trim().length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
                                            {clientesFiltrados.slice(0, 8).map(c => (
                                                <div
                                                    key={c.id_cliente}
                                                    onMouseDown={() => seleccionarCliente(c)}
                                                    style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#1D1136', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f7ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                                >
                                                    <div style={{ width: 24, height: 24, borderRadius: 5, background: '#f0f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#735DFF', flexShrink: 0 }}>
                                                        {c.nombre_razon_social?.slice(0,2).toUpperCase()}
                                                    </div>
                                                    {c.nombre_razon_social}
                                                </div>
                                            ))}
                                            {/* Opción crear siempre visible al pie */}
                                            <div
                                                onMouseDown={() => { setNuevoCliente(p => ({ ...p, nombre_razon_social: busqCliente })); setShowNuevoCliente(true); setShowDropdown(false); }}
                                                style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#10B981', display: 'flex', alignItems: 'center', gap: 7, borderTop: '1.5px dashed #e2e8f0', background: 'rgba(16,185,129,0.04)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.1)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.04)'}
                                            >
                                                <Plus size={13} /> Crear cliente "{busqCliente}"
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Mini-form creación rápida de cliente */}
                            {showNuevoCliente && (
                                <div style={{ marginTop: 10, padding: '14px 16px', background: '#f0fff8', border: '1.5px solid rgba(16,185,129,0.3)', borderRadius: 10 }}>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Nuevo cliente</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <input
                                            className="form-input"
                                            placeholder="Nombre completo *"
                                            value={nuevoCliente.nombre_razon_social}
                                            onChange={e => setNuevoCliente(p => ({ ...p, nombre_razon_social: e.target.value }))}
                                            style={{ fontSize: 12 }}
                                            autoFocus
                                        />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <input
                                                className="form-input"
                                                placeholder="Teléfono"
                                                value={nuevoCliente.telefono}
                                                onChange={e => setNuevoCliente(p => ({ ...p, telefono: e.target.value }))}
                                                style={{ fontSize: 12 }}
                                            />
                                            <input
                                                className="form-input"
                                                placeholder="DNI / RUC"
                                                value={nuevoCliente.dni_ruc}
                                                onChange={e => setNuevoCliente(p => ({ ...p, dni_ruc: e.target.value }))}
                                                style={{ fontSize: 12 }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNuevoCliente(false)}>Cancelar</button>
                                            <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                onClick={handleCrearCliente}
                                                disabled={creandoCliente || !nuevoCliente.nombre_razon_social.trim()}
                                            >
                                                {creandoCliente ? 'Guardando…' : 'Guardar cliente'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="form-label">Fecha de receta</label>
                            <input className="form-input" type="date" value={form.fecha_receta} onChange={f('fecha_receta')} />
                        </div>
                    </div>

                    {/* ── OD ── */}
                    <FormSec label="Ojo Derecho (OD)" color="#EF4444" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                        <GradInput label="Esfera"   value={form.od_esfera}   onChange={f('od_esfera')} />
                        <GradInput label="Cilindro" value={form.od_cilindro} onChange={f('od_cilindro')} />
                        <div><label className="form-label">Eje (°)</label><input className="form-input" type="number" min="0" max="180" step="1" value={form.od_eje} onChange={f('od_eje')} placeholder="0–180" /></div>
                    </div>

                    {/* ── OI ── */}
                    <FormSec label="Ojo Izquierdo (OI)" color="#3B82F6" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                        <GradInput label="Esfera"   value={form.oi_esfera}   onChange={f('oi_esfera')} />
                        <GradInput label="Cilindro" value={form.oi_cilindro} onChange={f('oi_cilindro')} />
                        <div><label className="form-label">Eje (°)</label><input className="form-input" type="number" min="0" max="180" step="1" value={form.oi_eje} onChange={f('oi_eje')} placeholder="0–180" /></div>
                    </div>

                    {/* ── Especificaciones ── */}
                    <FormSec label="Especificaciones" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                        <div><label className="form-label">Tipo de lente</label><select className="form-select" value={form.tipo_lente} onChange={f('tipo_lente')}><option value="">— Sin especificar —</option>{TIPOS_LENTE.map(t => <option key={t}>{t}</option>)}</select></div>
                        <div><label className="form-label">Material del lente</label><input className="form-input" value={form.material_lente} onChange={f('material_lente')} placeholder="Ej: Policarbonato" /></div>
                        <div><label className="form-label">DIP (mm)</label><input className="form-input" type="number" step="0.5" min="50" max="80" value={form.dip} onChange={f('dip')} placeholder="62.0" /></div>
                        <div><label className="form-label">Período de uso</label><input className="form-input" value={form.periodo_uso} onChange={f('periodo_uso')} placeholder="Ej: Uso permanente" /></div>
                        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                            <GradInput label="Adición OD" value={form.od_adicion} onChange={f('od_adicion')} />
                            <GradInput label="Adición OI" value={form.oi_adicion} onChange={f('oi_adicion')} />
                            <div><label className="form-label">Altura OD (mm)</label><input className="form-input" type="number" step="0.5" min="10" max="40" value={form.od_altura} onChange={f('od_altura')} placeholder="18.0" /></div>
                            <div><label className="form-label">Altura OI (mm)</label><input className="form-input" type="number" step="0.5" min="10" max="40" value={form.oi_altura} onChange={f('oi_altura')} placeholder="18.0" /></div>
                        </div>
                        <details open={!!editing} style={{ gridColumn: '1 / -1' }}>
                            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#735DFF', marginBottom: 12 }}>
                                Agudeza visual, prisma y datos clínicos (opcional)
                            </summary>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                                {['od', 'oi'].flatMap(ojo => ['sc', 'ae', 'cc'].map(tipo => (
                                    <div key={`${ojo}_av_${tipo}`}>
                                        <label className="form-label">
                                            AV {ojo.toUpperCase()} {{ sc: 'sin corrección', ae: 'con agujero estenopeico', cc: 'con lentes' }[tipo]}
                                        </label>
                                        <input className="form-input" value={form[`${ojo}_av_${tipo}`]} onChange={f(`${ojo}_av_${tipo}`)} placeholder="Ej: 20/30" />
                                    </div>
                                )))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                                <div><label className="form-label">Prisma OD</label><input className="form-input" value={form.od_prisma} onChange={f('od_prisma')} placeholder="Ej: 2Δ BI" /></div>
                                <div><label className="form-label">Prisma OI</label><input className="form-input" value={form.oi_prisma} onChange={f('oi_prisma')} placeholder="Ej: 2Δ BI" /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                                <div><label className="form-label">Diagnóstico</label><input className="form-input" value={form.diagnostico} onChange={f('diagnostico')} placeholder="Ej: Miopía" /></div>
                                <div>
                                    <label className="form-label">Código CIE-10</label>
                                    <input className="form-input" list="cie10-refractivos" value={form.codigo_cie10} onChange={f('codigo_cie10')} placeholder="Ej: H52.1" />
                                    <datalist id="cie10-refractivos">
                                        <option value="H52.0" label="Hipermetropía" />
                                        <option value="H52.1" label="Miopía" />
                                        <option value="H52.2" label="Astigmatismo" />
                                        <option value="H52.7" label="Ametropía no especificada" />
                                    </datalist>
                                </div>
                                <div><label className="form-label">Próximo control</label><input className="form-input" type="date" value={form.fecha_proximo_control} onChange={f('fecha_proximo_control')} /></div>
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label className="form-label">Indicaciones</label>
                                <textarea className="form-input" rows={2} value={form.indicaciones} onChange={f('indicaciones')} style={{ resize: 'vertical', minHeight: 60 }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                                <div><label className="form-label">Profesional</label><input className="form-input" value={form.profesional_nombre} onChange={f('profesional_nombre')} /></div>
                                <div><label className="form-label">N.º de colegiatura / registro</label><input className="form-input" value={form.profesional_registro} onChange={f('profesional_registro')} /></div>
                            </div>
                        </details>
                        <div style={{ gridColumn: '1 / -1' }}><label className="form-label">Observaciones</label><textarea className="form-input" rows={2} value={form.observaciones} onChange={f('observaciones')} placeholder="Indicaciones especiales, tratamientos, etc." style={{ resize: 'vertical', minHeight: 60 }} /></div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar receta'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Auxiliares ────────────────────────────────────────────────────────────
function GradCell({ esf, cil, eje }) {
    if (esf == null && cil == null && eje == null) return <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>;
    return (
        <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.7, color: '#334155' }}>
            <span style={{ color: '#64748b', fontSize: 10 }}>esf </span><b>{fmtGrad(esf)}</b>
            <span style={{ color: '#cbd5e1', margin: '0 3px' }}>·</span>
            <span style={{ color: '#64748b', fontSize: 10 }}>cil </span><b>{fmtGrad(cil)}</b>
            <span style={{ color: '#cbd5e1', margin: '0 3px' }}>·</span>
            <b>{fmtEje(eje)}</b>
        </div>
    );
}

function SpecMini({ label, value }) {
    return (
        <div style={{ background: '#f8f7ff', border: '1.5px solid #e2e8f0', borderRadius: 7, padding: '5px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 2px' }}>{label}</p>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#1D1136', margin: 0, fontFamily: 'monospace' }}>{value}</p>
        </div>
    );
}

function FormSec({ label, color }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, fontWeight: 700, color: color || '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, paddingBottom: 8, borderBottom: `1.5px solid ${color ? color + '22' : '#f1f5f9'}` }}>
            {color && <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />}
            {label}
        </div>
    );
}

function GradInput({ label, value, onChange }) {
    return (
        <div>
            <label className="form-label">{label}</label>
            <input className="form-input" type="number" step="0.25" value={value} onChange={onChange} placeholder="+0.00" style={{ fontFamily: 'monospace' }} />
        </div>
    );
}
