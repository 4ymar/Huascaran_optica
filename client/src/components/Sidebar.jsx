import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
    Home, ShoppingCart, Package, Warehouse,
    Truck, Users, BarChart3, FileText, Settings,
    ChevronLeft, ChevronRight, ClipboardList, Vault, LogOut, UserCog,
    Logs, Glasses, Wrench, Factory
} from 'lucide-react';
import logo from '../assets/logo_sin_fondo.png';
import { useVentas } from '../context/VentasContext';

const navItems = [
    { section: 'Principal' },
    { path: '/', icon: Home, label: 'Inicio', color: '#735DFF' },
    { path: '/ventas', icon: ShoppingCart, label: 'Punto de Venta', color: '#1AA082' },
    { path: '/caja', icon: Vault, label: 'Caja', color: '#D97706' },
    { path: '/creditos', icon: ClipboardList, label: 'Cuentas por Cobrar', color: '#3B82F6' },
    { section: 'Óptica', roles: ['ADMIN', 'CAJERO'], modulo: 'optica' },
    { path: '/recetas',  icon: Glasses, label: 'Recetas',  roles: ['ADMIN', 'CAJERO'], color: '#06B6D4', modulo: 'optica' },
    { path: '/ordenes',  icon: Wrench,  label: 'Órdenes',  roles: ['ADMIN', 'CAJERO'], color: '#F43F5E', modulo: 'optica' },
    { path: '/talleres', icon: Factory, label: 'Talleres', roles: ['ADMIN', 'CAJERO'], color: '#64748B', modulo: 'optica' },
    { section: 'Gestion', roles: ['ADMIN', 'ENCARGADO_ALMACEN'] },
    { path: '/productos', icon: Package, label: 'Productos', roles: ['ADMIN', 'ENCARGADO_ALMACEN'] },
    { path: '/inventario', icon: Warehouse, label: 'Inventario', roles: ['ADMIN', 'ENCARGADO_ALMACEN'] },
    { path: '/compras', icon: Truck, label: 'Compras', roles: ['ADMIN', 'ENCARGADO_ALMACEN'] },
    { path: '/clientes', icon: Users, label: 'Clientes', roles: ['ADMIN', 'CAJERO', 'ENCARGADO_ALMACEN'] },
    { section: 'Analisis', roles: ['ADMIN', 'ENCARGADO_ALMACEN'] },
    { path: '/reportes', icon: BarChart3, label: 'Reportes', roles: ['ADMIN', 'ENCARGADO_ALMACEN'] },
        { path: '/comprobantes', icon: FileText, label: 'Comprobantes', roles: ['ADMIN', 'ENCARGADO_ALMACEN', 'CAJERO'], color: '#8B5CF6' },
    { section: 'Sistema', roles: ['ADMIN'] },
    { path: '/usuarios', icon: UserCog, label: 'Usuarios', roles: ['ADMIN'] },
    { path: '/auditoria', icon: Logs, label: 'Auditoría (Logs)', roles: ['ADMIN'] },
    { path: '/configuracion', icon: Settings, label: 'Configuracion', roles: ['ADMIN'] },
];

const SIDEBAR_BG    = 'linear-gradient(180deg, #0a1628 0%, #0d2a3a 50%, #0a2020 100%)';
const ACTIVE_BG     = 'linear-gradient(135deg, rgba(26,160,130,0.3), rgba(46,109,164,0.2))';
const ACTIVE_SHADOW = '0 0 20px rgba(26,160,130,0.2)';
const ACCENT_COLOR  = 'rgba(26,160,130,1)';
const ACCENT_GLOW   = 'rgba(26,160,130,0.45)';

// ─── Mejora 1: utilidad para saber qué sección contiene la ruta activa ────────
function getSectionOfPath(path, items) {
    let currentSection = null;
    for (const item of items) {
        if (item.section) {
            currentSection = item.section;
        } else if (item.path === path || (item.path !== '/' && path.startsWith(item.path + '/'))) {
            return currentSection;
        }
    }
    return null;
}

// ─── Mejora 2: Tooltip custom ─────────────────────────────────────────────────
function NavTooltip({ label, anchorRef, visible }) {
    const [pos, setPos] = useState({ top: 0 });

    useEffect(() => {
        if (visible && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPos({ top: rect.top + rect.height / 2 });
        }
    }, [visible, anchorRef]);

    if (!visible) return null;

    return (
        <div
            style={{
                position: 'fixed',
                left: 76,
                top: pos.top,
                transform: 'translateY(-50%)',
                background: 'rgba(10,22,40,0.97)',
                border: '1px solid rgba(26,160,130,0.35)',
                color: 'white',
                fontSize: 12,
                fontWeight: 600,
                padding: '5px 11px',
                borderRadius: 7,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 999,
                boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                letterSpacing: '0.02em',
                animation: 'tooltipFadeIn 0.12s ease',
            }}
        >
            {label}
            {/* flecha izquierda */}
            <span style={{
                position: 'absolute',
                left: -5,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 0,
                height: 0,
                borderTop: '5px solid transparent',
                borderBottom: '5px solid transparent',
                borderRight: '5px solid rgba(26,160,130,0.35)',
            }} />
        </div>
    );
}

// ─── Ítem de nav con tooltip integrado ───────────────────────────────────────
function NavItem({ item, collapsed, spacious }) {
    const [hovered, setHovered] = useState(false);
    const ref = useRef(null);

    return (
        <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <NavLink
                ref={ref}
                to={item.path}
                end={item.path === '/'}
                // quitamos title nativo cuando está colapsado (lo reemplaza el custom)
                title=""
                style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    gap: collapsed ? 0 : 12,
                    padding: collapsed ? '11px 0' : (spacious ? '14px 16px' : '10px 14px'),
                    margin: spacious ? '4px 10px' : '2px 8px',
                    borderRadius: spacious ? 10 : 8,
                    color: isActive ? 'white' : 'rgba(255,255,255,0.65)',
                    background: isActive ? ACTIVE_BG : 'transparent',
                    border: 'none',
                    boxShadow: isActive ? ACTIVE_SHADOW : 'none',
                    textDecoration: 'none',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: spacious ? 15 : 14,
                    transition: 'all 0.18s ease',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                })}
                onMouseEnter={e => {
                    if (!e.currentTarget.classList.contains('active')) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                        e.currentTarget.style.color = 'white';
                    }
                }}
                onMouseLeave={e => {
                    if (!e.currentTarget.classList.contains('active')) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
                    }
                }}
            >
                {spacious && item.color ? (
                    <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: `${item.color}22`,
                        flexShrink: 0,
                    }}>
                        <item.icon size={17} color={item.color} />
                    </span>
                ) : (
                    <item.icon size={spacious ? 21 : 18} style={{ flexShrink: 0 }} />
                )}
                {!collapsed && <span>{item.label}</span>}
            </NavLink>

            {/* Mejora 2: tooltip custom, solo visible en modo colapsado */}
            {collapsed && (
                <NavTooltip label={item.label} anchorRef={ref} visible={hovered} />
            )}
        </div>
    );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(() => {
        return localStorage.getItem('sidebar_collapsed') === 'true';
    });
    const W = collapsed ? 68 : 260;

    const location = useLocation();
    const navigate = useNavigate();
    
    const usuarioStr = localStorage.getItem('usuario');
    const usuario = usuarioStr ? JSON.parse(usuarioStr) : null;
    const { configApp } = useVentas();

    const filteredNavItems = navItems
        .filter(item => {
            // Módulo Óptica: solo si está activado en Configuración
            if (item.modulo === 'optica' && configApp?.modulo_optica_activo !== '1') return false;
            if (!item.roles) return true; // sin restricción → visible para todos los roles
            return item.roles.includes(usuario?.rol);
        })
        // Quita encabezados de sección que quedaron sin ítems visibles
        .filter((item, i, arr) => !item.section || (arr[i + 1] && arr[i + 1].path));

    // Menú reducido (ej. CAJERO): ítems más grandes y sin header de sección
    // repetido cuando solo hay un grupo — se ve más "tarjeta", menos lista densa.
    const itemCount = filteredNavItems.filter(i => i.path).length;
    const seccionesCount = filteredNavItems.filter(i => i.section).length;
    const spacious = itemCount <= 6 && seccionesCount <= 1;

    // Mejora 1: sección que contiene la ruta actualmente activa
    const activeSection = getSectionOfPath(location.pathname, filteredNavItems);

    const verBienvenida = () => {
        sessionStorage.removeItem('bienvenida_vista');
        window.location.reload();
    };

    return (
        <>
            {/* Keyframe para el tooltip */}
            <style>{`
                @keyframes tooltipFadeIn {
                    from { opacity: 0; transform: translateY(-50%) translateX(-4px); }
                    to   { opacity: 1; transform: translateY(-50%) translateX(0); }
                }
            `}</style>

            <aside style={{
                width: W,
                minWidth: W,
                background: SIDEBAR_BG,
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                position: 'fixed',
                top: 0, left: 0, bottom: 0,
                zIndex: 50,
                transition: 'width 0.3s ease, min-width 0.3s ease',
                overflow: 'hidden',
            }}>

                {/* Logo */}
                <div
                    onClick={verBienvenida}
                    style={{
                        padding: collapsed ? '18px 0' : '24px 16px 10px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.07)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 76,
                        transition: 'padding 0.3s ease',
                    }}
                    title="Ver pantalla de bienvenida"
                >
                    <img
                        src={logo}
                        alt="Huascaran"
                        style={{
                            width: collapsed ? 34 : 170,
                            filter: 'brightness(0) invert(1)',
                            display: 'block',
                            margin: '0 auto',
                            transition: 'width 0.3s ease',
                            opacity: 0.92,
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.92'}
                    />
                    {!collapsed && (
                        <p style={{
                            fontSize: 9,
                            color: 'rgba(255,255,255,0.22)',
                            margin: '5px 0 0',
                            letterSpacing: 3,
                            textTransform: 'uppercase',
                            fontWeight: 500,
                        }}>
                            Sistema de Gestion
                        </p>
                    )}
                </div>

                {/* Nav */}
                <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
                    {filteredNavItems.map((item, i) => {
                        if (item.section) {
                            if (spacious) return null;
                            // Mejora 1: ¿esta sección es la activa?
                            const isSectionActive = item.section === activeSection;

                            return collapsed ? (
                                // Modo colapsado: línea divisora, se ilumina si la sección es activa
                                <div
                                    key={i}
                                    style={{
                                        height: isSectionActive ? 2 : 1,
                                        background: isSectionActive
                                            ? `linear-gradient(90deg, transparent, ${ACCENT_COLOR}, transparent)`
                                            : 'rgba(255,255,255,0.06)',
                                        margin: '6px 10px',
                                        borderRadius: 2,
                                        boxShadow: isSectionActive ? `0 0 6px ${ACCENT_GLOW}` : 'none',
                                        transition: 'all 0.3s ease',
                                    }}
                                />
                            ) : (
                                <div key={i}>
                                    
                                        <div style={{
                                            height: isSectionActive ? 2 : 1,
                                            background: isSectionActive
                                                ? `linear-gradient(90deg, transparent, ${ACCENT_COLOR}, transparent)`
                                                : 'rgba(255,255,255,0.06)',
                                            margin: '2px 12px 0px',
                                            borderRadius: 2,
                                            boxShadow: isSectionActive ? `0 0 6px ${ACCENT_GLOW}` : 'none',
                                            transition: 'all 0.3s ease',
                                        }} />
                                    
                                    <div style={{
                                        fontSize: '0.65rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.15em',
                                        color: isSectionActive ? ACCENT_COLOR : 'rgba(255,255,255,0.28)',
                                        padding: '14px 16px 6px',
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                        transition: 'color 0.3s ease',
                                        borderLeft: isSectionActive ? `2px solid ${ACCENT_COLOR}` : '2px solid transparent',
                                        paddingLeft: 12,
                                        textShadow: isSectionActive ? `0 0 8px ${ACCENT_GLOW}` : 'none',
                                    }}>
                                        {item.section}
                                    </div>
                                </div>
                            );
                        }

                        //(línea inferior): si el siguiente ítem es una sección activa, agrega separador
                        return (
                        
                                    <NavItem key={item.path} item={item} collapsed={collapsed} spacious={spacious} />
                        );
                    })}
                </nav>

                {/* Info de usuario y Logout */}
                {!collapsed && usuario && (
                    <div style={{
                        padding: '12px 16px',
                        background: 'rgba(0,0,0,0.15)',
                        borderTop: '1px solid rgba(255,255,255,0.07)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                {usuario.nombre}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                                {usuario.rol}
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                localStorage.removeItem('token');
                                localStorage.removeItem('usuario');
                                sessionStorage.removeItem('token');
                                navigate('/login');
                            }}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 5 }}
                            title="Cerrar sesión"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                )}
                {collapsed && usuario && (
                    <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'center' }}>
                        <button
                            onClick={() => {
                                localStorage.removeItem('token');
                                localStorage.removeItem('usuario');
                                sessionStorage.removeItem('token');
                                navigate('/login');
                            }}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 5 }}
                            title="Cerrar sesión"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                )}

                {/* Botón colapsar */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '10px 8px' }}>
                    <button
                        onClick={() => {
                            const next = !collapsed;
                            setCollapsed(next);
                            localStorage.setItem('sidebar_collapsed', next);
                        }}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            gap: 8,
                            padding: '8px 10px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8,
                            color: 'rgba(255,255,255,0.4)',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >
                        {collapsed
                            ? <ChevronRight size={15} />
                            : <><ChevronLeft size={15} /><span></span></>
                        }
                    </button>
                </div>
            </aside>

            {/* Espaciador dinámico */}
            <div style={{ width: W, minWidth: W, flexShrink: 0, transition: 'width 0.3s ease, min-width 0.3s ease' }} />
        </>
    );
}
