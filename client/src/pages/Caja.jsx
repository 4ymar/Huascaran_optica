import { useState, useEffect, useCallback } from 'react';
import {
    Lock, Unlock, DollarSign, ArrowDownCircle, ArrowUpCircle,
    Clock, AlertTriangle, CheckCircle, XCircle, Plus, Minus,
    RefreshCw, History, Smartphone, Banknote, Receipt,
    ChevronDown, ChevronRight, TrendingUp, TrendingDown, Filter
} from 'lucide-react';
import {
    getCajaEstado, abrirCaja, cerrarCaja, getCajaResumen,
    registrarMovimientoCaja, getCajaHistorial, getCajaSesion
} from '../services/api';
import { useToast } from '../components/Toast';
import logger from '../utils/logger';

const formatMoney = (n) => `S/ ${(Number(n) || 0).toFixed(2)}`;
const formatFecha = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function Caja() {
    const toast = useToast();

    const [estado, setEstado]         = useState(null);
    const [resumen, setResumen]       = useState(null);
    const [historial, setHistorial]   = useState([]);
    const [loading, setLoading]       = useState(true);
    const [vista, setVista]           = useState('caja');
    const [sesionesExpandidas, setSesionesExpandidas] = useState({});
    const [filtroHistorial, setFiltroHistorial] = useState('todo');
    const [movimientosPorSesion, setMovimientosPorSesion] = useState({});
    const [cargandoMovimientos, setCargandoMovimientos] = useState({});
    const LIMITE_PAGINA = 10;
    const [offsetHistorial, setOffsetHistorial] = useState(0);
    const [hayMas, setHayMas]         = useState(false);
    const [cargandoMas, setCargandoMas] = useState(false);
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');

    const [modalAbrir, setModalAbrir]       = useState(false);
    const [modalCerrar, setModalCerrar]     = useState(false);
    const [modalMovimiento, setModalMovimiento] = useState(false);

    const [montoApertura, setMontoApertura]     = useState('');
    const [montoCierreReal, setMontoCierreReal] = useState('');
    const [notasCierre, setNotasCierre]         = useState('');
    const [tipoMovimiento, setTipoMovimiento]   = useState('INGRESO');
    const [montoMovimiento, setMontoMovimiento] = useState('');
    const [conceptoMov, setConceptoMov]         = useState('');

    const cargarEstado = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getCajaEstado();
            setEstado(data);
            if (data.abierta) {
                const res = await getCajaResumen();
                setResumen(res);
            } else {
                setResumen(null);
            }
        } catch (err) {
            logger.error('CAJA', 'Error al cargar estado de caja:', err);
            toast('Error al cargar estado de caja', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    const cargarHistorial = useCallback(async (reset = false) => {
        const offset = reset ? 0 : offsetHistorial;
        try {
            const params = { limite: LIMITE_PAGINA + 1, offset };
            if (fechaDesde) params.desde = fechaDesde;
            if (fechaHasta) params.hasta = fechaHasta;
            const data = await getCajaHistorial(params);
            const raw = data || [];
            const hayMasResultados = raw.length > LIMITE_PAGINA;
            const pagina = raw.slice(0, LIMITE_PAGINA).map(s => ({ ...s, movimientos: s.movimientos ?? null }));
            setHistorial(prev => reset ? pagina : [...prev, ...pagina]);
            setHayMas(hayMasResultados);
            setOffsetHistorial(offset + pagina.length);
        } catch {
            toast('Error al cargar historial', 'error');
        }
    }, [offsetHistorial, fechaDesde, fechaHasta]);

    const cargarMasHistorial = async () => {
        setCargandoMas(true);
        await cargarHistorial(false);
        setCargandoMas(false);
    };

    const aplicarFiltroFechas = () => {
        setOffsetHistorial(0); setHistorial([]); setHayMas(false);
        cargarHistorial(true);
    };

    const limpiarFiltros = () => {
        setFechaDesde(''); setFechaHasta('');
        setOffsetHistorial(0); setHistorial([]); setHayMas(false);
    };

    const cargarMovimientosSesion = useCallback(async (id_sesion) => {
        if (movimientosPorSesion[id_sesion] !== undefined) return;
        setCargandoMovimientos(prev => ({ ...prev, [id_sesion]: true }));
        try {
            const data = await getCajaSesion(id_sesion);
            const movs = data?.movimientos ?? data ?? [];
            setMovimientosPorSesion(prev => ({ ...prev, [id_sesion]: movs }));
        } catch {
            setMovimientosPorSesion(prev => ({ ...prev, [id_sesion]: [] }));
        } finally {
            setCargandoMovimientos(prev => ({ ...prev, [id_sesion]: false }));
        }
    }, [movimientosPorSesion]);

    useEffect(() => { cargarEstado(); }, [cargarEstado]);

    useEffect(() => {
        if (vista === 'historial') {
            setOffsetHistorial(0); setHistorial([]); setHayMas(false);
            cargarHistorial(true);
        }
    }, [vista]);

    const handleAbrir = async () => {
        try {
            await abrirCaja({ monto_apertura: Number(montoApertura) || 0 });
            toast('Caja abierta correctamente', 'success');
            setModalAbrir(false); setMontoApertura('');
            cargarEstado();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al abrir caja', 'error');
        }
    };

    const handleCerrar = async () => {
        try {
            const monto = Number(montoCierreReal);
            if (isNaN(monto) || montoCierreReal === '') {
                toast('Ingresa el monto que contaste en caja', 'warning'); return;
            }
            await cerrarCaja({ monto_cierre_real: monto, notas_cierre: notasCierre });
            toast('Caja cerrada correctamente', 'success');
            setModalCerrar(false); setMontoCierreReal(''); setNotasCierre('');
            cargarEstado();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al cerrar caja', 'error');
        }
    };

    const handleMovimiento = async () => {
        try {
            if (!montoMovimiento || Number(montoMovimiento) <= 0) { toast('El monto debe ser mayor a 0', 'warning'); return; }
            if (!conceptoMov.trim()) { toast('Ingresa un concepto', 'warning'); return; }
            await registrarMovimientoCaja({ tipo: tipoMovimiento, monto: Number(montoMovimiento), concepto: conceptoMov.trim() });
            toast(`${tipoMovimiento === 'INGRESO' ? 'Ingreso' : 'Egreso'} registrado`, 'success');
            setModalMovimiento(false); setMontoMovimiento(''); setConceptoMov('');
            cargarEstado();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al registrar movimiento', 'error');
        }
    };

    if (loading) return <div className="page-enter"><div className="loader"><div className="spinner" /></div></div>;

    const cajaAbierta = estado?.abierta;

    return (
        <div className="page-enter">
            {/* ── HEADER ─────────────────────────────────────── */}
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {cajaAbierta ? <Unlock size={24} style={{ color: '#10B981' }} /> : <Lock size={24} style={{ color: '#94a3b8' }} />}
                        Caja
                    </h1>
                    <p>{cajaAbierta ? 'Sesión activa — caja abierta' : 'No hay sesión activa'}</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setVista(v => v === 'caja' ? 'historial' : 'caja')}
                        style={vista === 'historial' ? { background: '#735DFF', color: 'white', borderColor: '#735DFF' } : {}}>
                        <History size={16} />{vista === 'caja' ? 'Ver historial' : 'Volver a caja'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={cargarEstado}><RefreshCw size={16} /></button>
                </div>
            </div>

            {/* ── HISTORIAL ──────────────────────────────────── */}
            {vista === 'historial' && (
                <div style={{ animation: 'slideUp 0.3s ease' }}>
                    <div className="card" style={{ padding: '14px 18px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Desde</label>
                                <input type="date" className="form-input" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.82rem', minWidth: 140 }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hasta</label>
                                <input type="date" className="form-input" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.82rem', minWidth: 140 }} />
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={aplicarFiltroFechas} style={{ height: 36, padding: '0 16px' }}>
                                <Filter size={14} /> Buscar
                            </button>
                            {(fechaDesde || fechaHasta) && (
                                <button className="btn btn-secondary btn-sm" onClick={limpiarFiltros} style={{ height: 36, padding: '0 14px' }}>
                                    <XCircle size={14} /> Limpiar
                                </button>
                            )}
                            <div style={{ width: 1, background: '#e2e8f0', alignSelf: 'stretch', margin: '0 4px' }} />
                            {[{ key: 'todo', label: 'Todos' }, { key: 'movimientos', label: 'Con movimientos' }].map(f => (
                                <button key={f.key} onClick={() => { setFiltroHistorial(f.key); if (f.key === 'movimientos') historial.forEach(s => cargarMovimientosSesion(s.id_sesion)); }}
                                    style={{ height: 36, padding: '0 14px', background: filtroHistorial === f.key ? '#735DFF' : 'transparent', color: filtroHistorial === f.key ? 'white' : '#64748b', border: `1px solid ${filtroHistorial === f.key ? '#735DFF' : '#e2e8f0'}`, borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {historial.length === 0 ? (
                        <div className="card"><div className="empty-state"><History size={48} /><p>No hay registros de caja{(fechaDesde || fechaHasta) ? ' en ese período' : ''}</p></div></div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {historial.map((s, idx) => {
                                const expandida  = sesionesExpandidas[s.id_sesion];
                                const movimientos = (s.movimientos && s.movimientos.length > 0) ? s.movimientos : (movimientosPorSesion[s.id_sesion] || []);
                                const cargando   = cargandoMovimientos[s.id_sesion];
                                const ingresos   = movimientos.filter(m => m.tipo === 'INGRESO');
                                const egresos    = movimientos.filter(m => m.tipo === 'EGRESO' || m.tipo === 'RETIRO');
                                const totalIngresos = ingresos.reduce((a, m) => a + Number(m.monto), 0);
                                const totalEgresos  = egresos.reduce((a, m)  => a + Number(m.monto), 0);
                                const numRegistro   = String(idx + 1).padStart(3, '0');
                                const apertura   = s.fecha_apertura ? new Date(s.fecha_apertura) : null;
                                const fechaCorta = apertura ? apertura.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                                const horaApertura = apertura ? apertura.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';
                                const horaCierre = s.fecha_cierre ? new Date(s.fecha_cierre).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : null;
                                const yaIntentoCarga = movimientosPorSesion[s.id_sesion] !== undefined;
                                if (filtroHistorial === 'movimientos' && yaIntentoCarga && movimientos.length === 0) return null;
                                if (filtroHistorial === 'movimientos' && !yaIntentoCarga && !cargando) return null;

                                return (
                                    <div key={s.id_sesion} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                        {/* Cabecera clicable */}
                                        <div onClick={() => { const abriendo = !expandida; setSesionesExpandidas(prev => ({ ...prev, [s.id_sesion]: abriendo })); if (abriendo) cargarMovimientosSesion(s.id_sesion); }}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', cursor: 'pointer', background: expandida ? 'rgba(115,93,255,0.04)' : 'white', borderBottom: expandida ? '1px solid #f1f5f9' : 'none', transition: 'background 0.15s' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                                <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: s.estado === 'ABIERTA' ? 'rgba(16,185,129,0.12)' : 'rgba(115,93,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {s.estado === 'ABIERTA' ? <Unlock size={18} style={{ color: '#10B981' }} /> : <Lock size={18} style={{ color: '#735DFF' }} />}
                                                </div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1D1136' }}>Registro de Caja #{numRegistro}</span>
                                                        <span className={`badge ${s.estado === 'ABIERTA' ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.67rem' }}>{s.estado === 'ABIERTA' ? 'En curso' : 'Cerrado'}</span>
                                                        {movimientos.length > 0 && <span style={{ fontSize: '0.67rem', fontWeight: 600, background: 'rgba(115,93,255,0.1)', color: '#735DFF', padding: '2px 9px', borderRadius: 20 }}>{movimientos.length} mov.</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: 2 }}>
                                                        <Clock size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                                                        {fechaCorta}{horaApertura ? ` · ${horaApertura}` : ''}{horaCierre ? ` → ${horaCierre}` : ''}{s.usuario ? ` · ${s.usuario}` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.67rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ventas</div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1D1136' }}>{formatMoney(s.total_ventas)}</div>
                                                </div>
                                                {(totalIngresos > 0 || totalEgresos > 0) && (
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.67rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Efectivo</div>
                                                        <div style={{ fontSize: '0.8rem', display: 'flex', gap: 4 }}>
                                                            {totalIngresos > 0 && <span style={{ color: '#10B981', fontWeight: 700 }}>+{formatMoney(totalIngresos)}</span>}
                                                            {totalEgresos  > 0 && <span style={{ color: '#FF4B6C', fontWeight: 700 }}>-{formatMoney(totalEgresos)}</span>}
                                                        </div>
                                                    </div>
                                                )}
                                                {s.diferencia != null && (
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.67rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Diferencia</div>
                                                        <span className={`badge ${s.diferencia > 0.009 ? 'badge-info' : s.diferencia < -0.009 ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.72rem' }}>
                                                            {s.diferencia > 0.009 ? '+' : ''}{formatMoney(s.diferencia)}
                                                        </span>
                                                    </div>
                                                )}
                                                <div style={{ color: '#94a3b8' }}>{expandida ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</div>
                                            </div>
                                        </div>

                                        {/* Detalle expandido */}
                                        {expandida && (
                                            <div style={{ padding: '16px 18px', background: '#fafbfc' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                                    {/* Resumen numérico */}
                                                    <div style={{ background: 'white', borderRadius: 10, padding: 16, border: '1px solid #f1f5f9' }}>
                                                        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Resumen del registro</p>
                                                        {[
                                                            { label: 'Fondo inicial',           valor: s.monto_apertura,    color: '#735DFF' },
                                                            { label: `Ventas (${s.cantidad_ventas ?? 0})`, valor: s.total_ventas, color: '#10B981' },
                                                            { label: 'Efectivo ventas',         valor: s.total_efectivo,    color: '#10B981' },
                                                            { label: 'Yape/Plin ventas',        valor: s.total_yape_plin,   color: '#C516E1' },
                                                            { label: 'Monto esperado en caja',  valor: s.monto_esperado,    color: '#F59E0B', bold: true },
                                                            { label: 'Contado en caja',         valor: s.monto_cierre_real, color: '#1D1136', bold: true },
                                                        ].map(row => (
                                                            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8f9fa' }}>
                                                                <span style={{ fontSize: '0.81rem', color: '#64748b' }}>{row.label}</span>
                                                                <span style={{ fontSize: '0.84rem', fontWeight: row.bold ? 800 : 600, color: row.color }}>
                                                                    {row.valor != null ? formatMoney(row.valor) : '—'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {s.notas_cierre && (
                                                            <div style={{ marginTop: 10, padding: '8px 10px', background: '#f8f9fa', borderRadius: 8 }}>
                                                                <p style={{ fontSize: '0.69rem', color: '#94a3b8', marginBottom: 2 }}>Notas de cierre</p>
                                                                <p style={{ fontSize: '0.81rem', color: '#475569' }}>{s.notas_cierre}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Movimientos de efectivo */}
                                                    <div style={{ background: 'white', borderRadius: 10, padding: 16, border: '1px solid #f1f5f9' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingresos y retiros de efectivo</p>
                                                            {movimientos.length > 0 && (
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    {totalIngresos > 0 && <span style={{ fontSize: '0.69rem', fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 20 }}>+{formatMoney(totalIngresos)}</span>}
                                                                    {totalEgresos  > 0 && <span style={{ fontSize: '0.69rem', fontWeight: 700, color: '#FF4B6C', background: 'rgba(255,75,108,0.1)',  padding: '2px 8px', borderRadius: 20 }}>-{formatMoney(totalEgresos)}</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {cargando ? (
                                                            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}><div className="spinner" style={{ width: 20, height: 20, margin: '0 auto 8px' }} /><p style={{ fontSize: '0.78rem' }}>Cargando movimientos…</p></div>
                                                        ) : movimientos.length === 0 ? (
                                                            <div style={{ textAlign: 'center', padding: '28px 0', color: '#94a3b8' }}><DollarSign size={28} style={{ opacity: 0.2, marginBottom: 8 }} /><p style={{ fontSize: '0.79rem' }}>Sin ingresos ni retiros manuales</p></div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                {movimientos.map((m, midx) => {
                                                                    const esIngreso = m.tipo === 'INGRESO';
                                                                    return (
                                                                        <div key={m.id_movimiento_caja ?? midx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 10, background: esIngreso ? 'rgba(16,185,129,0.06)' : 'rgba(255,75,108,0.06)', border: `1px solid ${esIngreso ? 'rgba(16,185,129,0.16)' : 'rgba(255,75,108,0.16)'}` }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: esIngreso ? 'rgba(16,185,129,0.15)' : 'rgba(255,75,108,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                                    {esIngreso ? <ArrowDownCircle size={15} style={{ color: '#10B981' }} /> : <ArrowUpCircle size={15} style={{ color: '#FF4B6C' }} />}
                                                                                </div>
                                                                                <div>
                                                                                    <p style={{ fontSize: '0.83rem', fontWeight: 600, color: '#1D1136' }}>{m.concepto || (esIngreso ? 'Ingreso de efectivo' : 'Retiro de efectivo')}</p>
                                                                                    <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 1 }}>
                                                                                        {esIngreso ? 'Ingreso' : 'Retiro'}
                                                                                        {m.medio_pago && m.medio_pago !== 'EFECTIVO' ? ` · ${m.medio_pago === 'YAPE_PLIN' ? 'Yape/Plin' : m.medio_pago}` : ''}
                                                                                        {m.fecha_hora ? ` · ${new Date(m.fecha_hora).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                                                                                        {m.usuario ? ` · ${m.usuario}` : ''}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                            <span style={{ fontWeight: 800, fontSize: '0.91rem', whiteSpace: 'nowrap', color: esIngreso ? '#10B981' : '#FF4B6C' }}>
                                                                                {esIngreso ? '+' : '-'}{formatMoney(m.monto)}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {hayMas && (
                                <div style={{ textAlign: 'center', paddingTop: 4 }}>
                                    <button className="btn btn-secondary" onClick={cargarMasHistorial} disabled={cargandoMas} style={{ minWidth: 180 }}>
                                        {cargandoMas ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Cargando…</> : <><History size={15} /> Cargar más registros</>}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── VISTA CAJA ─────────────────────────────────── */}
            {vista === 'caja' && (
                <>
                    {/* Caja cerrada */}
                    {!cajaAbierta && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 24, animation: 'slideUp 0.3s ease' }}>
                            <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(115,93,255,0.1), rgba(197,22,225,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Lock size={40} style={{ color: '#735DFF' }} />
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1D1136', marginBottom: 8 }}>Caja cerrada</h2>
                                <p style={{ color: '#64748b', maxWidth: 400, lineHeight: 1.6 }}>Para comenzar a registrar ventas en esta sesión, abre la caja ingresando el monto inicial de efectivo.</p>
                            </div>
                            <button className="btn btn-primary btn-lg" onClick={() => setModalAbrir(true)}><Unlock size={20} /> Abrir caja</button>
                        </div>
                    )}

                    {/* Caja abierta */}
                    {cajaAbierta && resumen && (
                        <div style={{ animation: 'slideUp 0.3s ease' }}>
                            {/* KPI Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                                <div className="kpi-card purple">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monto apertura</p>
                                            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1D1136', marginTop: 4 }}>{formatMoney(resumen.sesion.monto_apertura)}</p>
                                        </div>
                                        <div className="kpi-icon purple"><Banknote size={22} /></div>
                                    </div>
                                </div>
                                <div className="kpi-card green">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total ventas</p>
                                            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1D1136', marginTop: 4 }}>{formatMoney(resumen.totales.total_ventas)}</p>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{resumen.totales.cantidad_ventas} operaciones</p>
                                        </div>
                                        <div className="kpi-icon green"><Receipt size={22} /></div>
                                    </div>
                                </div>
                                <div className="kpi-card gold">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monto esperado</p>
                                            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1D1136', marginTop: 4 }}>{formatMoney(resumen.monto_esperado)}</p>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>Efectivo en caja</p>
                                        </div>
                                        <div className="kpi-icon gold"><DollarSign size={22} /></div>
                                    </div>
                                </div>
                                <div className="kpi-card coral">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sesión iniciada</p>
                                            <p style={{ fontSize: '1rem', fontWeight: 700, color: '#1D1136', marginTop: 4 }}>{formatFecha(resumen.sesion.fecha_apertura)}</p>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>por {resumen.sesion.usuario}</p>
                                        </div>
                                        <div className="kpi-icon coral"><Clock size={22} /></div>
                                    </div>
                                </div>
                            </div>

                            {/* Desglose por medio de pago + acciones */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                                {/* Desglose — SIN tarjeta, CON yape/plin */}
                                <div className="card">
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: '#1D1136' }}>Desglose por medio de pago</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {[
                                            { label: 'Efectivo',       valor: resumen.totales.total_efectivo,  icon: Banknote,   color: '#10B981', bg: 'rgba(16,185,129,0.06)' },
                                            { label: 'Yape / Plin',    valor: resumen.totales.total_yape_plin, icon: Smartphone, color: '#C516E1', bg: 'rgba(197,22,225,0.06)' },
                                            { label: 'Transferencia',  valor: resumen.totales.total_otros,     icon: DollarSign, color: '#F59E0B', bg: 'rgba(245,158,11,0.06)' },
                                        ].map(item => {
                                            const val = Number(item.valor) || 0;
                                            const activo = val > 0;
                                            return (
                                                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: activo ? item.bg : 'rgba(0,0,0,0.01)', border: `1px solid ${activo ? item.color + '30' : 'rgba(0,0,0,0.04)'}`, opacity: activo ? 1 : 0.5, transition: 'all 0.2s' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <item.icon size={17} style={{ color: activo ? item.color : '#94a3b8' }} />
                                                        <span style={{ fontSize: '0.865rem', fontWeight: activo ? 600 : 400, color: activo ? '#1D1136' : '#94a3b8' }}>{item.label}</span>
                                                    </div>
                                                    <span style={{ fontWeight: activo ? 800 : 500, fontSize: '0.92rem', color: activo ? item.color : '#cbd5e1' }}>{formatMoney(val)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {(resumen.manuales.ingresos > 0 || resumen.manuales.egresos > 0) && (
                                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                                            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Ingresos / Retiros manuales</p>
                                            {resumen.manuales.ingresos > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                                                    <span style={{ color: '#10B981', fontSize: '0.855rem', fontWeight: 600 }}>+ Ingresos de efectivo</span>
                                                    <span style={{ fontWeight: 700, color: '#10B981' }}>{formatMoney(resumen.manuales.ingresos)}</span>
                                                </div>
                                            )}
                                            {resumen.manuales.egresos > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                                                    <span style={{ color: '#FF4B6C', fontSize: '0.855rem', fontWeight: 600 }}>− Retiros de efectivo</span>
                                                    <span style={{ fontWeight: 700, color: '#FF4B6C' }}>{formatMoney(resumen.manuales.egresos)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Acciones */}
                                <div className="card">
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: '#1D1136' }}>Acciones</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <button className="btn btn-success" style={{ width: '100%', justifyContent: 'center', padding: '14px 20px' }} onClick={() => { setTipoMovimiento('INGRESO'); setModalMovimiento(true); }}>
                                            <ArrowDownCircle size={18} /> Registrar ingreso de efectivo
                                        </button>
                                        <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center', padding: '14px 20px' }} onClick={() => { setTipoMovimiento('EGRESO'); setModalMovimiento(true); }}>
                                            <ArrowUpCircle size={18} /> Registrar retiro de efectivo
                                        </button>
                                        <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                                        <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: '14px 20px', background: 'linear-gradient(135deg, #1D1136, #2a1b4e)', color: 'white', boxShadow: '0 2px 8px rgba(29,17,54,0.3)' }} onClick={() => setModalCerrar(true)}>
                                            <Lock size={18} /> Cerrar caja
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Ventas de la sesión */}
                            <div className="card">
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: '#1D1136' }}>Ventas de esta sesión ({resumen.ventas.length})</h3>
                                {resumen.ventas.length === 0 ? (
                                    <div className="empty-state" style={{ padding: 32 }}><Receipt size={36} /><p style={{ marginTop: 8 }}>Aún no hay ventas en esta sesión</p></div>
                                ) : (
                                    <table className="data-table">
                                        <thead><tr><th>N° Venta</th><th>Hora</th><th>Cliente</th><th>Forma pago</th><th>Total</th><th>Estado</th></tr></thead>
                                        <tbody>
                                            {resumen.ventas.map(v => (
                                                <tr key={v.id_venta}>
                                                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v.numero_venta}</td>
                                                    <td style={{ fontSize: '0.8rem' }}>{new Date(v.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</td>
                                                    <td>{v.cliente || '—'}</td>
                                                    <td>
                                                        <span className="badge badge-info">
                                                            {v.forma_pago === 'YAPE_PLIN' ? '📱 Yape/Plin'
                                                             : v.forma_pago === 'TRANSFERENCIA' ? '🏦 Transferencia'
                                                             : v.forma_pago === 'MIXTO' ? '🔀 Mixto'
                                                             : v.forma_pago === 'CREDITO' ? '📋 Fiado'
                                                             : v.forma_pago === 'EFECTIVO' ? '💵 Efectivo'
                                                             : v.forma_pago}
                                                        </span>
                                                        {v.forma_pago === 'MIXTO' && (
                                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3, lineHeight: 1.4 }}>
                                                                <span style={{ color: '#10B981', fontWeight: 600 }}>Ef. {formatMoney(v.monto_efectivo)}</span>
                                                                <span style={{ margin: '0 3px', color: '#cbd5e1' }}>+</span>
                                                                <span style={{ color: '#C516E1', fontWeight: 600 }}>Yp. {formatMoney(v.monto_yape_plin)}</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontWeight: 700 }}>{formatMoney(v.total)}</td>
                                                    <td><span className={`badge ${v.estado === 'ACTIVA' ? 'badge-success' : 'badge-danger'}`}>{v.estado}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Movimientos manuales */}
                            {resumen.movimientos.length > 0 && (
                                <div className="card" style={{ marginTop: 20 }}>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: '#1D1136' }}>Movimientos manuales de efectivo</h3>
                                    <table className="data-table">
                                        <thead><tr><th>Hora</th><th>Tipo</th><th>Concepto</th><th>Monto</th></tr></thead>
                                        <tbody>
                                            {resumen.movimientos.map(m => (
                                                <tr key={m.id_movimiento_caja}>
                                                    <td style={{ fontSize: '0.8rem' }}>{new Date(m.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</td>
                                                    <td><span className={`badge ${m.tipo === 'INGRESO' ? 'badge-success' : 'badge-danger'}`}>{m.tipo === 'INGRESO' ? <Plus size={12} /> : <Minus size={12} />}{m.tipo}</span></td>
                                                    <td>{m.concepto}</td>
                                                    <td style={{ fontWeight: 700, color: m.tipo === 'INGRESO' ? '#10B981' : '#FF4B6C' }}>{m.tipo === 'INGRESO' ? '+' : '-'} {formatMoney(m.monto)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ══ Modales ════════════════════════════════════════ */}

            {/* Abrir caja */}
            {modalAbrir && (
                <div className="modal-overlay" onClick={() => setModalAbrir(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Unlock size={20} style={{ color: '#10B981' }} /> Abrir caja</h2>
                            <button onClick={() => setModalAbrir(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <label className="form-label">Monto inicial de efectivo</label>
                            <input type="number" className="form-input" placeholder="0.00" value={montoApertura} onChange={e => setMontoApertura(e.target.value)} autoFocus min="0" step="0.10" style={{ fontSize: '1.25rem', fontWeight: 700, textAlign: 'center' }} />
                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 6 }}>El monto con el que arrancas la caja (billetes + monedas)</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setModalAbrir(false)}>Cancelar</button>
                            <button className="btn btn-success" onClick={handleAbrir}><Unlock size={16} /> Abrir caja</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cerrar caja */}
            {modalCerrar && resumen && (
                <div className="modal-overlay" onClick={() => setModalCerrar(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Lock size={20} style={{ color: '#FF4B6C' }} /> Cerrar caja</h2>
                            <button onClick={() => setModalCerrar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
                        </div>

                        <div style={{ background: '#f8f7ff', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 10, textTransform: 'uppercase' }}>Resumen de la sesión</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Apertura</span><p style={{ fontWeight: 700 }}>{formatMoney(resumen.sesion.monto_apertura)}</p></div>
                                <div><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Ventas ({resumen.totales.cantidad_ventas})</span><p style={{ fontWeight: 700 }}>{formatMoney(resumen.totales.total_ventas)}</p></div>
                                <div><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Efectivo ventas</span><p style={{ fontWeight: 700 }}>{formatMoney(resumen.totales.total_efectivo)}</p></div>
                                <div><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Yape/Plin ventas</span><p style={{ fontWeight: 700, color: '#C516E1' }}>{formatMoney(resumen.totales.total_yape_plin)}</p></div>
                                <div><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Transferencia</span><p style={{ fontWeight: 700, color: '#F59E0B' }}>{formatMoney(resumen.totales.total_otros)}</p></div>
                                <div style={{ gridColumn: '1 / -1' }}><span style={{ fontSize: '0.75rem', color: '#10B981' }}>Monto esperado (efectivo)</span><p style={{ fontWeight: 800, color: '#10B981', fontSize: '1.1rem' }}>{formatMoney(resumen.monto_esperado)}</p></div>
                            </div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label className="form-label">¿Cuánto contaste en caja? (efectivo real)</label>
                            <input type="number" className="form-input" placeholder="0.00" value={montoCierreReal} onChange={e => setMontoCierreReal(e.target.value)} autoFocus min="0" step="0.10" style={{ fontSize: '1.25rem', fontWeight: 700, textAlign: 'center' }} />
                        </div>

                        {montoCierreReal !== '' && (
                            <div style={{ padding: 12, borderRadius: 10, marginBottom: 16, textAlign: 'center', background: (() => { const d = Number(montoCierreReal) - resumen.monto_esperado; if (Math.abs(d) < 0.10) return 'rgba(16,185,129,0.1)'; if (d > 0) return 'rgba(115,93,255,0.1)'; return 'rgba(255,75,108,0.1)'; })() }}>
                                {(() => {
                                    const diff = Number(montoCierreReal) - resumen.monto_esperado;
                                    if (Math.abs(diff) < 0.10) return <span style={{ color: '#10B981', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircle size={18} /> Cuadra exacto</span>;
                                    if (diff > 0) return <span style={{ color: '#735DFF', fontWeight: 700 }}>Sobrante: +{formatMoney(diff)}</span>;
                                    return <span style={{ color: '#FF4B6C', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><AlertTriangle size={18} /> Faltante: {formatMoney(diff)}</span>;
                                })()}
                            </div>
                        )}

                        <div style={{ marginBottom: 20 }}>
                            <label className="form-label">Notas de cierre (opcional)</label>
                            <textarea className="form-input" rows={2} placeholder="Observaciones..." value={notasCierre} onChange={e => setNotasCierre(e.target.value)} />
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setModalCerrar(false)}>Cancelar</button>
                            <button className="btn btn-danger" onClick={handleCerrar} disabled={montoCierreReal === ''}><Lock size={16} /> Cerrar caja</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Movimiento manual */}
            {modalMovimiento && (
                <div className="modal-overlay" onClick={() => setModalMovimiento(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {tipoMovimiento === 'INGRESO' ? <ArrowDownCircle size={20} style={{ color: '#10B981' }} /> : <ArrowUpCircle size={20} style={{ color: '#FF4B6C' }} />}
                                {tipoMovimiento === 'INGRESO' ? 'Ingreso de efectivo' : 'Retiro de efectivo'}
                            </h2>
                            <button onClick={() => setModalMovimiento(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>✕</button>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label className="form-label">Monto</label>
                            <input type="number" className="form-input" placeholder="0.00" value={montoMovimiento} onChange={e => setMontoMovimiento(e.target.value)} autoFocus min="0.10" step="0.10" style={{ fontSize: '1.1rem', fontWeight: 700, textAlign: 'center' }} />
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <label className="form-label">Concepto</label>
                            <input type="text" className="form-input" placeholder={tipoMovimiento === 'INGRESO' ? 'Ej: Cambio de billetes' : 'Ej: Retiro parcial de caja'} value={conceptoMov} onChange={e => setConceptoMov(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setModalMovimiento(false)}>Cancelar</button>
                            <button className={`btn ${tipoMovimiento === 'INGRESO' ? 'btn-success' : 'btn-danger'}`} onClick={handleMovimiento}>
                                {tipoMovimiento === 'INGRESO' ? <Plus size={16} /> : <Minus size={16} />}
                                Registrar {tipoMovimiento === 'INGRESO' ? 'ingreso' : 'retiro'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
