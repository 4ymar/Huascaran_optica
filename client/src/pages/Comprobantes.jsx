import { useState, useEffect } from 'react';
import { getVentas, getVenta, anularVenta, editarVenta, getCreditos, guardarArchivoLocal, emitirCPE, corregirClienteCPE, 
        getPublicConfig, updateConfig, consultarCpeSunat, consultarAnulacionCpe, emitirNotaCpe, getProductos, getClientes,
        getResumenComprobantesMes, getHistorialComprobantes } from '../services/api';
import { formatCurrency, formatDateTime, hoyLocalNegocio, fechaNegocio, condicionPago, medioPagoLabel } from '../utils/helpers';
import { useToast } from '../components/Toast';
import { FileText, Eye, Search, X, Ban, Printer, MessageCircle, RotateCw, FileCode2, Pencil, Trash2 } from 'lucide-react';
import { generateComprobantePDF } from '../utils/generateComprobantePDF';
import { generateTicketPDF } from '../utils/generateTicketPDF';
import logger from '../utils/logger';

// ── Helper: acortar nombre de cliente ─────────────────────
function nombreCorto(nombre, maxLen = 22) {
    if (!nombre) return 'Consumidor Final';
    if (nombre.length <= maxLen) return nombre;
    // Si tiene varias palabras, tomar las dos primeras
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) {
        const corto = `${partes[0]} ${partes[1]}`;
        return corto.length <= maxLen ? corto : partes[0];
    }
    return nombre.substring(0, maxLen) + '…';
}

export default function Comprobantes() {
    const toast = useToast();
    const [ventas, setVentas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [buscarTodasFechas, setBuscarTodasFechas] = useState(false);
    const [resultadosGlobales, setResultadosGlobales] = useState(null);
    const [buscandoGlobal, setBuscandoGlobal] = useState(false);

    const [fechaFiltro, setFechaFiltro] = useState(() => {
        const hoy = new Date();
        return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    });
    const [showDetalle, setShowDetalle] = useState(null);
    const [showAnular, setShowAnular] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('');
    const [showExport, setShowExport]     = useState(false);
    const [exportDesde, setExportDesde] = useState(hoyLocalNegocio());
    const [exportHasta, setExportHasta] = useState(hoyLocalNegocio());
    const [sunatActivo, setSunatActivo] = useState(false);
    const [resumenMes, setResumenMes] = useState(null);
    const [showHistorial, setShowHistorial] = useState(false);
    const [historial, setHistorial] = useState(null);
    const [loadingHistorial, setLoadingHistorial] = useState(false);
    const [anulandoId, setAnulandoId] = useState(null);
    const [showEditar, setShowEditar] = useState(null); // venta a editar
    const [editando, setEditando] = useState(false);
    const [formEditar, setFormEditar] = useState(null);
    const [buscarProductoEditar, setBuscarProductoEditar] = useState('');
    const [resultadosProductoEditar, setResultadosProductoEditar] = useState([]);
    const [buscarClienteEditar, setBuscarClienteEditar] = useState('');
    const [resultadosClienteEditar, setResultadosClienteEditar] = useState([]);
    const [showCorregir, setShowCorregir]       = useState(null); // venta a corregir
    const [corrigiendo, setCorrigiendo]         = useState(false);
    const [formCorreccion, setFormCorreccion]   = useState({
        tipo_documento: 'RUC',
        numero_documento: '',
        nombre_razon_social: '',
    });
    const [sunatModo, setSunatModo] = useState('demo');
    const [showWhatsapp, setShowWhatsapp] = useState(null); // venta seleccionada
    const [telefonoInput, setTelefonoInput] = useState('');
    const [publicConfig, setPublicConfig] = useState({});

    // Nuevos estados para notas y consulta SUNAT
    const [showNota, setShowNota] = useState(null); // Venta sobre la cual emitir nota
    const [emitirNotaLoading, setEmitirNotaLoading] = useState(false);
    const [consultandoCpeId, setConsultandoCpeId] = useState(null);
    const [formNota, setFormNota] = useState({
        tipo_nota: 'NOTA_CREDITO',
        motivo_codigo: '1',
        motivo_descripcion: ''
    });
    const [nuevaSerieNota, setNuevaSerieNota] = useState('');
    const [guardandoSerieNota, setGuardandoSerieNota] = useState(false);
    const handleExportExcel = async () => {
        if (!exportDesde || !exportHasta) { toast('Selecciona el rango de fechas', 'warning'); return; }
        if (exportDesde > exportHasta) { toast('La fecha inicial no puede ser mayor a la final', 'warning'); return; }

        const data = ventas.filter(v => {
            const fecha = fechaNegocio(v.fecha_hora);
            return fecha >= exportDesde && fecha <= exportHasta && v.estado === 'ACTIVA';
        });

        if (!data.length) { toast('No hay ventas ACTIVAS en ese rango de fechas', 'warning'); return; }

        const tipoDoc  = { DNI: '1', RUC: '6', PASAPORTE: '7', CE: '4' };
        const tipoComp = { BOLETA: '03', FACTURA: '01' };

        const ExcelJS   = (await import('exceljs')).default;
        const desde     = exportDesde.replace(/-/g, '');
        const hasta     = exportHasta.replace(/-/g, '');
        const suggestedName = `RVI_Ventas_${desde}_${hasta}.xlsx`;

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Sistema HUASCARAN';
        wb.created = new Date();

        const headerFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF735DFF' } };
        const headerFont  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        const headerAlign = { vertical: 'middle', horizontal: 'center' };
        const bodyFont    = { size: 10, name: 'Calibri', color: { argb: 'FF1E293B' } };
        const thinBorder  = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

        const estilizarHeader = (row) => {
            row.height = 22;
            row.eachCell(cell => {
                cell.fill = headerFill; cell.font = headerFont;
                cell.alignment = headerAlign;
                cell.border = { bottom: { style: 'medium', color: { argb: 'FF5A45D6' } } };
            });
        };

        const estilizarFila = (row, idx) => {
            row.height = 18;
            const esPar = idx % 2 === 0;
            row.eachCell({ includeEmpty: true }, cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: esPar ? 'FFFFFFFF' : 'FFF8F7FF' } };
                cell.font = bodyFont; cell.alignment = { vertical: 'middle' }; cell.border = thinBorder;
                if (typeof cell.value === 'number') {
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    if (!Number.isInteger(cell.value)) cell.numFmt = '#,##0.00';
                }
            });
        };

        const ws1 = wb.addWorksheet('Registro de Ventas', { views: [{ state: 'frozen', ySplit: 1 }] });
        const cols1 = [
            { header: 'Período',            key: 'periodo',   width: 10 },
            { header: 'Fecha Emisión',       key: 'fecha',     width: 14 },
            { header: 'Hora',               key: 'hora',      width: 10 },
            { header: 'Cód. Comprobante',   key: 'cod_comp',  width: 16 },
            { header: 'Tipo Comprobante',   key: 'tipo_comp', width: 16 },
            { header: 'Serie',              key: 'serie',     width: 10 },
            { header: 'Número',             key: 'numero',    width: 14 },
            { header: 'N° Venta (interno)', key: 'num_venta', width: 18 },
            { header: 'Cód. Doc. Cliente',  key: 'cod_doc',   width: 16 },
            { header: 'Tipo Doc. Cliente',  key: 'tipo_doc',  width: 16 },
            { header: 'N° Doc. Cliente',    key: 'num_doc',   width: 16 },
            { header: 'Cliente',            key: 'cliente',   width: 30 },
            { header: 'Condición Pago',     key: 'condicion', width: 14 },
            { header: 'Medio Pago',         key: 'medio',     width: 22 },
            { header: 'Op. Gravada (S/)',   key: 'gravada',   width: 16 },
            { header: 'IGV 18% (S/)',       key: 'igv',       width: 14 },
            { header: 'Descuento (S/)',     key: 'descuento', width: 14 },
            { header: 'Total (S/)',         key: 'total',     width: 14 },
            { header: 'Estado',             key: 'estado',    width: 12 },
            { header: 'Usuario',            key: 'usuario',   width: 14 },
        ];
        ws1.columns = cols1;
        estilizarHeader(ws1.getRow(1));

        data.forEach((r, idx) => {
            const row = ws1.addRow({
                periodo:   fechaNegocio(r.fecha_hora).replace(/-/g, '').slice(0, 6),
                fecha:     new Date(r.fecha_hora).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }),
                hora:      new Date(r.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }),
                cod_comp:  tipoComp[r.tipo_comprobante] || r.tipo_comprobante || '',
                tipo_comp: r.tipo_comprobante || '',
                serie:     (r.numero_comprobante || '').split('-')[0] || '',
                numero:    (r.numero_comprobante || '').split('-')[1] || '',
                num_venta: r.numero_venta || '',
                cod_doc:   tipoDoc[r.cliente?.tipo_documento] || '',
                tipo_doc:  r.cliente?.tipo_documento || '',
                num_doc:   r.cliente?.numero_documento || '',
                cliente:   r.cliente?.nombre_razon_social || 'CONSUMIDOR FINAL',
                condicion: condicionPago(r.forma_pago),
                medio:     medioPagoLabel(r.forma_pago, r.monto_efectivo, r.monto_yape_plin),
                gravada:   isNaN(Number(r.subtotal))  ? 0 : Number(r.subtotal),
                igv:       isNaN(Number(r.igv))       ? 0 : Number(r.igv),
                descuento: isNaN(Number(r.descuento)) ? 0 : Number(r.descuento || 0),
                total:     isNaN(Number(r.total))     ? 0 : Number(r.total),
                estado:    r.estado || '',
                usuario:   r.usuario || '',
            });
            estilizarFila(row, idx);
        });

        const ws2 = wb.addWorksheet('Detalle de Productos', { views: [{ state: 'frozen', ySplit: 1 }] });
        const cols2 = [
            { header: 'Fecha',             key: 'fecha',       width: 14 },
            { header: 'Comprobante',       key: 'comprobante', width: 18 },
            { header: 'N° Venta',          key: 'num_venta',   width: 18 },
            { header: 'Cliente',           key: 'cliente',     width: 30 },
            { header: 'Producto',          key: 'producto',    width: 40 },
            { header: 'Cantidad',          key: 'cantidad',    width: 10 },
            { header: 'Precio Unit. (S/)', key: 'precio',      width: 16 },
            { header: 'Descuento (S/)',    key: 'descuento',   width: 14 },
            { header: 'Subtotal (S/)',     key: 'subtotal',    width: 14 },
        ];
        ws2.columns = cols2;
        estilizarHeader(ws2.getRow(1));

        let filaIdx = 0;
        data.forEach(r => {
            const detalles = r.detalles || [];
            if (detalles.length === 0) {
                const row = ws2.addRow({
                    fecha: new Date(r.fecha_hora).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }),
                    comprobante: r.numero_comprobante || '', num_venta: r.numero_venta || '',
                    cliente: r.cliente?.nombre_razon_social || 'CONSUMIDOR FINAL',
                    producto: '(sin detalle)', cantidad: '', precio: '', descuento: '', subtotal: '',
                });
                estilizarFila(row, filaIdx++);
            } else {
                detalles.forEach(d => {
                    const row = ws2.addRow({
                        fecha: new Date(r.fecha_hora).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' }),
                        comprobante: r.numero_comprobante || '', num_venta: r.numero_venta || '',
                        cliente: r.cliente?.nombre_razon_social || 'CONSUMIDOR FINAL',
                        producto: d.nombre_producto || '',
                        cantidad: Number(d.cantidad) || 0,
                        precio:   isNaN(Number(d.precio_unitario)) ? 0 : Number(d.precio_unitario),
                        descuento: isNaN(Number(d.descuento_linea)) ? 0 : Number(d.descuento_linea || 0),
                        subtotal: isNaN(Number(d.subtotal_linea)) ? 0 : Number(d.subtotal_linea),
                    });
                    estilizarFila(row, filaIdx++);
                });
            }
        });

        try {
            const headers = cols1.map(c => c.header);
            const csvRows = data.map(r => cols1.map(c => `"${String(ws1.getRow(data.indexOf(r) + 2).getCell(c.key)?.value ?? '').replace(/"/g, '""')}"`).join(','));
            const csv = [headers.join(','), ...csvRows].join('\n');
            await guardarArchivoLocal({ modulo: 'registro_ventas', filename: `RVI_${desde}_${hasta}.csv`, content: csv, isBase64: false });
        } catch (e) { logger.error('COMPROBANTES', 'Error al guardar CSV local:', e); }

        if (window.electronAPI?.saveExcel) {
            try {
                const buffer = await wb.xlsx.writeBuffer();
                const base64 = btoa(new Uint8Array(buffer).reduce((acc, byte) => acc + String.fromCharCode(byte), ''));
                const result = await window.electronAPI.saveExcel({ buffer: base64, suggestedName });
                if (result.canceled) return;
                if (!result.ok) toast('Error al guardar el archivo', 'error');
                else toast('Excel exportado correctamente', 'success');
            } catch (err) {
                logger.error('COMPROBANTES', 'Error al exportar Excel:', err);
                toast('Error al exportar Excel', 'error');
            }
        }
        setShowExport(false);
    };

    useEffect(() => {
        getVentas().then(setVentas).finally(() => setLoading(false));
        getPublicConfig().then(cfg => {
            setSunatActivo(cfg?.sunat_activo === '1');
            setSunatModo(cfg?.sunat_modo || 'demo');
            setPublicConfig(cfg || {});
        });
        getResumenComprobantesMes().then(setResumenMes).catch(() => setResumenMes(null));
    }, []);

    // ── Historial de comprobantes (últimos 12 meses) ───────────
    const NOMBRE_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
    const formatMes = (clave) => {
        const [y, m] = clave.split('-');
        return `${NOMBRE_MES[parseInt(m, 10) - 1]} ${y}`;
    };
    const contarTipo = (m, tipo, estado) => m.tipos?.[tipo]?.[estado] || 0;
    const contarEstado = (m, estado) =>
        Object.values(m.tipos || {}).reduce((acc, e) => acc + (e[estado] || 0), 0);

    const abrirHistorial = () => {
        setShowHistorial(true);
        if (historial) return;           // ya cargado, no repetir la llamada
        setLoadingHistorial(true);
        getHistorialComprobantes()
            .then(d => setHistorial(d.meses || []))
            .catch(() => setHistorial([]))
            .finally(() => setLoadingHistorial(false));
    };

    // ── Búsqueda global (todas las fechas) con debounce ────────
    useEffect(() => {
        if (!buscarTodasFechas || !search.trim()) {
            setResultadosGlobales(null);
            setBuscandoGlobal(false);
            return;
        }
        setBuscandoGlobal(true);
        const timer = setTimeout(() => {
            getVentas({ search: search.trim(), limit: 200 })
                .then(setResultadosGlobales)
                .catch(() => setResultadosGlobales([]))
                .finally(() => setBuscandoGlobal(false));
        }, 400);
        return () => clearTimeout(timer);
    }, [search, buscarTodasFechas]);

    const filtered = (buscarTodasFechas && search.trim())
        ? (resultadosGlobales || [])
        : ventas.filter(v => {
            const ventaFecha = v.fecha_hora ? new Date(new Date(v.fecha_hora).getTime() + (-300 * 60 * 1000)).toISOString().slice(0, 10) : '';
            const matchFecha  = !fechaFiltro || ventaFecha === fechaFiltro;
            const matchSearch = !search ||
                v.numero_venta.toLowerCase().includes(search.toLowerCase()) ||
                (v.numero_comprobante || '').toLowerCase().includes(search.toLowerCase()) ||
                (v.cliente_nombre || '').toLowerCase().includes(search.toLowerCase());
            return matchFecha && matchSearch;
        });

    const viewDetalle = async (v) => {
        const data = await getVenta(v.id_venta);
        setShowDetalle(data);
    };

    const handleAnular = async () => {
        setAnulandoId(showAnular.id_venta);
        try {
            const result = await anularVenta(showAnular.id_venta, motivoAnulacion);
            if (result?.baja_cpe?.ok) {
                toast('Venta anulada y comunicación de baja enviada a SUNAT correctamente', 'success');
            } else if (result?.baja_cpe) {
                toast('Venta anulada. Usa el botón "Emitir Nota" en esta fila para generar la Nota de Crédito.', 'warning');
            } else {
                toast('Venta anulada correctamente', 'success');
            }
            setShowAnular(null);
            setMotivoAnulacion('');
            getVentas().then(setVentas);
        } catch (err) {
            toast(err.response?.data?.error || 'Error', 'error');
        } finally {
            setAnulandoId(null);
        }
    };

    // ── Editar venta ──────────────────────────────────────────
    const puedeEditar = (v) => {
        if (v.estado !== 'ACTIVA') return false;
        if (v.cpe_estado === 'ACEPTADO') return false;
        if ((v.veces_editada || 0) >= 3) return false;
        const hoy = new Date();
        const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
        return fechaNegocio(v.fecha_hora) === hoyStr;
    };

    const abrirEditar = async (v) => {
        const data = await getVenta(v.id_venta);
        setFormEditar({
            id_cliente:        data.id_cliente || null,
            cliente_nombre:    data.cliente?.nombre_razon_social || 'Consumidor Final',
            forma_pago:        data.forma_pago,
            monto_efectivo:    data.monto_efectivo || 0,
            monto_yape_plin:   data.monto_yape_plin || 0,
            fecha_vencimiento: data.credito?.fecha_vencimiento || '',
            notas_credito:     '',
            motivo:            '',
            items: (data.detalles || []).map(d => ({
                id_producto:     d.id_producto,
                nombre_producto: d.nombre_producto,
                cantidad:        d.cantidad,
                precio_unitario: d.precio_unitario,
                descuento_linea: d.descuento_linea || 0,
            })),
        });
        setShowEditar(v);
        setBuscarProductoEditar('');
        setResultadosProductoEditar([]);
        setBuscarClienteEditar('');
        setResultadosClienteEditar([]);
    };

    const totalEditar = (formEditar?.items || []).reduce(
        (sum, it) => sum + (it.precio_unitario * it.cantidad - (it.descuento_linea || 0)), 0
    );

    const cambiarCantidadItem = (idx, cantidad) => {
        setFormEditar(prev => {
            const items = [...prev.items];
            items[idx] = { ...items[idx], cantidad: Math.max(0.01, Number(cantidad) || 0) };
            return { ...prev, items };
        });
    };

    const quitarItem = (idx) => {
        setFormEditar(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
    };

    const agregarProductoEditar = (prod) => {
        setFormEditar(prev => {
            const existente = prev.items.findIndex(it => it.id_producto === prod.id_producto);
            if (existente >= 0) {
                const items = [...prev.items];
                items[existente] = { ...items[existente], cantidad: items[existente].cantidad + 1 };
                return { ...prev, items };
            }
            return {
                ...prev,
                items: [...prev.items, {
                    id_producto: prod.id_producto,
                    nombre_producto: prod.nombre,
                    cantidad: 1,
                    precio_unitario: prod.precio_venta,
                    descuento_linea: 0,
                }],
            };
        });
        setBuscarProductoEditar('');
        setResultadosProductoEditar([]);
    };

    useEffect(() => {
        if (!buscarProductoEditar.trim()) { setResultadosProductoEditar([]); return; }
        const timer = setTimeout(() => {
            getProductos({ search: buscarProductoEditar.trim() }).then(setResultadosProductoEditar).catch(() => setResultadosProductoEditar([]));
        }, 300);
        return () => clearTimeout(timer);
    }, [buscarProductoEditar]);

    useEffect(() => {
        if (!buscarClienteEditar.trim()) { setResultadosClienteEditar([]); return; }
        const timer = setTimeout(() => {
            getClientes({ search: buscarClienteEditar.trim() }).then(setResultadosClienteEditar).catch(() => setResultadosClienteEditar([]));
        }, 300);
        return () => clearTimeout(timer);
    }, [buscarClienteEditar]);

    const handleGuardarEdicion = async () => {
        if (!formEditar.motivo.trim()) { toast('El motivo de la edición es obligatorio', 'warning'); return; }
        if (formEditar.items.length === 0) { toast('La venta debe tener al menos un producto', 'warning'); return; }
        if (formEditar.forma_pago === 'CREDITO' && !formEditar.id_cliente) { toast('Se requiere un cliente para venta al fiado', 'warning'); return; }

        setEditando(true);
        try {
            await editarVenta(showEditar.id_venta, {
                motivo:            formEditar.motivo.trim(),
                id_cliente:        formEditar.id_cliente,
                forma_pago:        formEditar.forma_pago,
                monto_efectivo:    formEditar.monto_efectivo,
                monto_yape_plin:   formEditar.monto_yape_plin,
                fecha_vencimiento: formEditar.fecha_vencimiento || null,
                notas_credito:     formEditar.notas_credito || '',
                items: formEditar.items.map(it => ({
                    id_producto:     it.id_producto,
                    cantidad:        it.cantidad,
                    descuento_linea: it.descuento_linea || 0,
                })),
            });
            toast('Venta editada correctamente', 'success');
            setShowEditar(null);
            setFormEditar(null);
            getVentas().then(setVentas);
        } catch (err) {
            toast(err.response?.data?.error || 'Error al editar la venta', 'error');
        } finally {
            setEditando(false);
        }
    };

    // ── Columnas totales para colSpan del mensaje vacío ───────
    const colSpanTotal = 6 + (sunatActivo ? 1 : 0);

    // ── WhatsApp ───────────────────────────────────────────────
    const handleEnviarWhatsapp = (venta, telefonoOverride) => {
        const telefono = telefonoOverride || venta.cliente?.telefono || '';
        const telefonoLimpio = telefono.replace(/\D/g, '');
        if (!telefonoLimpio || telefonoLimpio.length < 9) {
            setShowWhatsapp(venta);
            setTelefonoInput('');
            return;
        }
        const numero = `51${telefonoLimpio.slice(-9)}`;
        const nombreNegocio = publicConfig?.empresa_nombre_corto || publicConfig?.empresa_nombre || 'la tienda';
        const nombreCliente = venta.cliente?.nombre_razon_social || 'cliente';
        const offsetMs = -5 * 60 * 60 * 1000;
        const fechaLocal = new Date(new Date(venta.fecha_hora).getTime() + offsetMs);
        const fecha = fechaLocal.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const comprobante = venta.numero_comprobante || venta.numero_venta;

        let mensaje = `Estimado/a ${nombreCliente},\n\nLe enviamos su comprobante de ${nombreNegocio}:\n\n🧾 ${comprobante}\n📅 ${fecha}\n💰 Total: S/ ${Number(venta.total).toFixed(2)}`;
        if (venta.cpe_enlace_pdf) {
            mensaje += `\n\n📄 Ver comprobante electrónico:\n${venta.cpe_enlace_pdf}`;
        }
        mensaje += `\n\nGracias por su preferencia 🙏`;

        const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
        if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
        else window.open(url, '_blank');
        setShowWhatsapp(null);
    };

    return (

        <div className="page-enter">
            <div className="page-header">
                <div>
                    <h1>🧾 Comprobantes</h1>
                    <p>Historial de ventas y emisión de comprobantes</p>
                    {sunatActivo && (
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            borderRadius: 20,
                            padding: '3px 10px',
                            marginTop: 4,
                            ...(sunatModo === 'produccion'
                                ? { color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d' }
                                : { color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe' })
                        }}>
                            <span style={{
                                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                background: sunatModo === 'produccion' ? '#f59e0b' : '#3b82f6'
                            }} />
                            {sunatModo === 'produccion' ? 'PRODUCCIÓN — comprobantes reales ante SUNAT' : 'DEMO — comprobantes de prueba'}
                        </span>
                    )}
                </div>
                <button className="btn btn-secondary" onClick={() => setShowExport(true)}>
                    📊 Exportar Excel
                </button>
            </div>

            {/* Widget Facturación Electrónica SUNAT / NubeFact — movido desde Dashboard */}
            {sunatActivo && resumenMes && (
                <div className="card mb-6" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div style={{ background: '#8b5cf6', color: 'white', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={20} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#5b21b6' }}>
                                    Facturación Electrónica SUNAT (NubeFact)
                                </h4>
                                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>
                                    {resumenMes.emitidosMes} comprobantes emitidos este mes
                                    {resumenMes.pendientes > 0 && <span style={{ color: '#78350f', fontWeight: 700, marginLeft: 8 }}>⏳ {resumenMes.pendientes} pendientes hoy</span>}
                                    {resumenMes.rechazados > 0 && <span style={{ color: '#7f1d1d', fontWeight: 700, marginLeft: 8 }}>❌ {resumenMes.rechazados} rechazados hoy</span>}
                                    {resumenMes.pendientes === 0 && resumenMes.rechazados === 0 && <span style={{ color: '#065f46', fontWeight: 600, marginLeft: 8 }}>✓ Todo al día hoy</span>}
                                </p>
                            </div>
                        </div>
                        <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 12, background: 'white', display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={abrirHistorial}
                        >
                            <Eye size={16} /> Historial
                        </button>
                    </div>
                </div>
            )}

            {/* ── Filtros ──────────────────────────────────────────── */}
            <div className="card mb-6">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="search-bar flex-1 min-w-48">
                        <Search size={16} className="search-icon" />
                        <input
                            className="form-input"
                            placeholder="Buscar por N° venta, comprobante o cliente..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {buscandoGlobal && <span className="text-xs text-slate-400" style={{ marginLeft: 8 }}>Buscando...</span>}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap" style={{ cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={buscarTodasFechas}
                            onChange={e => setBuscarTodasFechas(e.target.checked)}
                        />
                        Buscar en todas las fechas
                    </label>
                    <div className="flex items-center gap-2" style={{ opacity: (buscarTodasFechas && search.trim()) ? 0.5 : 1 }}>
                        <label className="text-sm text-slate-500 whitespace-nowrap">📅 Fecha:</label>
                        <input
                            type="date"
                            className="form-input"
                            value={fechaFiltro}
                            onChange={e => setFechaFiltro(e.target.value)}
                            disabled={buscarTodasFechas && !!search.trim()}
                            style={{ width: 'auto' }}
                        />
                        {(() => {
                            const h = new Date();
                            const hoyLocal = `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
                            return fechaFiltro !== hoyLocal;
                        })() && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => { const h = new Date(); setFechaFiltro(`${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`); }}
                                title="Volver a hoy"
                            >
                                Hoy
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Tabla compacta ───────────────────────────────────── */}
            <div className="card overflow-auto">
                {loading ? <div className="loader"><div className="spinner"></div></div> : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Comprobante</th>
                                <th>Fecha</th>
                                <th>Cliente</th>
                                <th>Total</th>
                                <th>Estado</th>
                                {sunatActivo && <th>CPE</th>}
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(v => (
                                <tr key={v.id_venta} className={v.estado === 'ANULADA' ? 'opacity-50' : ''}>

                                    {/* Comprobante — tipo + número fusionados */}
                                    <td>
                                        <span className={`badge ${v.tipo_comprobante === 'FACTURA' ? 'badge-info' : 'badge-neutral'}`} style={{ fontSize: 10, marginRight: 4 }}>
                                            {v.tipo_comprobante === 'FACTURA' ? 'F' : 'B'}
                                        </span>
                                        <span className="font-mono text-xs font-semibold text-purple-600">
                                            {v.numero_comprobante || v.numero_venta}
                                        </span>
                                    </td>

                                    {/* Fecha */}
                                    <td className="text-sm whitespace-nowrap">{formatDateTime(v.fecha_hora)}</td>

                                    {/* Cliente — nombre corto con tooltip */}
                                    <td
                                        className="text-sm"
                                        title={v.cliente_nombre || 'Consumidor Final'}
                                        style={{ maxWidth: 160 }}
                                    >
                                        {nombreCorto(v.cliente_nombre)}
                                    </td>

                                    {/* Total */}
                                    <td className="font-bold text-right">{formatCurrency(v.total)}</td>

                                    {/* Estado */}
                                    <td>
                                        <span className={`badge ${v.estado === 'ACTIVA' ? 'badge-success' : 'badge-danger'}`}>
                                            {v.estado}
                                        </span>
                                    </td>

                                    {/* CPE — solo si SUNAT activo */}
                                    {sunatActivo && (
                                        <td>
                                            {v.cpe_estado === 'ACEPTADO' ? (
                                                <div className="flex items-center gap-1">
                                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#065f46', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 20, padding: '2px 8px' }}>✓ CPE</span>
                                                    {v.cpe_enlace_pdf && (
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            style={{ fontSize: 10, padding: '2px 6px' }}
                                                            title="Ver PDF oficial NubeFact"
                                                            onClick={() => {
                                                                if (window.electronAPI?.openExternal) window.electronAPI.openExternal(v.cpe_enlace_pdf);
                                                                else window.open(v.cpe_enlace_pdf, '_blank');
                                                            }}
                                                        >
                                                            🔗
                                                        </button>
                                                    )}
                                                </div>
                                            ) : v.cpe_estado === 'ANULADO' ? (
                                                <span style={{ fontSize: 10, fontWeight: 600, color: '#7f1d1d', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 20, padding: '2px 8px' }}>
                                                    ✕ Anulado
                                                </span>
                                            ) : v.cpe_estado === 'BAJA_ENVIADA' ? (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ fontSize: 11, padding: '2px 8px', color: '#92400e', borderColor: '#fcd34d', background: '#fef3c7' }}
                                                    title="Baja enviada a NubeFact — clic para confirmar con SUNAT"
                                                    disabled={consultandoCpeId === v.id_venta}
                                                    onClick={async () => {
                                                        setConsultandoCpeId(v.id_venta);
                                                        try {
                                                            const res = await consultarAnulacionCpe(v.id_venta);
                                                            if (res.cpe_estado === 'ANULADO') {
                                                                toast('SUNAT confirmó la anulación', 'success');
                                                            } else if (res.cpe_estado === 'NOTA_CREDITO_REQUERIDA') {
                                                                toast('SUNAT no aceptó la baja. Usa "Emitir Nota" para generar la Nota de Crédito.', 'warning');
                                                            } else {
                                                                toast('SUNAT aún no confirma la baja. Intenta de nuevo en unos minutos.', 'warning');
                                                            }
                                                            getVentas().then(setVentas);
                                                        } catch (err) {
                                                            toast(err.response?.data?.error || 'No se pudo verificar la baja en SUNAT', 'error');
                                                        } finally {
                                                            setConsultandoCpeId(null);
                                                        }
                                                    }}
                                                >
                                                    ⏳ Confirmar baja
                                                </button>
                                            ) : v.cpe_estado === 'BAJA_PENDIENTE' ? (
                                                <span style={{ fontSize: 10, fontWeight: 600, color: '#78350f', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 20, padding: '2px 8px' }}>
                                                    ⚠ Baja pendiente
                                                </span>
                                            ) : v.cpe_estado === 'PENDIENTE' ? (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ fontSize: 11, padding: '2px 8px', color: '#92400e', borderColor: '#fcd34d' }}
                                                    title="Timeout anterior — reintentar emisión"
                                                    onClick={async () => {
                                                        try {
                                                            await emitirCPE(v.id_venta);
                                                            toast('Comprobante emitido correctamente', 'success');
                                                            getVentas().then(setVentas);
                                                        } catch (err) {
                                                            toast(err.response?.data?.error || 'Error al emitir CPE', 'error');
                                                        }
                                                    }}
                                                >
                                                    ⏳ Reintentar
                                                </button>
                                            ) : v.cpe_estado === 'RECHAZADO' ? (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ fontSize: 11, padding: '2px 8px', color: '#7f1d1d', borderColor: '#fca5a5', background: '#fee2e2' }}
                                                    title="Corregir datos del cliente y reemitir"
                                                    onClick={async () => {
                                                        const data = await getVenta(v.id_venta);
                                                        setFormCorreccion({
                                                            tipo_documento:      data.cliente?.tipo_documento      || 'RUC',
                                                            numero_documento:    data.cliente?.numero_documento    || '',
                                                            nombre_razon_social: data.cliente?.nombre_razon_social || '',
                                                        });
                                                        setShowCorregir(v);
                                                    }}
                                                >
                                                    ✎ Corregir
                                                </button>
                                            ) : v.cpe_estado === 'NOTA_CREDITO_REQUERIDA' ? (
                                                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b21a8', background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: 20, padding: '2px 8px' }}>
                                                    ⚠ Requiere N.C.
                                                </span>
                                            ) : v.cpe_estado === 'NOTA_CREDITO_REGISTRADA' ? (
                                                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b21a8', background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: 20, padding: '2px 8px' }}>
                                                    ✓ N.C. Registrada
                                                </span>
                                            ) : v.cpe_estado === 'ENVIADO_PENDIENTE_SUNAT' ? (
                                                <div className="flex items-center gap-1">
                                                    <span style={{ fontSize: 10, fontWeight: 600, color: '#0369a1', background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: 20, padding: '2px 8px' }}>
                                                        ⏳ Pendiente SUNAT
                                                    </span>
                                                    {v.cpe_enlace_pdf && (
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            style={{ fontSize: 10, padding: '2px 6px' }}
                                                            title="Ver PDF oficial NubeFact"
                                                            onClick={() => {
                                                                if (window.electronAPI?.openExternal) window.electronAPI.openExternal(v.cpe_enlace_pdf);
                                                                else window.open(v.cpe_enlace_pdf, '_blank');
                                                            }}
                                                        >
                                                            🔗
                                                        </button>
                                                    )}
                                                </div>
                                            ) : v.estado === 'ACTIVA' ? (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ fontSize: 11, padding: '2px 8px' }}
                                                    onClick={async () => {
                                                        try {
                                                            await emitirCPE(v.id_venta);
                                                            toast('Comprobante electrónico emitido correctamente', 'success');
                                                            getVentas().then(setVentas);
                                                            getResumenComprobantesMes().then(setResumenMes).catch(() => setResumenMes(null));
                                                        } catch (err) {
                                                            toast(err.response?.data?.error || 'Error al emitir CPE', 'error');
                                                        }
                                                    }}
                                                >
                                                    Emitir CPE
                                                </button>
                                            ) : (
                                                <span style={{ fontSize: 10, color: '#94a3b8' }}>—</span>
                                            )}
                                        </td>
                                    )}

                                    {/* Acciones */}
                                    <td>
                                        <div className="flex gap-1 items-center">
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => viewDetalle(v)}
                                                title="Ver detalle"
                                            >
                                                <Eye size={14} />
                                            </button>
                                            {sunatActivo && v.cpe_estado && !['ANULADO', 'BAJA_ENVIADA', 'NOTA_CREDITO_REQUERIDA', 'NOTA_CREDITO_REGISTRADA'].includes(v.cpe_estado) && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    title="Consultar SUNAT (Actualizar)"
                                                    disabled={consultandoCpeId === v.id_venta}
                                                    onClick={async () => {
                                                        setConsultandoCpeId(v.id_venta);
                                                        try {
                                                            const res = await consultarCpeSunat(v.id_venta);
                                                            if (res.exito) {
                                                                if (res.aceptada_por_sunat) {
                                                                    toast('Estado sincronizado con SUNAT: ACEPTADO', 'success');
                                                                } else {
                                                                    toast(res.sunat_description || 'Comprobante aún pendiente de aceptación en SUNAT', 'info');
                                                                }
                                                            }
                                                            getVentas().then(setVentas);
                                                            getResumenComprobantesMes().then(setResumenMes).catch(() => setResumenMes(null));
                                                        } catch (err) {
                                                            toast(err.response?.data?.error || 'No se pudo verificar el estado en SUNAT', 'error');
                                                        } finally {
                                                            setConsultandoCpeId(null);
                                                        }
                                                    }}
                                                >
                                                    <RotateCw size={14} className={consultandoCpeId === v.id_venta ? 'animate-spin' : ''} />
                                                </button>
                                            )}
                                            {sunatActivo && v.estado === 'ANULADA' && v.cpe_estado === 'NOTA_CREDITO_REQUERIDA' && (
                                                <button
                                                    className="btn btn-secondary btn-sm text-purple-600 border-purple-300 hover:bg-purple-50"
                                                    title="Emitir Nota de Crédito/Débito"
                                                    onClick={() => {
                                                        const motivoPrevio = (v.notas || '').replace(/^ANULADO:\s*/, '');
                                                        setFormNota({
                                                            tipo_nota: 'NOTA_CREDITO',
                                                            motivo_codigo: '1',
                                                            motivo_descripcion: motivoPrevio
                                                        });
                                                        setShowNota(v);
                                                    }}
                                                >
                                                    <FileCode2 size={14} />
                                                </button>
                                            )}
                                            {sunatActivo && v.nota_credito_enlace_pdf && (
                                                <button
                                                    className="btn btn-secondary btn-sm text-purple-600 border-purple-300 hover:bg-purple-50"
                                                    title="Ver PDF de la Nota de Crédito"
                                                    onClick={() => {
                                                        if (window.electronAPI?.openExternal) window.electronAPI.openExternal(v.nota_credito_enlace_pdf);
                                                        else window.open(v.nota_credito_enlace_pdf, '_blank');
                                                    }}
                                                >
                                                    🔗
                                                </button>
                                            )}
                                            {v.estado === 'ACTIVA' && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    title="Enviar por WhatsApp"
                                                    style={{ color: '#25D366' }}
                                                    onClick={async () => {
                                                        const data = await getVenta(v.id_venta);
                                                        handleEnviarWhatsapp({ ...v, cliente: data.cliente, cpe_enlace_pdf: data.cpe_enlace_pdf });
                                                    }}
                                                >
                                                    <MessageCircle size={14} />
                                                </button>
                                            )}
                                            {puedeEditar(v) && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => abrirEditar(v)}
                                                    title="Editar venta"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}
                                            {v.estado === 'ACTIVA' && (
                                                <button
                                                    className="btn btn-secondary btn-sm text-red-600 border-red-300 hover:bg-red-50"
                                                    onClick={() => {
                                                        setMotivoAnulacion('');
                                                        setShowAnular(v);
                                                    }}
                                                    title="Anular venta"
                                                >
                                                    <Ban size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={colSpanTotal} className="text-center py-8 text-slate-400">
                                        No hay comprobantes {fechaFiltro ? `para el ${new Date(fechaFiltro + 'T00:00:00').toLocaleDateString('es-PE')}` : ''}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Modal Detalle ────────────────────────────────────── */}
            {showDetalle && (
                <div className="modal-overlay" onClick={() => setShowDetalle(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                        <div className="modal-header">
                            <div>
                                <h2>📋 {showDetalle.numero_venta}</h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{showDetalle.numero_comprobante}</p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowDetalle(null)}><X size={18} /></button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <span className="text-xs text-slate-400">Tipo</span>
                                <p className="font-medium">{showDetalle.tipo_comprobante}</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400">Fecha</span>
                                <p className="font-medium">{formatDateTime(showDetalle.fecha_hora)}</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400">Cliente</span>
                                <p className="font-medium">{showDetalle.cliente?.nombre_razon_social || 'Consumidor Final'}</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400">Condición de Pago</span>
                                <p className="font-medium">{condicionPago(showDetalle.forma_pago)}</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400">Medio de Pago</span>
                                <p className="font-medium">{medioPagoLabel(showDetalle.forma_pago, showDetalle.monto_efectivo, showDetalle.monto_yape_plin)}</p>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400">Estado</span>
                                <p className="font-medium">
                                    <span className={`badge ${showDetalle.estado === 'ACTIVA' ? 'badge-success' : 'badge-danger'}`}>
                                        {showDetalle.estado}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <table className="data-table mb-4">
                            <thead>
                                <tr><th>Producto</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th></tr>
                            </thead>
                            <tbody>
                                {showDetalle.detalles?.map(d => (
                                    <tr key={d.id_detalle}>
                                        <td className="text-sm">{d.nombre_producto}</td>
                                        <td>{d.cantidad}</td>
                                        <td>{formatCurrency(d.precio_unitario)}</td>
                                        <td className="font-bold">{formatCurrency(d.subtotal_linea)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="p-4 rounded-xl bg-purple-50 space-y-1">
                            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatCurrency(showDetalle.subtotal)}</span></div>
                            <div className="flex justify-between text-sm"><span>IGV (18%)</span><span>{formatCurrency(showDetalle.igv)}</span></div>
                            <div className="flex justify-between text-lg font-bold pt-2 border-t border-purple-200"><span>TOTAL</span><span>{formatCurrency(showDetalle.total)}</span></div>
                        </div>

                        {/* Banner CPE */}
                        {showDetalle.cpe_estado === 'ACEPTADO' && showDetalle.cpe_enlace_pdf && (
                            <div className="mt-3 p-3 rounded-lg flex items-center justify-between gap-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>✓ Comprobante electrónico emitido</span>
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: 12, color: '#065f46', borderColor: '#6ee7b7' }}
                                    onClick={() => {
                                        if (window.electronAPI?.openExternal) window.electronAPI.openExternal(showDetalle.cpe_enlace_pdf);
                                        else window.open(showDetalle.cpe_enlace_pdf, '_blank');
                                    }}
                                >
                                    Ver PDF oficial SUNAT
                                </button>
                            </div>
                        )}
                        {showDetalle.nota_credito_enlace_pdf && (
                            <div className="mt-3 p-3 rounded-lg flex items-center justify-between gap-3" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6' }}>📄 Nota de Crédito emitida</span>
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: 12, color: '#5b21b6', borderColor: '#ddd6fe' }}
                                    onClick={() => {
                                        if (window.electronAPI?.openExternal) window.electronAPI.openExternal(showDetalle.nota_credito_enlace_pdf);
                                        else window.open(showDetalle.nota_credito_enlace_pdf, '_blank');
                                    }}
                                >
                                    Ver PDF Nota de Crédito
                                </button>
                            </div>
                        )}
                        {showDetalle.cpe_estado === 'BAJA_PENDIENTE' && (
                            <div className="mt-3 p-3 rounded-lg" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#78350f', margin: 0 }}>
                                    ⚠ Baja pendiente — Este CPE fue emitido en un día anterior. Emite una Nota de Crédito en NubeFact para anularlo formalmente ante SUNAT.
                                </p>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                className="btn btn-secondary"
                                style={{ color: '#25D366', borderColor: '#25D366' }}
                                onClick={() => handleEnviarWhatsapp(showDetalle)}
                            >
                                <MessageCircle size={16} /> WhatsApp
                            </button>
                            <button className="btn btn-secondary" 
                            onClick={async () => {
                                try {
                                    await generateTicketPDF(showDetalle, publicConfig);
                                } catch (err) {
                                    toast(err?.message || 'Error al generar el ticket', 'error');
                                }
                            }}>
                                <Printer size={16} /> Ticket térmico
                            </button>
                            <button className="btn btn-primary" 
                            onClick={async () => {
                                try {
                                    const dataConCredito = { ...showDetalle };
                                    if (dataConCredito.forma_pago === 'CREDITO' && dataConCredito.id_cliente) {
                                        try {
                                            const creditos = await getCreditos({ id_cliente: dataConCredito.id_cliente });
                                            const cr = creditos.find(c => c.id_venta === dataConCredito.id_venta);
                                            if (cr) dataConCredito.credito = {
                                                fecha_vencimiento:   cr.fecha_vencimiento,
                                                monto_adelanto:      cr.monto_pagado > 0 ? cr.monto_pagado : 0,
                                                saldo_pendiente:     cr.saldo,
                                                medio_pago_adelanto: cr.desglose_abonos?.total_efectivo > 0 ? 'EFECTIVO' : cr.desglose_abonos?.total_yape_plin > 0 ? 'YAPE_PLIN' : 'EFECTIVO',
                                            };
                                        } catch (err) {
                                            logger.error('COMPROBANTES', 'Error al obtener datos de crédito para PDF:', err);
                                        }
                                    }
                                    await generateComprobantePDF(dataConCredito);
                                } catch (err) {
                                    toast(err?.message || 'Error al generar el PDF', 'error');
                                }
                            }}>
                                <Printer size={16} /> Descargar PDF A4
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Anular ─────────────────────────────────────── */}
            {showAnular && (
                <div className="modal-overlay" onClick={() => setShowAnular(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <h2>⚠️ Anular Venta</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowAnular(null)}><X size={18} /></button>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            ¿Estás seguro de anular la venta <strong>{showAnular.numero_venta}</strong> por <strong>{formatCurrency(showAnular.total)}</strong>?
                            Esta acción revertirá el stock de los productos.
                        </p>
                        {showAnular.cpe_estado === 'ACEPTADO' && (
                            <div className="mb-4 p-3 rounded-lg" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: '#78350f', margin: 0 }}>
                                    ⚠ Esta venta tiene CPE emitido. Si es del día de hoy se enviará la baja a SUNAT automáticamente.
                                    Si es de otro día, deberás emitir una Nota de Crédito en NubeFact.
                                </p>
                            </div>
                        )}
                        <div className="mb-4">
                            <label className="form-label">Motivo de Anulación (obligatorio)</label>
                            <input
                                className="form-input"
                                required
                                value={motivoAnulacion}
                                onChange={e => setMotivoAnulacion(e.target.value)}
                                placeholder="Ingrese el motivo..."
                                autoFocus
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button className="btn btn-secondary" onClick={() => setShowAnular(null)} disabled={!!anulandoId}>
                                Cancelar
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={handleAnular}
                                disabled={!motivoAnulacion || !!anulandoId}
                            >
                                {anulandoId ? 'Anulando...' : 'Confirmar Anulación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

                        {/* ── Modal Editar ─────────────────────────────────────── */}
            {showEditar && formEditar && (
                <div className="modal-overlay" onClick={() => { setShowEditar(null); setFormEditar(null); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                        <div className="modal-header">
                            <h2>✏️ Editar Venta {showEditar.numero_venta}</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setShowEditar(null); setFormEditar(null); }}><X size={18} /></button>
                        </div>

                        <div className="mb-3 p-3 rounded-lg" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                            <p style={{ fontSize: 12, color: '#1e40af', margin: 0 }}>
                                Solo se puede editar mientras la venta no tenga CPE aceptado y sea el mismo día de registro.
                                Tienes un máximo de <strong>3 intentos de edición</strong> por venta ({3 - (showEditar.veces_editada || 0)} restante{3 - (showEditar.veces_editada || 0) === 1 ? '' : 's'}).
                                El stock se ajustará automáticamente según los cambios.
                            </p>
                        </div>

                        {/* Cliente */}
                        <div className="mb-3" style={{ position: 'relative' }}>
                            <label className="form-label">Cliente</label>
                            <input
                                className="form-input"
                                value={buscarClienteEditar || formEditar.cliente_nombre}
                                onChange={e => { setBuscarClienteEditar(e.target.value); setFormEditar(p => ({ ...p, cliente_nombre: e.target.value })); }}
                                placeholder="Buscar cliente por nombre o documento... (dejar vacío = Consumidor Final)"
                            />
                            {resultadosClienteEditar.length > 0 && (
                                <div className="card" style={{ position: 'absolute', zIndex: 20, width: '100%', maxHeight: 160, overflow: 'auto', padding: 4, background: '#fff' }}>
                                    {resultadosClienteEditar.map(c => (
                                        <div
                                            key={c.id_cliente}
                                            style={{ padding: '6px 8px', cursor: 'pointer', fontSize: 13 }}
                                            onMouseDown={e => {
                                                e.preventDefault();
                                                setFormEditar(p => ({ ...p, id_cliente: c.id_cliente, cliente_nombre: c.nombre_razon_social }));
                                                setBuscarClienteEditar('');
                                                setResultadosClienteEditar([]);
                                            }}
                                        >
                                            {c.nombre_razon_social} — {c.numero_documento}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {formEditar.id_cliente && (
                                <button
                                    type="button"
                                    className="text-xs text-slate-400"
                                    style={{ marginTop: 4 }}
                                    onClick={() => setFormEditar(p => ({ ...p, id_cliente: null, cliente_nombre: 'Consumidor Final' }))}
                                >
                                    Quitar cliente (Consumidor Final)
                                </button>
                            )}
                        </div>

                        {/* Forma de pago */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className="form-label">Forma de pago</label>
                                <select
                                    className="form-input"
                                    value={formEditar.forma_pago}
                                    onChange={e => setFormEditar(p => ({ ...p, forma_pago: e.target.value }))}
                                >
                                    <option value="EFECTIVO">Efectivo</option>
                                    <option value="YAPE_PLIN">Yape/Plin</option>
                                    <option value="TRANSFERENCIA">Transferencia</option>
                                    <option value="MIXTO">Mixto (Efectivo + Yape/Plin)</option>
                                    <option value="CREDITO">Crédito (fiado)</option>
                                </select>
                            </div>
                            {formEditar.forma_pago === 'MIXTO' && (
                                <div className="flex gap-2">
                                    <div style={{ flex: 1 }}>
                                        <label className="form-label">Efectivo</label>
                                        <input type="number" className="form-input" value={formEditar.monto_efectivo}
                                            onChange={e => setFormEditar(p => ({ ...p, monto_efectivo: Number(e.target.value) }))} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label className="form-label">Yape/Plin</label>
                                        <input type="number" className="form-input" value={formEditar.monto_yape_plin}
                                            onChange={e => setFormEditar(p => ({ ...p, monto_yape_plin: Number(e.target.value) }))} />
                                    </div>
                                </div>
                            )}
                            {formEditar.forma_pago === 'CREDITO' && (
                                <div>
                                    <label className="form-label">Fecha de vencimiento</label>
                                    <input type="date" className="form-input" value={formEditar.fecha_vencimiento || ''}
                                        onChange={e => setFormEditar(p => ({ ...p, fecha_vencimiento: e.target.value }))} />
                                </div>
                            )}
                        </div>

                        {/* Productos */}
                        <div className="mb-3" style={{ position: 'relative' }}>
                            <label className="form-label">Agregar producto</label>
                            <input
                                className="form-input"
                                value={buscarProductoEditar}
                                onChange={e => setBuscarProductoEditar(e.target.value)}
                                placeholder="Buscar por nombre, SKU o código de barras..."
                            />
                            {resultadosProductoEditar.length > 0 && (
                                <div className="card" style={{ position: 'absolute', zIndex: 10, width: '100%', maxHeight: 180, overflow: 'auto', padding: 4 }}>
                                    {resultadosProductoEditar.map(p => (
                                        <div
                                            key={p.id_producto}
                                            style={{ padding: '6px 8px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}
                                            onClick={() => agregarProductoEditar(p)}
                                        >
                                            <span>{p.nombre}</span>
                                            <span className="text-slate-400">{formatCurrency(p.precio_venta)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <table className="data-table mb-3">
                            <thead>
                                <tr><th>Producto</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th><th></th></tr>
                            </thead>
                            <tbody>
                                {formEditar.items.map((it, idx) => (
                                    <tr key={it.id_producto}>
                                        <td className="text-sm">{it.nombre_producto}</td>
                                        <td style={{ width: 80 }}>
                                            <input
                                                type="number"
                                                className="form-input"
                                                style={{ width: 70 }}
                                                min={0.01}
                                                value={it.cantidad}
                                                onChange={e => cambiarCantidadItem(idx, e.target.value)}
                                            />
                                        </td>
                                        <td>{formatCurrency(it.precio_unitario)}</td>
                                        <td className="font-bold">{formatCurrency(it.precio_unitario * it.cantidad - (it.descuento_linea || 0))}</td>
                                        <td>
                                            <button className="btn btn-secondary btn-sm" onClick={() => quitarItem(idx)} title="Quitar">
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {formEditar.items.length === 0 && (
                                    <tr><td colSpan={5} className="text-center text-slate-400 py-4">Sin productos — agrega al menos uno</td></tr>
                                )}
                            </tbody>
                        </table>

                        <div className="p-3 rounded-xl bg-purple-50 flex justify-between text-lg font-bold mb-4">
                            <span>Nuevo Total</span><span>{formatCurrency(totalEditar - (showEditar.descuento || 0))}</span>
                        </div>

                        <div className="mb-4">
                            <label className="form-label">Motivo de la edición (obligatorio)</label>
                            <input
                                className="form-input"
                                value={formEditar.motivo}
                                onChange={e => setFormEditar(p => ({ ...p, motivo: e.target.value }))}
                                placeholder="Ej: Cliente pidió agregar productos / Error al registrar"
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button className="btn btn-secondary" onClick={() => { setShowEditar(null); setFormEditar(null); }} disabled={editando}>
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleGuardarEdicion}
                                disabled={editando || formEditar.items.length === 0 || !formEditar.motivo.trim()}
                            >
                                {editando ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Historial de Comprobantes (12 meses) ───────── */}
            {showHistorial && (
                <div className="modal-overlay" onClick={() => setShowHistorial(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 760 }}>
                        <div className="modal-header">
                            <h2>📄 Historial de Comprobantes</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowHistorial(false)}><X size={18} /></button>
                        </div>
                        <p className="text-xs text-slate-400 mb-4">
                            Facturas, Boletas y N. Crédito muestran solo lo aceptado por SUNAT; Rechazados y Pendientes se cuentan aparte
                        </p>

                        {loadingHistorial ? (
                            <p className="text-sm text-slate-500">Cargando historial…</p>
                        ) : !historial || historial.length === 0 ? (
                            <p className="text-sm text-slate-500">No hay comprobantes registrados en este período.</p>
                        ) : (() => {
                            const tot = historial.reduce((acc, m) => {
                                acc.emitidos += contarTipo(m, 'FACTURA', 'ACEPTADO') + contarTipo(m, 'BOLETA', 'ACEPTADO') + contarTipo(m, 'NOTA_CREDITO', 'ACEPTADO');
                                acc.rechazados += contarEstado(m, 'RECHAZADO');
                                acc.pendientes += contarEstado(m, 'PENDIENTE');
                                return acc;
                            }, { emitidos: 0, rechazados: 0, pendientes: 0 });
                            const celda = (v, color) => v > 0
                                ? <span style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color, fontWeight: color ? 700 : 400 }}>{v}</span>
                                : <span style={{ color: '#cbd5e1' }}>—</span>;

                            return (
                                <>
                                    <div className="grid grid-cols-3 gap-3 mb-5">
                                        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '12px 14px' }}>
                                            <div className="text-xs text-slate-500">Emitidos (12 meses)</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: '#5b21b6' }}>{tot.emitidos}</div>
                                        </div>
                                        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px' }}>
                                            <div className="text-xs text-slate-500">Pendientes</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: '#78350f' }}>{tot.pendientes}</div>
                                        </div>
                                        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 14px' }}>
                                            <div className="text-xs text-slate-500">Rechazados</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: '#7f1d1d' }}>{tot.rechazados}</div>
                                        </div>
                                    </div>

                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc' }}>
                                                    {['Mes', 'Facturas', 'Boletas', 'N. Crédito', 'Rechaz.', 'Pend.', 'Total'].map((h, i) => (
                                                        <th key={h} style={{
                                                            textAlign: i === 0 ? 'left' : 'right', padding: '10px 14px',
                                                            fontSize: 11, fontWeight: 700, color: '#64748b',
                                                            textTransform: 'uppercase', letterSpacing: 0.4,
                                                        }}>
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {historial.map((m, i) => {
                                                    const rechazados = contarEstado(m, 'RECHAZADO');
                                                    const pendientes = contarEstado(m, 'PENDIENTE');
                                                    return (
                                                        <tr key={m.mes} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i === 0 ? '#faf9ff' : 'white' }}>
                                                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>
                                                                {formatMes(m.mes)}
                                                                {i === 0 && (
                                                                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#5b21b6', background: '#ede9fe', borderRadius: 8, padding: '1px 7px' }}>
                                                                        ACTUAL
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{ textAlign: 'right', padding: '10px 14px' }}>{celda(contarTipo(m, 'FACTURA', 'ACEPTADO'))}</td>
                                                            <td style={{ textAlign: 'right', padding: '10px 14px' }}>{celda(contarTipo(m, 'BOLETA', 'ACEPTADO'))}</td>
                                                            <td style={{ textAlign: 'right', padding: '10px 14px' }}>{celda(contarTipo(m, 'NOTA_CREDITO', 'ACEPTADO'))}</td>
                                                            <td style={{ textAlign: 'right', padding: '10px 14px' }}>{celda(rechazados, '#dc2626')}</td>
                                                            <td style={{ textAlign: 'right', padding: '10px 14px' }}>{celda(pendientes, '#b45309')}</td>
                                                            <td style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 800, color: '#1e293b', fontFamily: 'monospace' }}>
                                                                {m.total}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            );
                        })()}

                        <div className="flex justify-end gap-3 mt-5">
                            <button className="btn btn-secondary" onClick={() => setShowHistorial(false)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Exportar ───────────────────────────────────── */}
            {showExport && (
                <div className="modal-overlay" onClick={() => setShowExport(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <h2>📊 Exportar Registro de Ventas</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowExport(false)}><X size={18} /></button>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            Exporta las ventas <strong>ACTIVAS</strong> del rango seleccionado en formato Excel para registro en SUNAT.
                        </p>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="form-label">Desde</label>
                                <input type="date" className="form-input" value={exportDesde} onChange={e => setExportDesde(e.target.value)} />
                            </div>
                            <div>
                                <label className="form-label">Hasta</label>
                                <input type="date" className="form-input" value={exportHasta} onChange={e => setExportHasta(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button className="btn btn-secondary" onClick={() => setShowExport(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleExportExcel}>📥 Descargar Excel</button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Modal Corregir Cliente CPE Rechazado ─────────────── */}
            {showCorregir && (
                <div className="modal-overlay" onClick={() => !corrigiendo && setShowCorregir(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h2>✎ Corregir datos del cliente</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowCorregir(null)} disabled={corrigiendo}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mb-3 p-3 rounded-lg" style={{ background: '#fef3c7', border: '1px solid #fcd34d' }}>
                            <p style={{ fontSize: 12, color: '#78350f', margin: 0 }}>
                                El CPE <strong>{showCorregir.numero_comprobante}</strong> fue rechazado por NubeFact.
                                Corrige el documento del cliente y se reemitirá con el mismo número de comprobante.
                            </p>
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Tipo de documento</label>
                            <select
                                className="form-input"
                                value={formCorreccion.tipo_documento}
                                onChange={e => setFormCorreccion(p => ({ ...p, tipo_documento: e.target.value }))}
                                disabled={corrigiendo}
                            >
                                <option value="RUC">RUC</option>
                                <option value="DNI">DNI</option>
                                <option value="CE">CE</option>
                                <option value="PASAPORTE">Pasaporte</option>
                            </select>
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Número de documento</label>
                            <input
                                className="form-input"
                                value={formCorreccion.numero_documento}
                                onChange={e => setFormCorreccion(p => ({ ...p, numero_documento: e.target.value }))}
                                placeholder="Ej: 20123456789"
                                disabled={corrigiendo}
                                autoFocus
                            />
                        </div>

                        <div className="mb-4">
                            <label className="form-label">Nombre / Razón social</label>
                            <input
                                className="form-input"
                                value={formCorreccion.nombre_razon_social}
                                onChange={e => setFormCorreccion(p => ({ ...p, nombre_razon_social: e.target.value }))}
                                placeholder="Ej: EMPRESA SAC"
                                disabled={corrigiendo}
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button className="btn btn-secondary" onClick={() => setShowCorregir(null)} disabled={corrigiendo}>
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                disabled={corrigiendo || !formCorreccion.numero_documento || !formCorreccion.nombre_razon_social}
                                onClick={async () => {
                                    setCorrigiendo(true);
                                    try {
                                        await corregirClienteCPE(showCorregir.id_venta, formCorreccion);
                                        await emitirCPE(showCorregir.id_venta);
                                        toast('CPE corregido y emitido correctamente', 'success');
                                        setShowCorregir(null);
                                        getVentas().then(setVentas);
                                    } catch (err) {
                                        const data          = err.response?.data;
                                        const nubefactError = data?.nubefact?.errors;
                                        const mensajeError  = typeof nubefactError === 'string'
                                            ? `NubeFact: ${nubefactError}`
                                            : typeof nubefactError === 'object'
                                            ? `NubeFact: ${JSON.stringify(nubefactError)}`
                                            : data?.error || 'Error al corregir o emitir';
                                        toast(mensajeError, 'error');
                                    } finally {
                                        setCorrigiendo(false);
                                    }
                                }}
                            >
                                {corrigiendo ? 'Emitiendo...' : 'Corregir y emitir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal WhatsApp ──────────────────────────────────── */}
            {showWhatsapp && (
                <div className="modal-overlay" onClick={() => setShowWhatsapp(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
                        <div className="modal-header">
                            <h2 style={{ color: '#25D366' }}>💬 Enviar por WhatsApp</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowWhatsapp(null)}><X size={18} /></button>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            El cliente <strong>{showWhatsapp.cliente?.nombre_razon_social || 'Consumidor Final'}</strong> no tiene teléfono registrado. Ingresa el número para continuar.
                        </p>
                        <div className="mb-4">
                            <label className="form-label">Número de celular (9 dígitos)</label>
                            <input
                                className="form-input"
                                value={telefonoInput}
                                onChange={e => setTelefonoInput(e.target.value.replace(/\D/g, '').slice(0, 9))}
                                placeholder="Ej: 958624581"
                                inputMode="numeric"
                                autoFocus
                            />
                            {telefonoInput.length > 0 && telefonoInput.length < 9 && (
                                <p className="text-xs text-amber-600 mt-1">Debe tener 9 dígitos</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button className="btn btn-secondary" onClick={() => setShowWhatsapp(null)}>Cancelar</button>
                            <button
                                className="btn btn-primary"
                                style={{ background: '#25D366', borderColor: '#25D366' }}
                                disabled={telefonoInput.length !== 9}
                                onClick={() => handleEnviarWhatsapp(showWhatsapp, telefonoInput)}
                            >
                                <MessageCircle size={15} /> Enviar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Emitir Nota de Crédito/Débito ───────────────── */}
            {showNota && (() => {
                const isBoletaOriginal = showNota.tipo_comprobante === 'BOLETA';
                const hasSeries = isBoletaOriginal
                    ? !!publicConfig?.serie_nota_credito_boleta
                    : !!publicConfig?.serie_nota_credito_factura;

                const motivosNC = [
                    { val: '1', lbl: 'Anulación de la operación' },
                    { val: '2', lbl: 'Anulación por error en el RUC' },
                    { val: '3', lbl: 'Corrección por error en la descripción' },
                    { val: '4', lbl: 'Descuento global' },
                    { val: '5', lbl: 'Descuento por ítem' },
                    { val: '6', lbl: 'Devolución total' },
                    { val: '7', lbl: 'Devolución por ítem' },
                    { val: '8', lbl: 'Bonificación' },
                    { val: '9', lbl: 'Disminución en el valor' },
                    { val: '10', lbl: 'Otros conceptos' },
                    { val: '11', lbl: 'Ajustes afectos al IVAP' },
                    { val: '12', lbl: 'Ajustes de operaciones de exportación' },
                    { val: '13', lbl: 'Ajustes - montos y/o fechas de pago' },
                ];

                const MotivosND = [
                    { val: '1', lbl: 'Intereses por mora' },
                    { val: '2', lbl: 'Aumento de valor' },
                    { val: '3', lbl: 'Penalidades' },
                    { val: '4', lbl: 'Ajustes afectos al IVAP' },
                    { val: '5', lbl: 'Ajustes de operaciones de exportación' },
                ];

                const motivos = motivosNC;

                return (
                    <div className="modal-overlay" onClick={() => setShowNota(null)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                            <div className="modal-header">
                                <h2>📄 Emitir Nota Electrónica</h2>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowNota(null)}><X size={18} /></button>
                            </div>
                            
                            <p className="text-xs text-slate-500 mb-4">
                                Emitiendo documento modificatorio para el comprobante: <strong className="text-purple-600 font-mono">{showNota.numero_comprobante}</strong>
                            </p>

                            {!hasSeries ? (
                                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: 12, marginBottom: 16 }} className="text-sm text-amber-800">
                                    <p className="mb-2">
                                        ⚠️ Aún no configuraste la serie de <strong>Nota de Crédito</strong> {isBoletaOriginal ? '(boleta)' : '(factura)'}. Ingrésala una vez — quedará guardada para las próximas emisiones.
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            className="form-input"
                                            value={nuevaSerieNota}
                                            onChange={e => setNuevaSerieNota(e.target.value.toUpperCase())}
                                            placeholder={isBoletaOriginal ? 'BC01' : 'FC01'}
                                            maxLength={4}
                                            disabled={guardandoSerieNota}
                                            style={{ maxWidth: 120 }}
                                        />
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            disabled={guardandoSerieNota || !nuevaSerieNota.trim()}
                                            onClick={async () => {
                                                setGuardandoSerieNota(true);
                                                try {
                                                    const clave = isBoletaOriginal ? 'serie_nota_credito_boleta' : 'serie_nota_credito_factura';
                                                    const cfgActualizado = await updateConfig({ [clave]: nuevaSerieNota.trim() });
                                                    setPublicConfig(cfgActualizado || {});
                                                    setNuevaSerieNota('');
                                                    toast('Serie guardada correctamente', 'success');
                                                } catch (err) {
                                                    toast(err.response?.data?.error || 'No se pudo guardar la serie', 'error');
                                                } finally {
                                                    setGuardandoSerieNota(false);
                                                }
                                            }}
                                        >
                                            {guardandoSerieNota ? 'Guardando...' : 'Guardar serie'}
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            <div className="mb-4">
                                <label className="form-label">Motivo SUNAT</label>
                                <select 
                                    className="form-input"
                                    value={formNota.motivo_codigo}
                                    onChange={e => setFormNota(p => ({ ...p, motivo_codigo: e.target.value }))}
                                    disabled={emitirNotaLoading || !hasSeries}
                                >
                                    {motivos.map(m => (
                                        <option key={m.val} value={m.val}>{m.val} - {m.lbl}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="mb-4">
                                <label className="form-label">Descripción / Justificación (Obligatorio)</label>
                                <input
                                    className="form-input"
                                    value={formNota.motivo_descripcion}
                                    onChange={e => setFormNota(p => ({ ...p, motivo_descripcion: e.target.value }))}
                                    placeholder="Ej: Devolución total de dinero al cliente"
                                    disabled={emitirNotaLoading || !hasSeries}
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button className="btn btn-secondary" onClick={() => setShowNota(null)} disabled={emitirNotaLoading}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-primary"
                                    style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
                                    disabled={emitirNotaLoading || !hasSeries || !formNota.motivo_descripcion.trim()}
                                    onClick={async () => {
                                        setEmitirNotaLoading(true);
                                        try {
                                            const res = await emitirNotaCpe(showNota.id_venta, {
                                                tipo_nota: formNota.tipo_nota,
                                                motivo_codigo: formNota.motivo_codigo,
                                                motivo_descripcion: formNota.motivo_descripcion
                                            });
                                            if (res.exito) {
                                                toast(`${formNota.tipo_nota === 'NOTA_CREDITO' ? 'Nota de Crédito' : 'Nota de Débito'} emitida correctamente`, 'success');
                                            }
                                            setShowNota(null);
                                            getVentas().then(setVentas);
                                        } catch (err) {
                                            const data = err.response?.data;
                                            toast(data?.error || 'Error al emitir la nota electrónica.', 'error');
                                        } finally {
                                            setEmitirNotaLoading(false);
                                        }
                                    }}
                                >
                                    {emitirNotaLoading ? 'Emitiendo...' : 'Emitir Nota'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
}
