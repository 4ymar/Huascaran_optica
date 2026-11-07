import { hoyLocalNegocio, downloadExcel } from '../utils/helpers';
import { useState, useEffect, useCallback, Fragment, useMemo } from 'react';
import { Loader2, Filter, AlertCircle, History, Search, X, Calendar, Download, FileText, Shield, Clock } from 'lucide-react';
import { getLogs, getConfig } from '../services/api';
import { useToast } from '../components/Toast';
import { exportarAuditoriaPDF } from '../utils/auditoriaPDF';
import logger from '../utils/logger';

const BADGE = {
    CREAR:       { bg: '#dcfce7', color: '#166534' },
    MODIFICAR:   { bg: '#fef08a', color: '#854d0e' },
    ELIMINAR:    { bg: '#fee2e2', color: '#991b1b' },
    LOGIN:       { bg: '#dbeafe', color: '#1e40af' },
    ANULAR:      { bg: '#ffedd5', color: '#9a3412' },
    RESTAURAR:   { bg: '#ede9fe', color: '#5b21b6' },
    EXPORTAR:    { bg: '#ccfbf1', color: '#0f766e' },
    APERTURA:    { bg: '#d9f99d', color: '#3f6212' },
    CIERRE:      { bg: '#e2e8f0', color: '#334155' },
    AJUSTE_STOCK:{ bg: '#e0f2fe', color: '#075985' },
    EMITIR_CPE:      { bg: '#e0e7ff', color: '#3730a3' },
    EMITIR_NOTA:     { bg: '#fae8ff', color: '#86198f' },
    CONSULTAR_SUNAT: { bg: '#cffafe', color: '#155e75' },
    CORREGIR_CLIENTE:{ bg: '#fef3c7', color: '#92400e' },
};

// ── Reglas de actividad sospechosa ────────────────────────────
// Basado en estándares de detección de fraude en sistemas POS retail
const REGLAS_SOSPECHA = [
    {
        id: 'eliminar_masivo',
        nivel: 'alto',
        label: 'Eliminaciones masivas',
        descripcion: (u, n) => `${u} realizó ${n} eliminaciones`,
        detectar: (logsPorUsuario) => {
            const hits = [];
            Object.entries(logsPorUsuario).forEach(([u, ls]) => {
                const elim = ls.filter(l => l.accion === 'ELIMINAR');
                if (elim.length >= 3) hits.push({ usuario: u, cantidad: elim.length, logs: elim });
            });
            return hits;
        },
    },
    {
        id: 'anular_masivo',
        nivel: 'alto',
        label: 'Anulaciones masivas',
        descripcion: (u, n) => `${u} realizó ${n} anulaciones`,
        detectar: (logsPorUsuario) => {
            const hits = [];
            Object.entries(logsPorUsuario).forEach(([u, ls]) => {
                const anul = ls.filter(l => l.accion === 'ANULAR');
                if (anul.length >= 3) hits.push({ usuario: u, cantidad: anul.length, logs: anul });
            });
            return hits;
        },
    },
    {
        id: 'eliminar_anular_combo',
        nivel: 'alto',
        label: 'Combinación eliminar + anular',
        descripcion: (u, n) => `${u} combinó ${n} eliminaciones y anulaciones`,
        detectar: (logsPorUsuario) => {
            const hits = [];
            Object.entries(logsPorUsuario).forEach(([u, ls]) => {
                const combo = ls.filter(l => l.accion === 'ELIMINAR' || l.accion === 'ANULAR');
                if (combo.length >= 4) hits.push({ usuario: u, cantidad: combo.length, logs: combo });
            });
            return hits;
        },
    },
    {
        id: 'modificar_productos_masivo',
        nivel: 'medio',
        label: 'Modificaciones masivas de productos',
        descripcion: (u, n) => `${u} modificó ${n} productos`,
        detectar: (logsPorUsuario) => {
            const hits = [];
            Object.entries(logsPorUsuario).forEach(([u, ls]) => {
                const mods = ls.filter(l => l.accion === 'MODIFICAR' && l.modulo === 'PRODUCTOS');
                if (mods.length >= 5) hits.push({ usuario: u, cantidad: mods.length, logs: mods });
            });
            return hits;
        },
    },
    {
        id: 'ajuste_stock_frecuente',
        nivel: 'medio',
        label: 'Ajustes de stock frecuentes',
        descripcion: (u, n) => `${u} realizó ${n} ajustes de stock`,
        detectar: (logsPorUsuario) => {
            const hits = [];
            Object.entries(logsPorUsuario).forEach(([u, ls]) => {
                const ajustes = ls.filter(l => l.accion === 'AJUSTE_STOCK');
                if (ajustes.length >= 5) hits.push({ usuario: u, cantidad: ajustes.length, logs: ajustes });
            });
            return hits;
        },
    },
    {
        id: 'config_usuarios_modificado',
        nivel: 'medio',
        label: 'Cambios en usuarios o configuración',
        descripcion: (u) => `${u} modificó usuarios o configuración del sistema`,
        detectar: (logsPorUsuario) => {
            const hits = [];
            Object.entries(logsPorUsuario).forEach(([u, ls]) => {
                const sensibles = ls.filter(l =>
                    l.accion === 'MODIFICAR' &&
                    (l.modulo === 'USUARIOS' || l.modulo === 'CONFIGURACION')
                );
                if (sensibles.length >= 1) hits.push({ usuario: u, cantidad: sensibles.length, logs: sensibles });
            });
            return hits;
        },
    },
    {
        id: 'login_fallido_repetido',
        nivel: 'medio',
        label: 'Intentos de acceso fallidos',
        descripcion: (u, n) => `${u} tuvo ${n} intentos de login fallidos`,
        detectar: (logsPorUsuario) => {
            const hits = [];
            Object.entries(logsPorUsuario).forEach(([u, ls]) => {
                const fallidos = ls.filter(l => l.accion === 'LOGIN_FALLIDO');
                if (fallidos.length >= 3) hits.push({ usuario: u, cantidad: fallidos.length, logs: fallidos });
            });
            return hits;
        },
    },
];

const MODULOS_CAJA = ['CAJA'];

export default function Auditoria() {
    const toast = useToast();
    const [logs, setLogs]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    // Config empresa (para PDF)
    const [configEmpresa, setConfigEmpresa] = useState({});

    // Alerta de actividad sospechosa
    const [alertasSospecha,  setAlertasSospecha]  = useState([]);
    const [bannerVisible,    setBannerVisible]     = useState(false);
    const [exportandoPDF,    setExportandoPDF]     = useState(false);

    // Dropdown exportar
    const [dropdownExportar, setDropdownExportar] = useState(false);

    // Filtros — por defecto carga SOLO el día de hoy
    const [fechaDesde, setFechaDesde] = useState(hoyLocalNegocio());
    const [fechaHasta, setFechaHasta] = useState(hoyLocalNegocio());
    const [modulo,     setModulo]     = useState('');
    const [usuario,    setUsuario]    = useState('');
    const [accion,     setAccion]     = useState(''); // M6: Filtro acción
    const [busqueda,   setBusqueda]   = useState(''); // búsqueda local sobre los resultados
    const [horaDesde,  setHoraDesde]  = useState(''); // filtro local hora inicio (HH:MM)
    const [horaHasta,  setHoraHasta]  = useState(''); // filtro local hora fin   (HH:MM)

    // Opciones de selects (derivadas de los logs ya cargados — sin llamada extra)
    const [modulosUnicos,  setModulosUnicos]  = useState([]);
    const [usuariosUnicos, setUsuariosUnicos] = useState([]);

    // Fila expandida (acordeón)
    const [filaExpandida, setFilaExpandida] = useState(null);

    // Paginación
    const LIMITE = 50; // M5
    const [offset, setOffset] = useState(0);
    const [hayMas, setHayMas] = useState(false);
    const [total, setTotal]   = useState(0);

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const params = {
                limite: LIMITE,
                offset: offset,
                ...(fechaDesde && { desde: fechaDesde }),
                ...(fechaHasta && { hasta: fechaHasta }),
                ...(modulo     && { modulo }),
                ...(usuario    && { usuario }),
                ...(accion     && { accion }),
            };

            const data = await getLogs(params);
            // Compatibilidad con viejo/nuevo backend
            const raw = data.logs || (Array.isArray(data) ? data : []);

            setHayMas(data.hayMas || false);
            setTotal(data.total || 0);
            
            // Si el backend es viejo y devuelve 201 registros:
            if (Array.isArray(data)) {
                setHayMas(raw.length > LIMITE);
                setLogs(raw.slice(0, LIMITE));
            } else {
                setLogs(raw);
            }

            // Construir opciones de filtro a partir de lo que ya llegó
            const ms = [...new Set(raw.map(l => l.modulo).filter(Boolean))].sort();
            const us = [...new Set(raw.map(l => l.usuario).filter(Boolean))].sort();
            setModulosUnicos(prev => [...new Set([...prev, ...ms])]);
            setUsuariosUnicos(prev => [...new Set([...prev, ...us])]);
        } catch (err) {
            logger.error('AUDITORIA', 'Error cargando logs:', err);
            const msg = err.response?.data?.error || 'Error de conexión';
            setError(msg);
            if (err.response?.status === 403) {
                toast('Acceso denegado: se requieren permisos de administrador', 'error');
            }
        } finally {
            setLoading(false);
        }
    }, [fechaDesde, fechaHasta, modulo, usuario, accion, offset]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    // Cargar config empresa para el PDF
    useEffect(() => {
        getConfig().then(cfg => {
            if (cfg) setConfigEmpresa(cfg);
        }).catch(() => {});
    }, []);

    // Resetear página al cambiar filtros
    useEffect(() => {
        setOffset(0);
    }, [fechaDesde, fechaHasta, modulo, usuario, accion]);

    // Filtro local por texto y hora (sobre los logs ya cargados, sin otra llamada)
    const BIZ_OFFSET_MS = -300 * 60 * 1000;
    const logsFiltrados = useMemo(() => {
        let resultado = logs;

        // Búsqueda por texto libre
        if (busqueda.trim()) {
            const q = busqueda.toLowerCase();
            resultado = resultado.filter(l =>
                [l.usuario, l.accion, l.modulo, l.detalles, l.ip, l.id_referencia]
                    .join(' ').toLowerCase().includes(q)
            );
        }

        // Filtro por rango de hora (local, convirtiendo fecha_hora UTC a hora negocio UTC-5)
        if (horaDesde || horaHasta) {
            resultado = resultado.filter(l => {
                if (!l.fecha_hora) return true;
                const local = new Date(new Date(l.fecha_hora).getTime() + BIZ_OFFSET_MS);
                const hh    = String(local.getUTCHours()).padStart(2, '0');
                const min   = String(local.getUTCMinutes()).padStart(2, '0');
                const horaLog = `${hh}:${min}`;
                if (horaDesde && horaLog < horaDesde) return false;
                if (horaHasta && horaLog > horaHasta) return false;
                return true;
            });
        }

        return resultado;
    }, [logs, busqueda, horaDesde, horaHasta]);

    // Detección automática de filas sospechosas (sin banner — solo coloreo)
    const idsSospechosos = useMemo(() => {
        const porUsuario = {};
        logsFiltrados.forEach(l => {
            if (!porUsuario[l.usuario]) porUsuario[l.usuario] = [];
            porUsuario[l.usuario].push(l);
        });
        const ids = new Set();
        REGLAS_SOSPECHA.forEach(regla => {
            regla.detectar(porUsuario).forEach(hit => {
                hit.logs.forEach(l => ids.add(l.id_log));
            });
        });
        return ids;
    }, [logsFiltrados]);

    // Análisis de alerta (se ejecuta al presionar el botón)
    const analizarActividad = () => {
        const porUsuario = {};
        logsFiltrados.forEach(l => {
            if (!porUsuario[l.usuario]) porUsuario[l.usuario] = [];
            porUsuario[l.usuario].push(l);
        });
        const alertas = [];
        REGLAS_SOSPECHA.forEach(regla => {
            regla.detectar(porUsuario).forEach(hit => {
                alertas.push({
                    id:     regla.id,
                    nivel:  regla.nivel,
                    label:  regla.label,
                    texto:  regla.descripcion(hit.usuario, hit.cantidad),
                });
            });
        });
        setAlertasSospecha(alertas);
        setBannerVisible(true);
    };

    // Indicador de si los filtros de fecha son el día de hoy
    const esSoloHoy = fechaDesde === hoyLocalNegocio() && fechaHasta === hoyLocalNegocio();

    const limpiarFiltros = () => {
        setFechaDesde(hoyLocalNegocio());
        setFechaHasta(hoyLocalNegocio());
        setModulo('');
        setUsuario('');
        setAccion('');
        setBusqueda('');
        setHoraDesde('');
        setHoraHasta('');
        setOffset(0);
        setBannerVisible(false);
        setAlertasSospecha([]);
    };

    const hayFiltrosActivos = modulo || usuario || accion || !esSoloHoy;

    return (
        <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>

            {/* ── Encabezado ─────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <History size={24} style={{ color: '#6366f1' }} />
                    Auditoría del Sistema
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Analizar actividad */}
                    <button
                        onClick={analizarActividad}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 13, padding: '6px 12px', borderRadius: 6,
                            background: '#7c3aed', color: 'white', border: 'none',
                            fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        <Shield size={14} /> Analizar actividad
                    </button>

                    {/* Dropdown Exportar */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setDropdownExportar(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontSize: 13, padding: '6px 12px', borderRadius: 6,
                                background: '#6366f1', color: 'white', border: 'none',
                                fontWeight: 600, cursor: 'pointer'
                            }}
                        >
                            <Download size={14} />
                            Exportar
                            <span style={{
                                fontSize: 9, marginLeft: 2,
                                display: 'inline-block',
                                transform: dropdownExportar ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.15s',
                            }}>▼</span>
                        </button>

                        {dropdownExportar && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                                background: 'white', borderRadius: 8,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                border: '1px solid #e2e8f0',
                                minWidth: 160, zIndex: 100, overflow: 'hidden',
                            }}>
                                {/* PDF */}
                                <button
                                    disabled={exportandoPDF}
                                    onClick={async () => {
                                        setDropdownExportar(false);
                                        if (!logsFiltrados.length) { toast('No hay registros para exportar', 'warning'); return; }
                                        setExportandoPDF(true);
                                        try {
                                            await exportarAuditoriaPDF(
                                                logsFiltrados,
                                                configEmpresa,
                                                { desde: fechaDesde, hasta: fechaHasta, modulo, usuario, accion, busqueda, horaDesde, horaHasta },
                                                'admin'
                                            );
                                        } catch (err) {
                                            logger.error('AUDITORIA', 'Error PDF:', err);
                                            toast('Error al generar el PDF', 'error');
                                        } finally {
                                            setExportandoPDF(false);
                                        }
                                    }}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 14px', background: 'none', border: 'none',
                                        fontSize: 13, color: exportandoPDF ? '#94a3b8' : '#334155',
                                        cursor: exportandoPDF ? 'not-allowed' : 'pointer',
                                        borderBottom: '1px solid #f1f5f9',
                                    }}
                                    onMouseEnter={e => { if (!exportandoPDF) e.currentTarget.style.background = '#fef2f2'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                                >
                                    <FileText size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                                    {exportandoPDF ? 'Generando...' : 'Exportar PDF'}
                                </button>

                                {/* Excel */}
                                <button
                                    onClick={() => {
                                        setDropdownExportar(false);
                                        downloadExcel(
                                            logsFiltrados.map(l => ({
                                                'Fecha/Hora':  new Date(l.fecha_hora).toLocaleString('es-PE'),
                                                'Usuario':     l.usuario,
                                                'Acción':      l.accion,
                                                'Módulo':      l.modulo,
                                                'Referencia':  resolverReferencia(l) || '-',
                                                'Detalle':     l.detalles,
                                                'IP':          l.ip,
                                            })),
                                            'auditoria',
                                            'AUDITORIA',
                                            toast
                                        );
                                    }}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 14px', background: 'none', border: 'none',
                                        fontSize: 13, color: '#334155', cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                                >
                                    <Download size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                                    Exportar Excel
                                </button>
                            </div>
                        )}
                    </div>
                    {hayFiltrosActivos && (
                        <button
                            onClick={limpiarFiltros}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                                border: '1px solid #e2e8f0', background: 'white',
                                color: '#64748b', cursor: 'pointer'
                            }}
                        >
                            <X size={12} /> Limpiar filtros
                        </button>
                    )}
                </div>
            </div>

            {/* ── Banner de actividad sospechosa ─────────────────── */}
            {bannerVisible && alertasSospecha.length > 0 && (
                <div style={{
                    background: '#fef2f2', border: '1px solid #fca5a5',
                    borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                }}>
                    <Shield size={20} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 14, marginBottom: 6 }}>
                            ⚠️ {alertasSospecha.length} alerta{alertasSospecha.length !== 1 ? 's' : ''} de actividad sospechosa detectada{alertasSospecha.length !== 1 ? 's' : ''}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {alertasSospecha.map((a, i) => (
                                <span key={i} style={{
                                    fontSize: 12, padding: '3px 10px', borderRadius: 20,
                                    background: a.nivel === 'alto' ? '#fee2e2' : '#fef3c7',
                                    color:      a.nivel === 'alto' ? '#991b1b' : '#92400e',
                                    border: `1px solid ${a.nivel === 'alto' ? '#fca5a5' : '#fcd34d'}`,
                                    fontWeight: 600,
                                }}>
                                    {a.nivel === 'alto' ? '🔴' : '🟡'} {a.texto}
                                </span>
                            ))}
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#b91c1c' }}>
                            Las filas marcadas en la tabla corresponden a los registros involucrados. Si no es un error, puedes cerrar esta alerta.
                        </p>
                    </div>
                    <button
                        onClick={() => setBannerVisible(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}
                        title="Cerrar alerta"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {bannerVisible && alertasSospecha.length === 0 && (
                <div style={{
                    background: '#f0fdf4', border: '1px solid #86efac',
                    borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                    display: 'flex', gap: 12, alignItems: 'center',
                }}>
                    <Shield size={18} style={{ color: '#16a34a' }} />
                    <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                        ✅ Sin actividad sospechosa detectada en el período cargado.
                    </span>
                    <button
                        onClick={() => setBannerVisible(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', padding: 4, marginLeft: 'auto' }}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ── Barra de filtros ────────────────────────────────── */}
            <div style={{
                background: 'white', borderRadius: 10, padding: '14px 18px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.07)', marginBottom: 16,
                display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end'
            }}>
                {/* Fecha desde */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Desde</label>
                    <div style={{ position: 'relative' }}>
                        <Calendar size={14} style={{ position: 'absolute', left: 8, top: 9, color: '#94a3b8' }} />
                        <input
                            type="date"
                            value={fechaDesde}
                            onChange={e => setFechaDesde(e.target.value)}
                            style={{ ...inputStyle, paddingLeft: 28 }}
                        />
                    </div>
                </div>

                {/* Fecha hasta */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Hasta</label>
                    <div style={{ position: 'relative' }}>
                        <Calendar size={14} style={{ position: 'absolute', left: 8, top: 9, color: '#94a3b8' }} />
                        <input
                            type="date"
                            value={fechaHasta}
                            onChange={e => setFechaHasta(e.target.value)}
                            style={{ ...inputStyle, paddingLeft: 28 }}
                        />
                    </div>
                </div>

                {/* Módulo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Módulo</label>
                    <div style={{ position: 'relative' }}>
                        <Filter size={14} style={{ position: 'absolute', left: 8, top: 9, color: '#94a3b8' }} />
                        <select
                            value={modulo}
                            onChange={e => setModulo(e.target.value)}
                            style={{ ...inputStyle, paddingLeft: 28, cursor: 'pointer' }}
                        >
                            <option value="">Todos</option>
                            {modulosUnicos.map(m => (
                                <option key={m} value={m}>
                                    {MODULOS_CAJA.includes(m) ? `💰 ${m}` : m}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* M6: Acción */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Acción</label>
                    <select
                        value={accion}
                        onChange={e => setAccion(e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                        <option value="">Todas</option>
                        {Object.keys(BADGE).map(a => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>
                </div>

                {/* Usuario */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Usuario</label>
                    <select
                        value={usuario}
                        onChange={e => setUsuario(e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                        <option value="">Todos</option>
                        {usuariosUnicos.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>

                {/* Hora desde / hasta — filtro local */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>
                        <Clock size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                        Hora desde
                    </label>
                    <input
                        type="time"
                        value={horaDesde}
                        onChange={e => setHoraDesde(e.target.value)}
                        style={{ ...inputStyle, minWidth: 100 }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Hora hasta</label>
                    <input
                        type="time"
                        value={horaHasta}
                        onChange={e => setHoraHasta(e.target.value)}
                        style={{ ...inputStyle, minWidth: 100 }}
                    />
                </div>

                {/* Búsqueda local (sin llamada extra) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
                    <label style={labelStyle}>Buscar en resultados</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 8, top: 9, color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Texto libre..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            style={{ ...inputStyle, paddingLeft: 28 }}
                        />
                    </div>
                </div>

                {/* Atajos rápidos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Rápido</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[
                            { label: 'Hoy',         desde: hoyLocalNegocio(), hasta: hoyLocalNegocio() },
                            { label: 'Esta semana', desde: diasAtras(6),    hasta: hoyLocalNegocio() },
                            { label: 'Este mes',    desde: primerDiaMes(), hasta: hoyLocalNegocio() },
                        ].map(op => (
                            <button
                                key={op.label}
                                onClick={() => { setFechaDesde(op.desde); setFechaHasta(op.hasta); }}
                                style={{
                                    fontSize: 11, padding: '5px 9px', borderRadius: 6,
                                    border: '1px solid #e2e8f0',
                                    background: fechaDesde === op.desde && fechaHasta === op.hasta ? '#6366f1' : 'white',
                                    color:      fechaDesde === op.desde && fechaHasta === op.hasta ? 'white'   : '#64748b',
                                    cursor: 'pointer', whiteSpace: 'nowrap'
                                }}
                            >
                                {op.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Contador y Paginación M5 ────────────────────────── */}
            {!loading && !error && (
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <span>
                            {total === 0
                                ? 'Sin registros para este período'
                                : `${total} registro${total !== 1 ? 's' : ''} en total`
                            }
                        </span>
                        {total > 0 && (
                            <span style={{ marginLeft: 8 }}>
                                — Mostrando {offset + 1} a {Math.min(offset + LIMITE, total)}
                            </span>
                        )}
                    </div>
                    
                    {total > LIMITE && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button 
                                onClick={() => setOffset(Math.max(0, offset - LIMITE))}
                                disabled={offset === 0}
                                style={{
                                    padding: '4px 10px', borderRadius: 4, border: '1px solid #cbd5e1',
                                    background: offset === 0 ? '#f8fafc' : 'white',
                                    color: offset === 0 ? '#94a3b8' : '#334155', cursor: offset === 0 ? 'not-allowed' : 'pointer'
                                }}
                            >
                                ← Anterior
                            </button>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>
                                Página {Math.floor(offset / LIMITE) + 1} de {Math.ceil(total / LIMITE)}
                            </span>
                            <button 
                                onClick={() => setOffset(offset + LIMITE)}
                                disabled={!hayMas}
                                style={{
                                    padding: '4px 10px', borderRadius: 4, border: '1px solid #cbd5e1',
                                    background: !hayMas ? '#f8fafc' : 'white',
                                    color: !hayMas ? '#94a3b8' : '#334155', cursor: !hayMas ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Siguiente →
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Contenido ───────────────────────────────────────── */}
            {error ? (
                <div style={{ background: '#fee2e2', color: '#991b1b', padding: 16, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertCircle size={20} />
                    {error}
                </div>
            ) : loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <Loader2 size={32} style={{ margin: '0 auto 12px', display: 'block', animation: 'spin 1s linear infinite' }} />
                    Cargando registros...
                </div>
            ) : logsFiltrados.length === 0 ? (
                <div style={{
                    padding: 48, textAlign: 'center', color: '#94a3b8',
                    background: 'white', borderRadius: 10, border: '1px dashed #cbd5e1'
                }}>
                    <History size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                    <p style={{ margin: 0, fontWeight: 600 }}>Sin actividad registrada</p>
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                        {esSoloHoy
                            ? 'No hubo movimientos hoy. Prueba ampliar el rango de fechas.'
                            : 'No hay registros para los filtros seleccionados.'
                        }
                    </p>
                </div>
            ) : (
                <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                        <thead>
                            <tr style={{
                                background: '#f8fafc', borderBottom: '2px solid #e2e8f0',
                                textAlign: 'left', color: '#64748b', fontSize: 12,
                                textTransform: 'uppercase', letterSpacing: '0.05em'
                            }}>
                                <th style={thStyle}>Fecha / Hora</th>
                                <th style={thStyle}>Usuario</th>
                                <th style={thStyle}>Acción</th>
                                <th style={thStyle}>Módulo</th>
                                <th style={thStyle}>Detalle</th>
                                <th style={thStyle}>IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logsFiltrados.map((log) => {
                                const badge     = BADGE[log.accion] || { bg: '#f1f5f9', color: '#475569' };
                                const expandida = filaExpandida === log.id_log;

                                // Partir el detalle por '|' para mostrar cada segmento en su propia línea
                                const segmentos = (log.detalles || '').split('|').map(s => s.trim()).filter(Boolean);

                                const esSospechoso = idsSospechosos.has(log.id_log);
                                return (
                                    <Fragment key={log.id_log}>
                                        <tr
                                            onClick={() => setFilaExpandida(expandida ? null : log.id_log)}
                                            style={{
                                                borderBottom: expandida ? 'none' : '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                background: esSospechoso
                                                    ? (expandida ? '#fee2e2' : '#fff5f5')
                                                    : (expandida ? '#f8f7ff' : ''),
                                                borderLeft: esSospechoso ? '3px solid #ef4444' : '3px solid transparent',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => { if (!expandida) e.currentTarget.style.background = esSospechoso ? '#fee2e2' : '#fafafa'; }}
                                            onMouseLeave={e => { if (!expandida) e.currentTarget.style.background = esSospechoso ? '#fff5f5' : ''; }}
                                        >
                                            <td style={{ ...tdStyle, color: '#475569', whiteSpace: 'nowrap' }}>
                                                {new Date(log.fecha_hora).toLocaleString('es-PE', {
                                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                                                })}
                                            </td>
                                            <td style={{ ...tdStyle, fontWeight: 600, color: '#1e293b' }}>
                                                {log.usuario}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    padding: '3px 8px', borderRadius: 4, fontSize: 11,
                                                    fontWeight: 700, letterSpacing: '0.03em',
                                                    background: badge.bg, color: badge.color
                                                }}>
                                                    {log.accion}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    fontSize: 12, fontWeight: 600,
                                                    color: MODULOS_CAJA.includes(log.modulo) ? '#6366f1' : '#334155'
                                                }}>
                                                    {MODULOS_CAJA.includes(log.modulo) ? '💰' : ''} {log.modulo}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, color: '#475569', fontSize: 13, maxWidth: 300 }}>
                                                <span style={{
                                                    display: 'block', overflow: 'hidden',
                                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    color: expandida ? '#6366f1' : '#475569',
                                                    fontWeight: expandida ? 600 : 400,
                                                }}>
                                                    {segmentos[0] || '—'}
                                                </span>
                                                {!expandida && segmentos.length > 1 && (
                                                    <span style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600 }}>
                                                        +{segmentos.length - 1} más…
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ ...tdStyle, color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                    {log.ip || '—'}
                                                    <span style={{
                                                        fontSize: 11, color: expandida ? '#6366f1' : '#cbd5e1',
                                                        transition: 'transform 0.2s, color 0.2s',
                                                        display: 'inline-block',
                                                        transform: expandida ? 'rotate(180deg)' : 'rotate(0deg)',
                                                    }}>▼</span>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Fila expandida — acordeón */}
                                        {expandida && (
                                            <tr key={`${log.id_log}-detalle`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td colSpan={6} style={{ padding: '0 14px 14px 14px', background: '#f8f7ff' }}>
                                                    <div style={{
                                                        borderRadius: 10, border: '1px solid #e0e7ff',
                                                        background: 'white', overflow: 'hidden',
                                                    }}>
                                                        {/* Cabecera del detalle */}
                                                        <div style={{
                                                            padding: '8px 14px', background: '#eef2ff',
                                                            borderBottom: '1px solid #e0e7ff',
                                                            fontSize: 11, fontWeight: 700, color: '#6366f1',
                                                            textTransform: 'uppercase', letterSpacing: '0.05em'
                                                        }}>
                                                            Detalle completo
                                                        </div>

                                                                        {/* Referencia estructurada */}
                                                        {(log.id_referencia || log.tipo_referencia) && (
                                                            <div style={{
                                                                padding: '6px 14px',
                                                                borderBottom: '1px solid #e0e7ff',
                                                                display: 'flex', gap: 16, fontSize: 12,
                                                            }}>
                                                                {log.tipo_referencia && (
                                                                    <span>
                                                                        <span style={{ fontWeight: 700, color: '#6366f1' }}>Tipo: </span>
                                                                        <span style={{ color: '#475569' }}>{log.tipo_referencia}</span>
                                                                    </span>
                                                                )}
                                                                {log.id_referencia && resolverReferencia(log) && (
                                                                    <span>
                                                                        <span style={{ fontWeight: 700, color: '#6366f1' }}>Referencia: </span>
                                                                        <span style={{ color: '#334155', fontFamily: resolverReferencia(log) === log.id_referencia ? 'monospace' : 'inherit' }}>
                                                                            {resolverReferencia(log)}
                                                                        </span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Turno de caja (solo cuando tipo_referencia = SESION_CAJA y hay datos del JOIN) */}
                                                        {log.tipo_referencia === 'SESION_CAJA' && log.sesion_estado && (
                                                            <div style={{
                                                                padding: '8px 14px',
                                                                borderBottom: '1px solid #e0e7ff',
                                                                background: '#f0fdf4',
                                                            }}>
                                                                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                                                    💰 Turno de caja
                                                                </div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
                                                                    <span>
                                                                        <span style={{ fontWeight: 700, color: '#166534' }}>Estado: </span>
                                                                        <span style={{
                                                                            padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                                                            background: log.sesion_estado === 'ABIERTA' ? '#dcfce7' : '#f1f5f9',
                                                                            color:      log.sesion_estado === 'ABIERTA' ? '#166534' : '#475569',
                                                                        }}>{log.sesion_estado}</span>
                                                                    </span>
                                                                    {log.sesion_apertura && (
                                                                        <span>
                                                                            <span style={{ fontWeight: 700, color: '#166534' }}>Apertura: </span>
                                                                            <span style={{ color: '#334155' }}>
                                                                                {new Date(log.sesion_apertura).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                                                            </span>
                                                                        </span>
                                                                    )}
                                                                    {log.sesion_cierre && (
                                                                        <span>
                                                                            <span style={{ fontWeight: 700, color: '#166534' }}>Cierre: </span>
                                                                            <span style={{ color: '#334155' }}>
                                                                                {new Date(log.sesion_cierre).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                                                            </span>
                                                                        </span>
                                                                    )}
                                                                    {log.sesion_cantidad_ventas != null && (
                                                                        <span>
                                                                            <span style={{ fontWeight: 700, color: '#166534' }}>Ventas: </span>
                                                                            <span style={{ color: '#334155' }}>{log.sesion_cantidad_ventas}</span>
                                                                        </span>
                                                                    )}
                                                                    {log.sesion_total_ventas != null && (
                                                                        <span>
                                                                            <span style={{ fontWeight: 700, color: '#166534' }}>Total: </span>
                                                                            <span style={{ color: '#334155', fontWeight: 600 }}>S/ {Number(log.sesion_total_ventas).toFixed(2)}</span>
                                                                        </span>
                                                                    )}
                                                                    {log.sesion_diferencia != null && (
                                                                        <span>
                                                                            <span style={{ fontWeight: 700, color: '#166534' }}>Diferencia: </span>
                                                                            <span style={{ color: log.sesion_diferencia < 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                                                                                S/ {Number(log.sesion_diferencia).toFixed(2)}
                                                                            </span>
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Segmentos */}
                                                        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {segmentos.length === 0 ? (
                                                                <span style={{ color: '#94a3b8', fontSize: 13 }}>Sin detalles</span>
                                                            ) : segmentos.map((seg, i) => {
                                                                // Intentar separar "Clave: valor" para destacar la clave
                                                                const colonIdx = seg.indexOf(':');
                                                                const tieneDosPuntos = colonIdx > 0 && colonIdx < 40;
                                                                const clave = tieneDosPuntos ? seg.slice(0, colonIdx).trim() : null;
                                                                const valor = tieneDosPuntos ? seg.slice(colonIdx + 1).trim() : seg;

                                                                return (
                                                                    <div key={i} style={{
                                                                        display: 'flex', alignItems: 'baseline', gap: 8,
                                                                        padding: '5px 8px', borderRadius: 6,
                                                                        background: i % 2 === 0 ? '#f8fafc' : 'white',
                                                                        fontSize: 13,
                                                                    }}>
                                                                        {clave && (
                                                                            <span style={{
                                                                                fontWeight: 700, color: '#6366f1',
                                                                                whiteSpace: 'nowrap', minWidth: 120,
                                                                                fontSize: 12,
                                                                            }}>
                                                                                {clave}
                                                                            </span>
                                                                        )}
                                                                        <span style={{ color: '#334155', wordBreak: 'break-word' }}>
                                                                            {clave ? valor : seg}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── Resolver referencia legible ──────────────────────────────
function resolverReferencia(log) {
    if (!log.id_referencia) return null;
    switch (log.tipo_referencia) {
        case 'VENTA':
            return log.ref_numero_venta || log.id_referencia;
        case 'DEVOLUCION':
            return log.ref_numero_venta
                ? `Devolución de ${log.ref_numero_venta}`
                : log.id_referencia;
        case 'CLIENTE':
            return log.ref_nombre_cliente
                ? `${log.ref_nombre_cliente}${log.ref_documento_cliente ? ` (${log.ref_documento_cliente})` : ''}`
                : log.id_referencia;
        case 'USUARIO':
            return log.ref_nombre_usuario || log.ref_username || null;
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

// ── Helpers de fechas ────────────────────────────────────────
// Offset Peru UTC-5 — mismo valor que BUSINESS_UTC_OFFSET_MINUTES en helpers.js
const BIZ_OFFSET_MS_DATE = -300 * 60 * 1000;

function diasAtras(n) {
    const local = new Date(new Date().getTime() + BIZ_OFFSET_MS_DATE - n * 86400000);
    return local.getUTCFullYear() + '-' +
        String(local.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(local.getUTCDate()).padStart(2, '0');
}

function primerDiaMes() {
    const local = new Date(new Date().getTime() + BIZ_OFFSET_MS_DATE);
    return local.getUTCFullYear() + '-' +
        String(local.getUTCMonth() + 1).padStart(2, '0') + '-01';
}

// ── Estilos reutilizables ─────────────────────────────────────
const labelStyle = {
    fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.06em'
};

const inputStyle = {
    padding: '7px 10px', borderRadius: 6,
    border: '1px solid #e2e8f0', background: 'white',
    color: '#334155', fontSize: 13, outline: 'none',
    minWidth: 130
};

const thStyle = { padding: '11px 14px', fontWeight: 700 };
const tdStyle = { padding: '11px 14px' };
