import { useState } from 'react';
import { Building2, FileText, Printer, Shield, Settings, AlertTriangle, LayoutGrid, Users } from 'lucide-react';

const SECCIONES = [
    {
        id: 'empresa',
        label: 'Empresa',
        descripcion: 'Datos fiscales y ubicación',
        icono: Building2,
        color: '#735DFF',
    },
    {
        id: 'comprobantes',
        label: 'Comprobantes',
        descripcion: 'Series, correlativos y SUNAT',
        icono: FileText,
        color: '#735DFF',
    },
    {
        id: 'puntoventa',
        label: 'Ventas y clientes',
        descripcion: 'Escáner y autocompletado de clientes',
        icono: Users,
        color: '#735DFF',
    },
    {
        id: 'ticket',
        label: 'Ticket térmico',
        descripcion: 'Impresora POS y logo',
        icono: Printer,
        color: '#735DFF',
    },
    {
        id: 'catalogo',
        label: 'Catálogo',
        descripcion: 'Categorías de productos',
        icono: LayoutGrid,
        color: '#735DFF',
    },
    {
        id: 'backups',
        label: 'Copias de seguridad',
        descripcion: 'Backups y restauración',
        icono: Shield,
        color: '#735DFF',
    },
    {
        id: 'sistema',
        label: 'Sistema',
        descripcion: 'Actualizaciones y diagnóstico',
        icono: Settings,
        color: '#735DFF',
    },
    {
        id: 'peligro',
        label: 'Zona de peligro',
        descripcion: 'Restablecer o cargar demo',
        icono: AlertTriangle,
        color: '#FF4B6C',
    },
];

const TAMANO_CIRCULO = 48;

export default function ConfigSidebar({ activo, onChange }) {
    const [hoverId, setHoverId] = useState(null);

    return (
        <nav
            style={{
                width: TAMANO_CIRCULO + 24,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 18,
                padding: '8px 0',
            }}
        >
            {SECCIONES.map(({ id, label, icono: Icono, color }) => {
                const estaActivo = activo === id;
                const estaHover = hoverId === id;

                return (
                    <div
                        key={id}
                        style={{ position: 'relative' }}
                        onMouseEnter={() => setHoverId(id)}
                        onMouseLeave={() => setHoverId(null)}
                    >
                        <button
                            onClick={() => onChange(id)}
                            aria-label={label}
                            style={{
                                width: TAMANO_CIRCULO,
                                height: TAMANO_CIRCULO,
                                borderRadius: '50%',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: estaActivo ? color : '#ffffff',
                                boxShadow: estaActivo
                                    ? `0 6px 16px ${color}66`
                                    : estaHover
                                        ? '0 6px 14px rgba(15,23,42,0.16)'
                                        : '0 3px 8px rgba(15,23,42,0.10)',
                                transform: estaActivo ? 'scale(1.1)' : estaHover ? 'scale(1.05)' : 'scale(1)',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
                            }}
                        >
                            <Icono
                                size={20}
                                style={{ color: estaActivo ? '#ffffff' : color }}
                            />
                        </button>

                        {/* Tooltip */}
                        {estaHover && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    marginTop: 8,
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    background: '#1e293b',
                                    color: '#ffffff',
                                    fontSize: 11,
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    pointerEvents: 'none',
                                    zIndex: 10,
                                }}
                            >
                                {label}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
