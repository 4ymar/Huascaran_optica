import { useState, useEffect, useRef } from 'react';
import { getDashboard, getPublicConfig } from '../services/api';
import { formatCurrency, formatDateTime } from '../utils/helpers';
import {
    TrendingUp, TrendingDown, ShoppingCart, AlertTriangle, DollarSign, Package,
    RefreshCw, AlertCircle, CheckCircle2, Receipt, Sunrise, Sun, Moon, Info, Users
} from 'lucide-react';
import { ComposedChart, Bar, Line, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import logger from '../utils/logger';

// Zona horaria del negocio — Perú no usa horario de verano, así que el
// offset es fijo. Se calcula explícitamente para no depender de la
// configuración de zona horaria del dispositivo donde corra la app.
function getHoraPeru(date) {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', hour: 'numeric', hourCycle: 'h23' }).format(date));
}

// Frase en lenguaje llano para variaciones de ventas (vs. ayer / vs. mismo
// tramo del mes anterior). `null` significa que no hay base de comparación
// confiable (ver UMBRAL_MINIMO_COMPARACION en el backend).
function fraseVariacionVentas(valor, comparadoCon) {
    if (valor === null || valor === undefined) {
        return { texto: 'Sin datos suficientes para comparar', color: COLORS.textMuted, Icon: null };
    }
    const positivo = valor >= 0;
    return {
        texto: `Vendiste ${Math.abs(valor).toFixed(1)}% ${positivo ? 'más' : 'menos'} que ${comparadoCon}`,
        color: positivo ? COLORS.success : COLORS.danger,
        Icon: positivo ? TrendingUp : TrendingDown,
    };
}

// Frase en lenguaje llano para la variación de margen (viene en puntos
// porcentuales del backend). Se traduce a "soles ganados por cada 100
// vendidos" porque "puntos porcentuales" no es un término común para
// alguien sin formación contable.
function fraseVariacionMargen(valorPP) {
    if (valorPP === null || valorPP === undefined) {
        return { texto: 'Sin datos suficientes para comparar', color: COLORS.textMuted, Icon: null };
    }
    const positivo = valorPP >= 0;
    return {
        texto: `Ganas S/ ${Math.abs(valorPP).toFixed(1)} ${positivo ? 'más' : 'menos'} por cada S/100 que vendes, vs. el mes pasado`,
        color: positivo ? COLORS.success : COLORS.danger,
        Icon: positivo ? TrendingUp : TrendingDown,
    };
}

// Semáforo cualitativo del margen. Umbrales genéricos para negocios tipo
// bodega/ferretería — ajustables si tienes una referencia más precisa
// para tu rubro específico.
function nivelMargen(margen) {
    if (margen >= 30) return { texto: 'Excelente', color: COLORS.success, bg: COLORS.successLight, border: COLORS.successBorder };
    if (margen >= 15) return { texto: 'Bueno', color: COLORS.warning, bg: COLORS.warningLight, border: COLORS.warningBorder };
    return { texto: 'Bajo', color: COLORS.danger, bg: COLORS.dangerLight, border: COLORS.dangerBorder };
}

// Tokens de color — alineados al color de marca GiraDevs (#735DFF)
const COLORS = {
    primary: '#735DFF',
    primaryLight: '#F1EEFF',
    primaryBorder: '#DDD3FF',
    info: '#1AA082',
    infoLight: '#F0FDF9',
    infoBorder: '#A7F3D0',
    success: '#15803D',
    successLight: '#F0FDF4',
    successBorder: '#BBF7D0',
    warning: '#D97706',
    warningLight: '#FFFBEB',
    warningBorder: '#FDE68A',
    danger: '#DC2626',
    dangerLight: '#FEF2F2',
    dangerBorder: '#FECACA',
    textPrimary: '#1E293B',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    border: '#E2E8F0',
};

// Escala de intensidad del color de marca, usada para el ranking de Top Productos.
// En vez de 5 colores arbitrarios, el rango de saturación comunica la posición.
const RANK_TINTS = [
    'rgba(115, 93, 255, 1)', // #1 — color de marca, único acento
    '#14B8A6', // #2
    '#64748B', // #3
    '#94A3B8', // #4
    '#CBD5E1', // #5
];

const LeyendaVentas = () => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textSecondary }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS.info, display: 'inline-block' }} />
            Ventas del día
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textSecondary }}>
            <span style={{ width: 16, height: 0, borderTop: `2.5px solid ${COLORS.warning}`, display: 'inline-block' }} />
            Promedio móvil (7d)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textSecondary }}>
            <span style={{ width: 16, height: 0, borderTop: `2px dashed ${COLORS.textMuted}`, display: 'inline-block' }} />
            Semana anterior
        </span>
    </div>
);

const METRICAS_TOP = [
    { key: 'cantidad', label: 'Unidades', formato: v => `${v} uds` },
    { key: 'total',    label: 'Ventas S/', formato: v => formatCurrency(v) },
    { key: 'utilidad', label: 'Utilidad',  formato: v => formatCurrency(v) },
    { key: 'margen',   label: 'Margen %',  formato: v => `${v.toFixed(1)}%` },
];
const METRICAS_TOP_CLIENTES = [
    { key: 'numeroCompras', label: 'Compras',  formato: v => `${v} compras` },
    { key: 'total',         label: 'Monto S/', formato: v => formatCurrency(v) },
    { key: 'utilidad',      label: 'Utilidad', formato: v => formatCurrency(v) },
    { key: 'margen',        label: 'Margen %', formato: v => `${v.toFixed(1)}%` },
];

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ background: 'white', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <p style={{ fontSize: 12, color: COLORS.textSecondary, margin: '0 0 6px' }}>{label}</p>
                {payload.map((p, i) => (
                    <p key={i} style={{ fontSize: 13, fontWeight: 700, color: p.color, margin: i === 0 ? 0 : '2px 0 0' }}>
                        {p.name}: {formatCurrency(p.value)}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

function DashboardSkeleton({ mostrarAvisoLargo }) {
    return (
        <div className="page-enter">
            <div style={{ marginBottom: 24 }}>
                <div className="skeleton skeleton-text" style={{ width: 220, marginBottom: 10 }} />
                <div className="skeleton skeleton-text" style={{ width: 280, height: 28 }} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="kpi-card">
                        <div className="skeleton skeleton-text" style={{ width: '60%', marginBottom: 12 }} />
                        <div className="skeleton skeleton-text" style={{ width: '80%', height: 24, marginBottom: 8 }} />
                        <div className="skeleton skeleton-text" style={{ width: '50%' }} />
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                <div className="card">
                    <div className="skeleton skeleton-text" style={{ width: 160, marginBottom: 16 }} />
                    <div className="skeleton" style={{ width: '100%', height: 240 }} />
                </div>
                <div className="card">
                    <div className="skeleton skeleton-text" style={{ width: 140, marginBottom: 16 }} />
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="skeleton skeleton-text" style={{ width: '100%', marginBottom: 10 }} />
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="card">
                        <div className="skeleton skeleton-text" style={{ width: 150, marginBottom: 16 }} />
                        {[...Array(3)].map((_, j) => (
                            <div key={j} className="skeleton" style={{ width: '100%', height: 48, marginBottom: 8 }} />
                        ))}
                    </div>
                ))}
            </div>
            {mostrarAvisoLargo && (
                <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 16 }}>
                    Esto puede tardar unos segundos la primera vez que abres el sistema…
                </p>
            )}
        </div>
    );
}

export default function Dashboard() {
    const [data, setData] = useState(null);
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [reloj, setReloj] = useState(new Date());
    const [justRefreshed, setJustRefreshed] = useState(false);
    const [metricaTop, setMetricaTop] = useState('cantidad');
    const [metricaCliente, setMetricaCliente] = useState('numeroCompras');
    const [tarjetasVolteadas, setTarjetasVolteadas] = useState({});
    const justRefreshedTimeout = useRef(null);
    const [cargaLarga, setCargaLarga] = useState(false);

    useEffect(() => {
        if (!loading) { setCargaLarga(false); return; }
        const t = setTimeout(() => setCargaLarga(true), 2500);
        return () => clearTimeout(t);
    }, [loading]);

    const voltearTarjeta = (i) => {
        setTarjetasVolteadas(prev => ({ ...prev, [i]: !prev[i] }));
    };

    // Reloj en vivo del header (también se usa para el saludo)
    useEffect(() => {
        const id = setInterval(() => setReloj(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    // Limpieza del temporizador del aviso "recién actualizado" al desmontar
    useEffect(() => {
        return () => { if (justRefreshedTimeout.current) clearTimeout(justRefreshedTimeout.current); };
    }, []);

    const cargarDatos = () => {
        if (refreshing) return;
        setRefreshing(true);
        Promise.all([getDashboard(), getPublicConfig()])
            .then(([d, c]) => {
                setData(d);
                setConfig(c);
                setError(null);
                setJustRefreshed(true);
                if (justRefreshedTimeout.current) clearTimeout(justRefreshedTimeout.current);
                justRefreshedTimeout.current = setTimeout(() => setJustRefreshed(false), 60000);
            })
            .catch(err => {
                logger.error('DASHBOARD', 'Error cargando dashboard:', err);
                setError('No se pudieron cargar los datos del panel. Revisa tu conexión e inténtalo de nuevo.');
            })
            .finally(() => { setLoading(false); setRefreshing(false); });
    };

    useEffect(() => { cargarDatos(); }, []);

    if (loading) return <DashboardSkeleton mostrarAvisoLargo={cargaLarga} />;

    // Error en la carga inicial (sin datos previos que mostrar)
    if (!data && error) {
        return (
            <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, textAlign: 'center', gap: 12 }}>
                <div style={{ background: COLORS.dangerLight, border: `1px solid ${COLORS.dangerBorder}`, borderRadius: 16, padding: 14, display: 'flex' }}>
                    <AlertCircle size={28} color={COLORS.danger} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, margin: 0, maxWidth: 360 }}>{error}</p>
                <button
                    onClick={cargarDatos}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: COLORS.primary, border: 'none', borderRadius: 8, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                    <RefreshCw size={14} />
                    Reintentar
                </button>
            </div>
        );
    }

    if (!data) return null;

    const empresa = config?.empresa_nombre_corto || config?.empresa_nombre || 'tu negocio';
    const hora = getHoraPeru(reloj);
    const saludo = hora < 6 ? 'Buenas noches' : hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    const GreetingIcon = hora < 6 ? Moon : hora < 12 ? Sunrise : hora < 19 ? Sun : Moon;

    const variacionHoy = fraseVariacionVentas(data.variacionVentasHoy, 'ayer');
    const variacionMes = fraseVariacionVentas(data.variacionVentasMes, 'en el mismo período del mes pasado');
    const variacionMargen = fraseVariacionMargen(data.variacionMargen);
    const margen = nivelMargen(data.utilidadMes.margen);

    const kpis = [
        {
            label: 'Ventas Hoy',
            valor: formatCurrency(data.ventasHoy.total),
            sub: `${data.ventasHoy.cantidad} transacciones`,
            subVariacion: variacionHoy,
            icon: <ShoppingCart size={20} />,
            variant: 'purple',
            explicacion: 'Es el total que cobraste hoy en ventas activas (no incluye ventas anuladas). Se compara con las ventas de ayer para que veas si el día va mejor o peor.',
        },
        {
            label: 'Ventas del Mes',
            valor: formatCurrency(data.ventasMes.total),
            sub: `${data.ventasMes.cantidad} transacciones`,
            subVariacion: variacionMes,
            icon: <TrendingUp size={20} />,
            variant: 'pink',
            explicacion: 'Es el total cobrado desde el día 1 de este mes hasta hoy. La comparación es contra los mismos días del mes pasado (por ejemplo, del 1 al 24), para que sea justa y no compares un mes completo contra uno a la mitad.',
        },
        {
            label: 'Utilidad del Mes',
            valor: formatCurrency(data.utilidadMes.utilidad),
            sub: `Margen: ${data.utilidadMes.margen.toFixed(1)}%`,
            subBadge: margen,
            subVariacion: variacionMargen,
            icon: <DollarSign size={20} />,
            variant: 'green',
            explicacion: 'Es lo que realmente ganaste: tus ventas del mes menos lo que te costaron esos productos. El margen te dice qué porcentaje de cada venta se queda contigo como ganancia — mientras más alto, mejor.',
        },
        {
            label: 'Alertas de Stock',
            valor: `${data.stockCritico + data.stockBajo}`,
            sub: `${data.stockCritico} sin stock • ${data.stockBajo} bajo mínimo`,
            icon: <AlertTriangle size={20} />,
            variant: data.stockCritico > 0 ? 'coral' : 'gold',
            explicacion: 'Los productos "sin stock" ya se agotaron y estás perdiendo ventas por no tenerlos. Los "bajo mínimo" están por acabarse — es buen momento para reabastecerlos antes de que también se agoten.',
        },
    ];

    return (
        <div className="page-enter">

            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: COLORS.primaryLight, color: COLORS.primary, flexShrink: 0 }}>
                                <GreetingIcon size={13} />
                            </span>
                            <p style={{ fontSize: 13, color: COLORS.textMuted, margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span>{saludo} — {reloj.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' })}</span>
                                <span style={{ color: COLORS.border }}>•</span>
                                <span style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontWeight: 700, color: COLORS.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                                    {reloj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Lima' })}
                                </span>
                            </p>
                        </div>
                        <h1 style={{ fontSize: 28, fontWeight: 800, color: COLORS.textPrimary, margin: 0, letterSpacing: -0.3 }}>
                            Panel de Control
                        </h1>
                        <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: '4px 0 0' }}>
                            {empresa} — resumen general del negocio
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            onClick={cargarDatos}
                            disabled={refreshing}
                            aria-live="polite"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '9px 16px',
                                background: refreshing ? '#F1F5F9' : justRefreshed ? COLORS.successLight : 'white',
                                border: `1px solid ${justRefreshed ? COLORS.success : COLORS.border}`,
                                borderRadius: 10,
                                cursor: refreshing ? 'not-allowed' : 'pointer',
                                fontSize: 13,
                                color: refreshing ? COLORS.textMuted : justRefreshed ? COLORS.success : COLORS.primary,
                                fontWeight: 700,
                                opacity: refreshing ? 0.7 : 1,
                                pointerEvents: refreshing ? 'none' : 'auto',
                                transition: 'border-color 0.4s ease, color 0.4s ease, background-color 0.4s ease',
                            }}
                        >
                            {refreshing ? (
                                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                            ) : justRefreshed ? (
                                <CheckCircle2 size={14} />
                            ) : (
                                <RefreshCw size={14} />
                            )}
                            {refreshing ? 'Actualizando…' : justRefreshed ? 'Actualizado' : 'Actualizar'}
                        </button>
                    </div>
                </div>

                {/* Aviso de error en una actualización (se conservan los datos previos) */}
                {error && (
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: COLORS.dangerLight, border: `1px solid ${COLORS.dangerBorder}`, borderRadius: 8 }}>
                        <AlertCircle size={16} color={COLORS.danger} />
                        <p style={{ fontSize: 12, color: COLORS.danger, margin: 0, fontWeight: 600 }}>{error}</p>
                    </div>
                )}
            </div>
            
            {/* KPIs — cada tarjeta gira al hacer clic y muestra qué significa el dato */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {kpis.map((k, i) => (
                    <div
                        key={i}
                        className={`kpi-card ${k.variant} kpi-flip-wrapper ${tarjetasVolteadas[i] ? 'flipped' : ''}`}
                        onClick={() => voltearTarjeta(i)}
                        role="button"
                        tabIndex={0}
                        aria-label={`${k.label}. Clic para ver qué significa este dato.`}
                    >
                        <div className="kpi-flip-inner">
                            {/* Cara frontal */}
                            <div className="kpi-flip-front">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{k.label}</p>
                                    <div className={`kpi-icon ${k.variant}`}>{k.icon}</div>
                                </div>
                                <p style={{ fontSize: 24, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 4px' }}>{k.valor}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0 }}>{k.sub}</p>
                                    {k.subBadge && (
                                        <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 20, background: k.subBadge.bg, color: k.subBadge.color, border: `1px solid ${k.subBadge.border}` }}>
                                            {k.subBadge.texto}
                                        </span>
                                    )}
                                </div>
                                {k.subVariacion && (
                                    <p style={{ fontSize: 11, fontWeight: 700, color: k.subVariacion.color, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {k.subVariacion.Icon && <k.subVariacion.Icon size={12} />}
                                        {k.subVariacion.texto}
                                    </p>
                                )}
                                <p className="kpi-flip-hint" style={{ fontSize: 10, color: COLORS.textMuted, margin: '10px 0 0' }}>
                                    <Info size={11} /> Toca para ver qué significa
                                </p>
                            </div>
                            {/* Cara trasera — explicación en lenguaje simple */}
                            <div className="kpi-flip-back">
                                <p style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Info size={13} /> {k.label}
                                </p>
                                <p style={{ fontSize: 12.5, color: COLORS.textPrimary, margin: 0, lineHeight: 1.5 }}>
                                    {k.explicacion}
                                </p>
                                <p className="kpi-flip-hint" style={{ fontSize: 10, color: COLORS.textMuted, margin: '10px 0 0' }}>
                                    ← Toca para volver
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

                {/* Ventas 7 días */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>Ventas Últimos 7 Días</h3>
                            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '2px 0 0' }}>Total diario en soles</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart data={data.ventasPorDia} barSize={28}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: COLORS.textMuted }} tickFormatter={v => v.slice(5)} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: COLORS.textMuted }} tickFormatter={v => `S/${v}`} axisLine={false} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend content={<LeyendaVentas />} />
                            <Bar dataKey="total" name="Ventas del día" fill={COLORS.info} radius={[6, 6, 0, 0]} />
                            <Line type="monotone" dataKey="promedioMovil" name="Promedio móvil (7d)" stroke={COLORS.warning} strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="totalPeriodoAnterior" name="Semana anterior" stroke={COLORS.textSecondary} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                {/* Top productos */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>Top 5 Productos</h3>
                            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '2px 0 0' }}>Más vendidos del mes</p>
                        </div>
                        <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
                            {METRICAS_TOP.map(m => (
                                <button
                                    key={m.key}
                                    onClick={() => setMetricaTop(m.key)}
                                    style={{
                                        fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                        background: metricaTop === m.key ? 'white' : 'transparent',
                                        color: metricaTop === m.key ? COLORS.primary : COLORS.textMuted,
                                        boxShadow: metricaTop === m.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                    }}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {data.topProductos.length > 0 ? (() => {
                        const metrica = METRICAS_TOP.find(m => m.key === metricaTop);
                        const ordenados = [...data.topProductos].sort((a, b) => b[metricaTop] - a[metricaTop]).slice(0, 5);
                        const max = ordenados[0][metricaTop] || 1;
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {ordenados.map((p, i) => {
                                    const pct = Math.round((p[metricaTop] / max) * 100);
                                    const tint = RANK_TINTS[i] || RANK_TINTS[RANK_TINTS.length - 1];
                                    return (
                                        <div key={i}>
                                            <div className="flex justify-between" style={{ marginBottom: 4, gap: 8 }}>
                                                <span
                                                    title={p.nombre}
                                                    style={{ fontSize: 12, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
                                                >
                                                    <span style={{ color: tint, marginRight: 6, fontWeight: 800 }}>#{i + 1}</span>
                                                    {p.nombre}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: tint, whiteSpace: 'nowrap' }}>{metrica.formato(p[metricaTop])}</span>
                                            </div>
                                            <div style={{ background: '#F1F5F9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: tint, borderRadius: 4, transition: 'width 0.6s ease' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })() : (
                        <div className="empty-state">
                            <Package size={40} />
                            <p>Aún no hay ventas registradas para mostrar un ranking.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Alertas y últimas ventas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Alertas stock */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>Alertas de Stock</h3>
                        {data.productosStockBajo.length > 0 && (
                            <span style={{ background: COLORS.dangerLight, color: COLORS.danger, border: `1px solid ${COLORS.dangerBorder}`, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                                {data.productosStockBajo.length} alertas
                            </span>
                        )}
                    </div>
                    {data.productosStockBajo.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                            {data.productosStockBajo.map(p => (
                                <div key={p.id_producto} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: p.stock_actual === 0 ? COLORS.dangerLight : COLORS.warningLight, border: `1px solid ${p.stock_actual === 0 ? COLORS.dangerBorder : COLORS.warningBorder}`, borderRadius: 8 }}>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</p>
                                        <p style={{ fontSize: 11, color: COLORS.textMuted, margin: '2px 0 0' }}>{p.sku} • {p.categoria}</p>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: p.stock_actual === 0 ? COLORS.danger : COLORS.warning, color: 'white', whiteSpace: 'nowrap' }}>
                                        {p.stock_actual === 0 ? 'SIN STOCK' : `${p.stock_actual} uds`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <CheckCircle2 size={40} color={COLORS.success} />
                            <p style={{ color: COLORS.success, fontWeight: 600 }}>Todo el stock está en orden</p>
                        </div>
                    )}
                </div>

                {/* Top clientes */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>Top Clientes</h3>
                            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '2px 0 0' }}>Últimos 90 días</p>
                        </div>
                        <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
                            {METRICAS_TOP_CLIENTES.map(m => (
                                <button
                                    key={m.key}
                                    onClick={() => setMetricaCliente(m.key)}
                                    style={{
                                        fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                        background: metricaCliente === m.key ? 'white' : 'transparent',
                                        color: metricaCliente === m.key ? COLORS.primary : COLORS.textMuted,
                                        boxShadow: metricaCliente === m.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                    }}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {data.topClientes.length > 0 ? (() => {
                        const metrica = METRICAS_TOP_CLIENTES.find(m => m.key === metricaCliente);
                        const ordenados = [...data.topClientes].sort((a, b) => b[metricaCliente] - a[metricaCliente]).slice(0, 5);
                        const max = ordenados[0][metricaCliente] || 1;
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {ordenados.map((c, i) => {
                                    const pct = Math.round((c[metricaCliente] / max) * 100);
                                    const tint = RANK_TINTS[i] || RANK_TINTS[RANK_TINTS.length - 1];
                                    return (
                                        <div key={i}>
                                            <div className="flex justify-between" style={{ marginBottom: 4, gap: 8 }}>
                                                <span
                                                    title={c.nombre}
                                                    style={{ fontSize: 12, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
                                                >
                                                    <span style={{ color: tint, marginRight: 6, fontWeight: 800 }}>#{i + 1}</span>
                                                    {c.nombre}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: tint, whiteSpace: 'nowrap' }}>{metrica.formato(c[metricaCliente])}</span>
                                            </div>
                                            <div style={{ background: '#F1F5F9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: tint, borderRadius: 4, transition: 'width 0.6s ease' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })() : (
                        <div className="empty-state">
                            <Users size={40} />
                            <p>Aún no hay compras de clientes registrados en los últimos 90 días.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
