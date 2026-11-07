import { useState, useRef } from 'react';
import { getReporteVentas, getReporteInventario, getProductosSinMovimiento, guardarArchivoLocal } from '../services/api';
import { formatCurrency, downloadExcel, downloadCSV } from '../utils/helpers';
import logger from '../utils/logger';
import { BarChart3, Calendar, Package, FileText, TrendingUp, DollarSign, ShoppingCart, AlertTriangle, Store, Warehouse, FileSpreadsheet, Download, PackageX } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, ScatterChart, Scatter, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { useToast } from '../components/Toast';

const COLORS = ['#7c3aed', '#0369a1', '#15803d', '#d97706', '#dc2626', '#0891b2', '#0d9488', '#db2777', '#059669', '#ea580c'];
const PAGINA_LIMITE = 20;
const PAGINA_LIMITE_EXPORT = 100; // máximo permitido por el backend, para minimizar requests al exportar todo el rango

const Paginacion = ({ paginacion, onCambiarPagina }) => {
    if (!paginacion || paginacion.totalPaginas <= 1) return null;
    const { pagina, totalPaginas } = paginacion;

    const paginas = [];
    const rango = 2;
    for (let i = 1; i <= totalPaginas; i++) {
        if (i === 1 || i === totalPaginas || (i >= pagina - rango && i <= pagina + rango)) {
            paginas.push(i);
        } else if (paginas[paginas.length - 1] !== '...') {
            paginas.push('...');
        }
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
            <button onClick={() => onCambiarPagina(pagina - 1)} disabled={pagina === 1}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: pagina === 1 ? '#cbd5e1' : '#64748b', fontSize: 12, fontWeight: 600, cursor: pagina === 1 ? 'not-allowed' : 'pointer' }}>
                Anterior
            </button>
            {paginas.map((p, i) => p === '...' ? (
                <span key={`dots-${i}`} style={{ padding: '0 4px', color: '#94a3b8', fontSize: 12 }}>...</span>
            ) : (
                <button key={p} onClick={() => onCambiarPagina(p)}
                    style={{ minWidth: 30, padding: '6px 8px', borderRadius: 6, border: '1px solid', borderColor: p === pagina ? '#7c3aed' : '#e2e8f0', background: p === pagina ? '#7c3aed' : 'white', color: p === pagina ? 'white' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {p}
                </button>
            ))}
            <button onClick={() => onCambiarPagina(pagina + 1)} disabled={pagina === totalPaginas}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: pagina === totalPaginas ? '#cbd5e1' : '#64748b', fontSize: 12, fontWeight: 600, cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer' }}>
                Siguiente
            </button>
        </div>
    );
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed', margin: 0 }}>{payload[0].value}</p>
            </div>
        );
    }
    return null;
};

const TrendTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const punto = payload[0].payload;
        return (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed', margin: 0 }}>{formatCurrency(punto.total)}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{punto.cantidad} ventas</p>
            </div>
        );
    }
    return null;
};

const DispersionTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const p = payload[0].payload;
        return (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', margin: '0 0 2px' }}>{p.nombre}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 6px' }}>{p.sku} • {p.categoria}</p>
                <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>Tienda: <strong>{p.stock_tienda ?? 0}</strong></p>
                <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>Almacén: <strong>{p.stock_deposito ?? 0}</strong></p>
            </div>
        );
    }
    return null;
};

export default function Reportes() {
    const toast = useToast();
    const [tab, setTab] = useState('ventas');
    const [fechaDesde, setFechaDesde] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; });
    const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);
    const [reporteVentas, setReporteVentas] = useState(null);
    const [reporteInventario, setReporteInventario] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exportandoVentas, setExportandoVentas] = useState(false);
    const [exportandoGraficosVentas, setExportandoGraficosVentas] = useState(false);
    const graficosVentasRef = useRef(null);
    const [exportandoVentasExcel, setExportandoVentasExcel] = useState(false);
    const [exportandoVentasCSV, setExportandoVentasCSV] = useState(false);
    const [exportandoInventario, setExportandoInventario] = useState(false);
    const [productosDispersion, setProductosDispersion] = useState([]);
    const [cargandoDispersion, setCargandoDispersion] = useState(false);
    const [filtroTextoDispersion, setFiltroTextoDispersion] = useState('');
    const [filtroCategoriaDispersion, setFiltroCategoriaDispersion] = useState('');
    const [diasSinMovimiento, setDiasSinMovimiento] = useState(30);
    const [productosSinMovimiento, setProductosSinMovimiento] = useState(null);
    const [paginaNuncaVendidos, setPaginaNuncaVendidos] = useState(1);
    const [paginaSinMovimientoReciente, setPaginaSinMovimientoReciente] = useState(1);
    const [cargandoSinMovimiento, setCargandoSinMovimiento] = useState(false);

    const periodoRapido = (dias) => {
        const hasta = new Date();
        const desde = new Date();
        desde.setDate(desde.getDate() - dias);
        const desdeStr = desde.toISOString().split('T')[0];
        const hastaStr = hasta.toISOString().split('T')[0];
        setFechaDesde(desdeStr);
        setFechaHasta(hastaStr);
        loadReporteVentas(1, desdeStr, hastaStr);
    };

    const guardarPDF = async (doc, suggestedName) => {
        // Guardar en servidor (backup silencioso)
        try {
            const pdfBase64 = doc.output('datauristring');
            await guardarArchivoLocal({
                modulo: 'reportes',
                filename: suggestedName,
                content: pdfBase64,
                isBase64: true
            });
        } catch (e) {
            logger.error('REPORTES', 'Error al guardar PDF en servidor:', e);
        }

        // Diálogo nativo Electron
        if (window.electronAPI?.savePDFDialog) {
            try {
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                const result = await window.electronAPI.savePDFDialog({
                    buffer: pdfBase64,
                    suggestedName
                });
                if (result.canceled) return;
                if (!result.ok) {
                    toast('Error al guardar el PDF', 'error');
                }
            } catch (err) {
                logger.error('REPORTES', 'Error al guardar PDF:', err);
                toast('Error al guardar el PDF', 'error');
            }
        }
    };

    const exportarPDF = async (titulo, filename, columns, rows) => {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF();
        doc.setFillColor(30, 30, 30);
        doc.rect(0, 0, 210, 32, 'F');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(titulo, 14, 15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180, 180, 180);
        doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, 14, 25);

        autoTable(doc, {
            startY: 40,
            head: [columns],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [115, 93, 255], fontSize: 9, fontStyle: 'bold' },
            bodyStyles: { fontSize: 8.5 },
            alternateRowStyles: { fillColor: [248, 247, 255] }
        });

        const suggestedName = `${filename}_${new Date().toISOString().slice(0, 10)}.pdf`;
        await guardarPDF(doc, suggestedName);
    };

    // Captura TODOS los gráficos del reporte de ventas (tal como se ven en pantalla)
    // como imagen y arma un PDF, partido en varias páginas si no entra en una sola.
    const exportarGraficosVentasPDF = async () => {
        if (!graficosVentasRef.current) return;
        setExportandoGraficosVentas(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(graficosVentasRef.current, { scale: 2, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');

            const { default: jsPDF } = await import('jspdf');
            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 10;
            const headerHeight = 32;

            doc.setFillColor(30, 30, 30);
            doc.rect(0, 0, pageWidth, headerHeight, 'F');
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text('Graficos del Reporte de Ventas', 14, 15);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(180, 180, 180);
            doc.text(`Periodo: ${fechaDesde} a ${fechaHasta}  —  Generado: ${new Date().toLocaleString('es-PE')}`, 14, 25);

            const imgWidth = pageWidth - margin * 2;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let position = headerHeight + 5;
            doc.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
            let heightLeft = imgHeight - (pageHeight - position);

            while (heightLeft > 0) {
                doc.addPage();
                position = -(imgHeight - heightLeft);
                doc.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            const suggestedName = `graficos_ventas_${new Date().toISOString().slice(0, 10)}.pdf`;
            await guardarPDF(doc, suggestedName);
        } catch (e) {
            logger.error('REPORTES', 'Error al exportar gráficos a PDF:', e);
            toast('Error al exportar los gráficos', 'error');
        } finally {
            setExportandoGraficosVentas(false);
        }
    };

    const loadReporteVentas = async (page = 1, desdeParam = fechaDesde, hastaParam = fechaHasta) => {
        setLoading(true);
        const data = await getReporteVentas({ fecha_desde: desdeParam, fecha_hasta: hastaParam, page, limit: PAGINA_LIMITE });
        setReporteVentas(data);
        setLoading(false);
    };

    const loadReporteInventario = async (page = 1) => {
        setLoading(true);
        const data = await getReporteInventario({ page, limit: PAGINA_LIMITE });
        setReporteInventario(data);
        setLoading(false);
        if (page === 1) {
            cargarProductosDispersion();
            cargarProductosSinMovimiento();
        }
    };

    // Recorre todas las páginas del backend (rango completo) antes de armar el PDF.
    const fetchTodasLasVentas = async () => {
        let pagina = 1;
        let todas = [];
        let totalPaginas = 1;
        do {
            const data = await getReporteVentas({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta, page: pagina, limit: PAGINA_LIMITE_EXPORT });
            todas = todas.concat(data.ventas);
            totalPaginas = data.paginacion.totalPaginas;
            pagina++;
        } while (pagina <= totalPaginas);
        return todas;
    };

    const fetchTodosLosProductosInventario = async () => {
        let pagina = 1;
        let todos = [];
        let totalPaginas = 1;
        do {
            const data = await getReporteInventario({ page: pagina, limit: PAGINA_LIMITE_EXPORT });
            todos = todos.concat(data.productos);
            totalPaginas = data.paginacion.totalPaginas;
            pagina++;
        } while (pagina <= totalPaginas);
        return todos;
    };

    // Carga TODOS los productos activos (no solo la página visible) para el
    // gráfico de dispersión, que necesita ver el catálogo completo.
    const cargarProductosDispersion = async () => {
        setCargandoDispersion(true);
        try {
            const todos = await fetchTodosLosProductosInventario();
            setProductosDispersion(todos);
        } catch (e) {
            logger.error('REPORTES', 'Error al cargar datos del gráfico de dispersión:', e);
        } finally {
            setCargandoDispersion(false);
        }
    };

    // Carga los productos sin ventas recientes (o nunca vendidos) para el umbral de días elegido.
    const cargarProductosSinMovimiento = async (dias = diasSinMovimiento) => {
        setCargandoSinMovimiento(true);
        try {
            const data = await getProductosSinMovimiento({ dias });
            setProductosSinMovimiento(data);
        } catch (e) {
            logger.error('REPORTES', 'Error al cargar productos sin movimiento:', e);
        } finally {
            setCargandoSinMovimiento(false);
        }
    };

    const cambiarDiasSinMovimiento = (dias) => {
        setDiasSinMovimiento(dias);
        setPaginaNuncaVendidos(1);
        setPaginaSinMovimientoReciente(1);
        cargarProductosSinMovimiento(dias);
    };

    const diasDesde = (fechaStr) => Math.floor((Date.now() - new Date(fechaStr).getTime()) / 86400000);

    const medianaDe = (valores) => {
        if (valores.length === 0) return 0;
        const ordenado = [...valores].sort((a, b) => a - b);
        const mid = Math.floor(ordenado.length / 2);
        return ordenado.length % 2 !== 0 ? ordenado[mid] : (ordenado[mid - 1] + ordenado[mid]) / 2;
    };

    const productosFiltradosDispersion = productosDispersion.filter(p => {
        const texto = filtroTextoDispersion.trim().toLowerCase();
        const coincideTexto = !texto || p.nombre.toLowerCase().includes(texto) || p.sku.toLowerCase().includes(texto);
        const coincideCategoria = !filtroCategoriaDispersion || p.categoria === filtroCategoriaDispersion;
        return coincideTexto && coincideCategoria;
    });

    const medianaTiendaDispersion = medianaDe(productosFiltradosDispersion.map(p => p.stock_tienda ?? 0));
    const medianaAlmacenDispersion = medianaDe(productosFiltradosDispersion.map(p => p.stock_deposito ?? 0));

    const colorCuadranteDispersion = (p) => {
        const tienda = p.stock_tienda ?? 0;
        const almacen = p.stock_deposito ?? 0;
        if (tienda < medianaTiendaDispersion && almacen >= medianaAlmacenDispersion) return '#d97706'; // reponer
        if (tienda < medianaTiendaDispersion && almacen < medianaAlmacenDispersion) return '#dc2626'; // comprar
        return '#7c3aed'; // normal / bien abastecido
    };

    const exportarVentasPDF = async () => {
        setExportandoVentas(true);
        try {
            const todas = await fetchTodasLasVentas();
            await exportarPDF('Detalle de Ventas', 'ventas_reporte', ['N° Venta', 'Fecha', 'Comprobante', 'Forma Pago', 'Total', 'Estado'],
                todas.map(v => [v.numero_venta, new Date(v.fecha_hora).toLocaleDateString('es-PE'), v.tipo_comprobante, v.forma_pago, formatCurrency(v.total), v.estado]));
        } catch (e) {
            logger.error('REPORTES', 'Error al exportar ventas:', e);
            toast('Error al exportar el reporte de ventas', 'error');
        } finally {
            setExportandoVentas(false);
        }
    };

    const exportarVentasExcel = async () => {
        setExportandoVentasExcel(true);
        try {
            const todas = await fetchTodasLasVentas();
            await downloadExcel(todas, 'ventas_reporte', 'reportes', toast, [
                { header: 'N° Venta', value: v => v.numero_venta },
                { header: 'Fecha', value: v => new Date(v.fecha_hora).toLocaleDateString('es-PE') },
                { header: 'Comprobante', value: v => v.tipo_comprobante },
                { header: 'Forma Pago', value: v => v.forma_pago },
                { header: 'Total', value: v => Number(v.total) },
                { header: 'Estado', value: v => v.estado },
            ]);
        } catch (e) {
            logger.error('REPORTES', 'Error al exportar ventas a Excel:', e);
            toast('Error al exportar el reporte de ventas', 'error');
        } finally {
            setExportandoVentasExcel(false);
        }
    };

    const exportarVentasCSV = async () => {
        setExportandoVentasCSV(true);
        try {
            const todas = await fetchTodasLasVentas();
            const filas = todas.map(v => ({
                'N° Venta': v.numero_venta,
                'Fecha': new Date(v.fecha_hora).toLocaleDateString('es-PE'),
                'Comprobante': v.tipo_comprobante,
                'Forma Pago': v.forma_pago,
                'Total': v.total,
                'Estado': v.estado,
            }));
            await downloadCSV(filas, 'ventas_reporte', 'reportes', toast);
        } catch (e) {
            logger.error('REPORTES', 'Error al exportar ventas a CSV:', e);
            toast('Error al exportar el reporte de ventas', 'error');
        } finally {
            setExportandoVentasCSV(false);
        }
    };

    const exportarInventarioPDF = async () => {
        setExportandoInventario(true);
        try {
            const todos = await fetchTodosLosProductosInventario();
            await exportarPDF('Inventario Completo', 'inventario_reporte', ['SKU', 'Producto', 'Categoria', 'Stock Tienda', 'Stock Almacen', 'P. Compra', 'Valor Stock'],
                todos.map(p => [p.sku, p.nombre, p.categoria, p.stock_tienda ?? 0, p.stock_deposito ?? 0, formatCurrency(p.precio_compra), formatCurrency(p.stock_actual * p.precio_compra)]));
        } catch (e) {
            logger.error('REPORTES', 'Error al exportar inventario:', e);
            toast('Error al exportar el reporte de inventario', 'error');
        } finally {
            setExportandoInventario(false);
        }
    };

    const listaSinMovimiento = productosSinMovimiento?.productos || [];
    const productosNuncaVendidos = listaSinMovimiento.filter(p => !p.ultima_venta);
    const productosParadosRecientemente = listaSinMovimiento.filter(p => p.ultima_venta);
    const capitalInmovilizado = listaSinMovimiento.reduce((acc, p) => acc + (p.stock_actual * p.precio_compra), 0);

    const TAM_PAGINA_SIN_MOVIMIENTO = 10;
    const nuncaVendidosPagina = productosNuncaVendidos.slice((paginaNuncaVendidos - 1) * TAM_PAGINA_SIN_MOVIMIENTO, paginaNuncaVendidos * TAM_PAGINA_SIN_MOVIMIENTO);
    const paginacionNuncaVendidos = { pagina: paginaNuncaVendidos, totalPaginas: Math.ceil(productosNuncaVendidos.length / TAM_PAGINA_SIN_MOVIMIENTO) };
    const paradosRecientementePagina = productosParadosRecientemente.slice((paginaSinMovimientoReciente - 1) * TAM_PAGINA_SIN_MOVIMIENTO, paginaSinMovimientoReciente * TAM_PAGINA_SIN_MOVIMIENTO);
    const paginacionParadosRecientemente = { pagina: paginaSinMovimientoReciente, totalPaginas: Math.ceil(productosParadosRecientemente.length / TAM_PAGINA_SIN_MOVIMIENTO) };

    return (
        <div className="page-enter">

            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>Reportes</h1>
                    <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>Analisis y estadisticas del negocio</p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {[
                    { key: 'ventas', label: 'Reporte de Ventas', icon: <BarChart3 size={15} /> },
                    { key: 'inventario', label: 'Reporte de Inventario', icon: <Package size={15} /> },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: '1px solid', borderColor: tab === t.key ? '#7c3aed' : '#e2e8f0', background: tab === t.key ? '#7c3aed' : 'white', color: tab === t.key ? 'white' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* ── REPORTE VENTAS ── */}
            {tab === 'ventas' && (
                <div>
                    {/* Filtros */}
                    <div className="card mb-5">
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Periodo</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                            <div>
                                <label className="form-label">Desde</label>
                                <input className="form-input" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                            </div>
                            <div>
                                <label className="form-label">Hasta</label>
                                <input className="form-input" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {[
                                    { label: 'Hoy', dias: 0 },
                                    { label: '7 dias', dias: 7 },
                                    { label: '30 dias', dias: 30 },
                                    { label: '90 dias', dias: 90 },
                                ].map(p => (
                                    <button key={p.label} onClick={() => periodoRapido(p.dias)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            <button className="btn btn-primary" onClick={() => loadReporteVentas()} disabled={loading} style={{ padding: '9px 20px', fontWeight: 700 }}>
                                <Calendar size={15} /> {loading ? 'Cargando...' : 'Generar Reporte'}
                            </button>
                        </div>
                    </div>

                    {!reporteVentas && (
                        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                            <BarChart3 size={56} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                            <p style={{ fontSize: 15, fontWeight: 600 }}>Seleccione un periodo y genere el reporte</p>
                        </div>
                    )}

                    {reporteVentas && (
                        <>
                            {/* KPIs */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                                {[
                                    { label: 'Total Ventas', valor: reporteVentas.totalVentas, icon: <ShoppingCart size={18} />, color: '#7c3aed', bg: '#f5f3ff', border: '#e9d5ff', formato: 'numero' },
                                    { label: 'Total Facturado', valor: reporteVentas.totalFacturado, icon: <DollarSign size={18} />, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', formato: 'moneda' },
                                    { label: 'Total IGV', valor: reporteVentas.totalIgv, icon: <FileText size={18} />, color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', formato: 'moneda' },
                                    { label: 'Ticket Promedio', valor: reporteVentas.ticketPromedio, icon: <TrendingUp size={18} />, color: '#d97706', bg: '#fffbeb', border: '#fde68a', formato: 'moneda' },
                                ].map((k, i) => (
                                    <div key={i} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 12, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: k.color, borderRadius: '12px 0 0 12px' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{k.label}</p>
                                            <div style={{ color: k.color }}>{k.icon}</div>
                                        </div>
                                        <p style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>
                                            {k.formato === 'moneda' ? formatCurrency(k.valor) : k.valor}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Encabezado + exportar todos los gráficos */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Graficos del Periodo</p>
                                <button onClick={exportarGraficosVentasPDF} disabled={exportandoGraficosVentas}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 8, cursor: exportandoGraficosVentas ? 'not-allowed' : 'pointer', color: '#7c3aed', fontSize: 13, fontWeight: 600, opacity: exportandoGraficosVentas ? 0.6 : 1 }}>
                                    <FileText size={14} /> {exportandoGraficosVentas ? 'Exportando...' : 'Exportar Graficos PDF'}
                                </button>
                            </div>

                            <div ref={graficosVentasRef}>
                            {/* Tendencia diaria */}
                            {reporteVentas.ventasPorDia && reporteVentas.ventasPorDia.length > 0 && (
                                <div className="card mb-5">
                                    <div style={{ marginBottom: 16 }}>
                                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Tendencia de Ventas en el Periodo</h3>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Monto facturado por día</p>
                                    </div>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <LineChart data={reporteVentas.ventasPorDia}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                                tickFormatter={(f) => { const [, m, d] = f.split('-'); return `${d}/${m}`; }} />
                                            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<TrendTooltip />} />
                                            <Line type="monotone" dataKey="total" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3, fill: '#7c3aed' }} activeDot={{ r: 5 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Ventas por categoría */}
                            {reporteVentas.ventasPorCategoria && reporteVentas.ventasPorCategoria.length > 0 && (
                                <div className="card mb-5">
                                    <div style={{ marginBottom: 16 }}>
                                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Ventas por Categoría</h3>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Monto facturado por categoría de producto en el periodo</p>
                                    </div>
                                    <ResponsiveContainer width="100%" height={Math.max(180, reporteVentas.ventasPorCategoria.length * 42)}>
                                        <BarChart data={reporteVentas.ventasPorCategoria} layout="vertical" margin={{ top: 5, right: 50, bottom: 5, left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                            <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
                                            <YAxis type="category" dataKey="categoria" tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={120} />
                                            <Tooltip formatter={(v) => formatCurrency(v)} />
                                            <Bar dataKey="total" fill="#7c3aed" radius={[0, 4, 4, 0]} barSize={22}>
                                                <LabelList dataKey="total" position="right" formatter={(v) => formatCurrency(v)} style={{ fontSize: 11, fill: '#1e293b', fontWeight: 700 }} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Graficos */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                                <div className="card">
                                    <div style={{ marginBottom: 16 }}>
                                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Top 10 Productos Mas Vendidos</h3>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Por cantidad de unidades</p>
                                    </div>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={reporteVentas.topProductos} barSize={24}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="nombre" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={70} />
                                            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <defs>
                                                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#7c3aed" />
                                                    <stop offset="100%" stopColor="#a78bfa" />
                                                </linearGradient>
                                            </defs>
                                            <Bar dataKey="cantidad" fill="url(#barGrad)" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="card">
                                    <div style={{ marginBottom: 16 }}>
                                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Ventas por Forma de Pago</h3>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Distribucion del periodo</p>
                                    </div>
                                    {Object.keys(reporteVentas.porFormaPago).length > 0 ? (
                                        <>
                                            <ResponsiveContainer width="100%" height={200}>
                                                <PieChart>
                                                    <Pie data={Object.entries(reporteVentas.porFormaPago).map(([k, v]) => ({ name: k, value: v.total }))} cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                                                        {Object.keys(reporteVentas.porFormaPago).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                                    </Pie>
                                                    <Tooltip formatter={v => formatCurrency(v)} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                                {Object.entries(reporteVentas.porFormaPago).map(([k, v], i) => (
                                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8fafc', borderRadius: 6 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                                                            <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>{k}</span>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{formatCurrency(v.total)}</span>
                                                            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{v.cantidad} ventas</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : <div className="empty-state"><p>Sin datos de pago</p></div>}
                                </div>
                            </div>
                            </div>

                            {/* Tabla ventas */}
                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Detalle de Ventas</h3>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{reporteVentas.paginacion.total} registros en el periodo</p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <button onClick={exportarVentasPDF} disabled={exportandoVentas}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 8, cursor: exportandoVentas ? 'not-allowed' : 'pointer', color: '#7c3aed', fontSize: 13, fontWeight: 600, opacity: exportandoVentas ? 0.6 : 1 }}>
                                            <FileText size={14} /> {exportandoVentas ? 'Exportando...' : 'PDF'}
                                        </button>
                                        <button onClick={exportarVentasExcel} disabled={exportandoVentasExcel}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, cursor: exportandoVentasExcel ? 'not-allowed' : 'pointer', color: '#15803d', fontSize: 13, fontWeight: 600, opacity: exportandoVentasExcel ? 0.6 : 1 }}>
                                            <FileSpreadsheet size={14} /> {exportandoVentasExcel ? 'Exportando...' : 'Excel'}
                                        </button>
                                        <button onClick={exportarVentasCSV} disabled={exportandoVentasCSV}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, cursor: exportandoVentasCSV ? 'not-allowed' : 'pointer', color: '#0369a1', fontSize: 13, fontWeight: 600, opacity: exportandoVentasCSV ? 0.6 : 1 }}>
                                            <Download size={14} /> {exportandoVentasCSV ? 'Exportando...' : 'CSV'}
                                        </button>
                                    </div>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="data-table" style={{ margin: 0 }}>
                                        <thead>
                                            <tr>
                                                <th>N° Venta</th>
                                                <th>Fecha</th>
                                                <th>Comprobante</th>
                                                <th>Forma de Pago</th>
                                                <th style={{ textAlign: 'right' }}>Total</th>
                                                <th style={{ textAlign: 'center' }}>Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reporteVentas.ventas.map(v => (
                                                <tr key={v.id_venta}>
                                                    <td><span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>{v.numero_venta}</span></td>
                                                    <td style={{ fontSize: 12, color: '#64748b' }}>{new Date(v.fecha_hora).toLocaleDateString('es-PE')}</td>
                                                    <td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: v.tipo_comprobante === 'FACTURA' ? '#f0f9ff' : '#f8fafc', color: v.tipo_comprobante === 'FACTURA' ? '#0369a1' : '#475569', border: '1px solid #e2e8f0' }}>{v.tipo_comprobante}</span></td>
                                                    <td style={{ fontSize: 12, color: '#475569' }}>{v.forma_pago}</td>
                                                    <td style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{formatCurrency(v.total)}</td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: v.estado === 'ACTIVA' ? '#f0fdf4' : '#fef2f2', color: v.estado === 'ACTIVA' ? '#15803d' : '#dc2626', border: `1px solid ${v.estado === 'ACTIVA' ? '#bbf7d0' : '#fecaca'}` }}>
                                                            {v.estado}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {reporteVentas.ventas.length === 0 && (
                                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No hay ventas en el periodo seleccionado</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <Paginacion paginacion={reporteVentas.paginacion} onCambiarPagina={loadReporteVentas} />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── REPORTE INVENTARIO ── */}
            {tab === 'inventario' && (
                <div>
                    <div className="card mb-5" style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <p style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', margin: 0 }}>Reporte de Inventario Actual</p>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Genera un snapshot del estado actual del inventario</p>
                            </div>
                            <button className="btn btn-primary" onClick={() => loadReporteInventario()} disabled={loading} style={{ fontWeight: 700 }}>
                                <Package size={15} /> {loading ? 'Cargando...' : 'Generar Reporte'}
                            </button>
                        </div>
                    </div>

                    {!reporteInventario && (
                        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                            <Package size={56} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                            <p style={{ fontSize: 15, fontWeight: 600 }}>Haga clic en Generar Reporte para ver el estado del inventario</p>
                        </div>
                    )}

                    {reporteInventario && (
                        <>
                            {/* KPIs */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                                {[
                                    { label: 'Total Productos', valor: reporteInventario.totalProductos, formato: 'numero', icon: <Package size={18} />, color: '#7c3aed', bg: '#f5f3ff', border: '#e9d5ff' },
                                    { label: 'Valor a Costo', valor: reporteInventario.valorTotalCompra, formato: 'moneda', icon: <DollarSign size={18} />, color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
                                    { label: 'Valor a Venta', valor: reporteInventario.valorTotalVenta, formato: 'moneda', icon: <TrendingUp size={18} />, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                                    { label: 'Stock Critico', valor: reporteInventario.stockCritico.length, formato: 'numero', icon: <AlertTriangle size={18} />, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                                    { label: 'Stock en Tienda', valor: reporteInventario.stockPorUbicacion?.tienda ?? 0, formato: 'numero', icon: <Store size={18} />, color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4' },
                                    { label: 'Stock en Almacen', valor: reporteInventario.stockPorUbicacion?.deposito ?? 0, formato: 'numero', icon: <Warehouse size={18} />, color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
                                ].map((k, i) => (
                                    <div key={i} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 12, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: k.color, borderRadius: '12px 0 0 12px' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <p style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{k.label}</p>
                                            <div style={{ color: k.color }}>{k.icon}</div>
                                        </div>
                                        <p style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>
                                            {k.formato === 'moneda' ? formatCurrency(k.valor) : k.valor}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Dispersión: stock por producto, tienda vs almacén */}
                            {reporteInventario.stockPorUbicacion && (
                                <div className="card mb-5">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                                        <div>
                                            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Stock por Producto: Tienda vs Almacén</h3>
                                            <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Cada punto es un producto. Útil para decidir qué reponer o comprar.</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <input
                                                type="text"
                                                placeholder="Buscar por nombre o SKU..."
                                                value={filtroTextoDispersion}
                                                onChange={e => setFiltroTextoDispersion(e.target.value)}
                                                style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, minWidth: 180 }}
                                            />
                                            <select
                                                value={filtroCategoriaDispersion}
                                                onChange={e => setFiltroCategoriaDispersion(e.target.value)}
                                                style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}
                                            >
                                                <option value="">Todas las categorías</option>
                                                {Object.keys(reporteInventario.porCategoria).map(cat => (
                                                    <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {cargandoDispersion ? (
                                        <div className="empty-state"><p>Cargando datos...</p></div>
                                    ) : productosFiltradosDispersion.length > 0 ? (
                                        <>
                                            <ResponsiveContainer width="100%" height={320}>
                                                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis type="number" dataKey="stock_deposito" name="Stock Almacén"
                                                        tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                                        label={{ value: 'Stock Almacén', position: 'insideBottom', offset: -8, fontSize: 12, fill: '#64748b' }} />
                                                    <YAxis type="number" dataKey="stock_tienda" name="Stock Tienda"
                                                        tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                                        label={{ value: 'Stock Tienda', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }} />
                                                    <ReferenceLine x={medianaAlmacenDispersion} stroke="#cbd5e1" strokeDasharray="4 4" />
                                                    <ReferenceLine y={medianaTiendaDispersion} stroke="#cbd5e1" strokeDasharray="4 4" />
                                                    <Tooltip content={<DispersionTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                                                    <Scatter data={productosFiltradosDispersion}>
                                                        {productosFiltradosDispersion.map((p, i) => (
                                                            <Cell key={p.id_producto ?? i} fill={colorCuadranteDispersion(p)} />
                                                        ))}
                                                    </Scatter>
                                                </ScatterChart>
                                            </ResponsiveContainer>
                                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#7c3aed' }} />
                                                    <span style={{ fontSize: 12, color: '#475569' }}>Normal / bien abastecido</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#d97706' }} />
                                                    <span style={{ fontSize: 12, color: '#475569' }}>Reponer (poco en tienda, mucho en almacén)</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626' }} />
                                                    <span style={{ fontSize: 12, color: '#475569' }}>Comprar (poco stock en ambos)</span>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="empty-state"><p>No hay productos que coincidan con el filtro</p></div>
                                    )}
                                </div>
                            )}

                            {/* Productos sin movimiento */}
                            <div className="card mb-5">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                                    <div>
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                                            <PackageX size={16} style={{ color: '#dc2626' }} /> Productos sin Movimiento
                                        </h3>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Con stock disponible, sin ventas recientes</p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <label htmlFor="dias-sin-movimiento" style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Sin venderse hace:</label>
                                        <select
                                            id="dias-sin-movimiento"
                                            value={diasSinMovimiento}
                                            onChange={e => cambiarDiasSinMovimiento(Number(e.target.value))}
                                            style={{ padding: '8px 30px 8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1e293b', background: 'white', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none' fill-rule='evenodd'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                                        >
                                            <option value={30}>30+ días</option>
                                            <option value={60}>60+ días</option>
                                            <option value={90}>90+ días</option>
                                            <option value={180}>6 meses o más</option>
                                        </select>
                                    </div>
                                </div>

                                {cargandoSinMovimiento ? (
                                    <div className="empty-state"><p>Cargando datos...</p></div>
                                ) : listaSinMovimiento.length === 0 ? (
                                    <div className="empty-state"><p>Ningún producto activo cumple ese criterio — buena señal.</p></div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                                            <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                                                <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 2px' }}>Productos sin movimiento</p>
                                                <p style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: 0 }}>{listaSinMovimiento.length}</p>
                                            </div>
                                            <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                                                <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 2px' }}>Capital inmovilizado</p>
                                                <p style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: 0 }}>{formatCurrency(capitalInmovilizado)}</p>
                                            </div>
                                        </div>

                                        {productosNuncaVendidos.length > 0 && (
                                            <div style={{ marginBottom: 20 }}>
                                                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Nunca vendidos ({productosNuncaVendidos.length})</h4>
                                                <table style={{ width: '100%', fontSize: 13 }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Producto</th>
                                                            <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Stock</th>
                                                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Valor</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {nuncaVendidosPagina.map(p => (
                                                            <tr key={p.id_producto} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '6px 8px' }}>
                                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.nombre}</div>
                                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.sku}</div>
                                                                </td>
                                                                <td style={{ textAlign: 'center', padding: '6px 8px' }}>{p.stock_actual}</td>
                                                                <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>{formatCurrency(p.stock_actual * p.precio_compra)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <Paginacion paginacion={paginacionNuncaVendidos} onCambiarPagina={setPaginaNuncaVendidos} />
                                            </div>
                                        )}

                                        {productosParadosRecientemente.length > 0 && (
                                            <div>
                                                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Sin movimiento reciente ({productosParadosRecientemente.length})</h4>
                                                <table style={{ width: '100%', fontSize: 13 }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Producto</th>
                                                            <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Última venta</th>
                                                            <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Stock</th>
                                                            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Valor</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {paradosRecientementePagina.map(p => (
                                                            <tr key={p.id_producto} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '6px 8px' }}>
                                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{p.nombre}</div>
                                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.sku}</div>
                                                                </td>
                                                                <td style={{ textAlign: 'center', padding: '6px 8px' }}>{diasDesde(p.ultima_venta)} días</td>
                                                                <td style={{ textAlign: 'center', padding: '6px 8px' }}>{p.stock_actual}</td>
                                                                <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700 }}>{formatCurrency(p.stock_actual * p.precio_compra)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <Paginacion paginacion={paginacionParadosRecientemente} onCambiarPagina={setPaginaSinMovimientoReciente} />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                                {/* Pie por categoria */}
                                <div className="card">
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Valor por Categoria</h3>
                                    {Object.keys(reporteInventario.porCategoria).length > 0 ? (
                                        <>
                                            <ResponsiveContainer width="100%" height={240}>
                                                <PieChart>
                                                    <Pie data={Object.entries(reporteInventario.porCategoria).map(([k, v]) => ({ name: k, value: Math.round(v.valor) }))} cx="50%" cy="50%" outerRadius={90} innerRadius={45}>
                                                        {Object.keys(reporteInventario.porCategoria).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                                    </Pie>
                                                    <Tooltip formatter={v => formatCurrency(v)} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                                                {Object.entries(reporteInventario.porCategoria).map(([k, v], i) => (
                                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#f8fafc', borderRadius: 6 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                                                            <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{k}</span>
                                                        </div>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{formatCurrency(v.valor)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : <div className="empty-state"><p>Sin datos de categorías</p></div>}
                                </div>

                                {/* Sin stock */}
                                <div className="card">
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Productos Sin Stock</h3>
                                    {reporteInventario.stockCritico.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                                            {reporteInventario.stockCritico.map(p => (
                                                <div key={p.id_producto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
                                                    <div>
                                                        <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>{p.nombre}</p>
                                                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{p.sku} • {p.categoria}</p>
                                                    </div>
                                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#dc2626', color: 'white' }}>SIN STOCK</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="empty-state">
                                            <span style={{ fontSize: 40 }}>🎉</span>
                                            <p style={{ color: '#15803d', fontWeight: 600, marginTop: 8 }}>No hay productos sin stock</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Tabla inventario */}
                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Inventario Completo</h3>
                                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{reporteInventario.paginacion.total} productos</p>
                                    </div>
                                    <button onClick={exportarInventarioPDF} disabled={exportandoInventario}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 8, cursor: exportandoInventario ? 'not-allowed' : 'pointer', color: '#7c3aed', fontSize: 13, fontWeight: 600, opacity: exportandoInventario ? 0.6 : 1 }}>
                                        <FileText size={14} /> {exportandoInventario ? 'Exportando...' : 'Exportar PDF'}
                                    </button>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="data-table" style={{ margin: 0 }}>
                                        <thead>
                                            <tr>
                                                <th>SKU</th>
                                                <th>Producto</th>
                                                <th>Categoria</th>
                                                <th style={{ textAlign: 'center' }}>Stock Tienda</th>
                                                <th style={{ textAlign: 'center' }}>Stock Almacen</th>
                                                <th style={{ textAlign: 'right' }}>P. Compra</th>
                                                <th style={{ textAlign: 'right' }}>Valor Stock</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reporteInventario.productos.map(p => (
                                                <tr key={p.id_producto} style={{ background: p.stock_actual === 0 ? '#fff5f5' : 'white' }}>
                                                    <td><span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '2px 5px', borderRadius: 4 }}>{p.sku}</span></td>
                                                    <td style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.nombre}</td>
                                                    <td><span style={{ fontSize: 11, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '2px 7px', color: '#475569' }}>{p.categoria}</span></td>
                                                    <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: p.stock_tienda === 0 ? '#dc2626' : '#1e293b' }}>{p.stock_tienda ?? 0}</td>
                                                    <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: p.stock_deposito === 0 ? '#dc2626' : '#1e293b' }}>{p.stock_deposito ?? 0}</td>
                                                    <td style={{ textAlign: 'right', fontSize: 13, color: '#64748b' }}>{formatCurrency(p.precio_compra)}</td>
                                                    <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{formatCurrency(p.stock_actual * p.precio_compra)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <Paginacion paginacion={reporteInventario.paginacion} onCambiarPagina={loadReporteInventario} />
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}