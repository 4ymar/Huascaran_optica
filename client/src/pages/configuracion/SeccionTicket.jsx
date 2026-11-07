import { Printer, Image } from 'lucide-react';

export default function SeccionTicket({
    config,
    handleChange,
    handleSeleccionarLogo,
    subiendoLogo,
}) {
    return (
        <div className="card mb-6">
            <div className="flex items-center gap-2 mb-1">
                <Printer size={20} className="text-purple-500" />
                <h2 className="text-lg font-bold">Ticket térmico</h2>
            </div>
            <p className="text-sm text-slate-500 mb-5">
                Configura el formato de impresión para impresoras térmicas (POS).
            </p>

            {/* Papel */}
            <div className="flex items-center gap-3 mb-4">
                <p style={{ fontSize: 11, fontWeight: 700, color: '#735DFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, whiteSpace: 'nowrap' }}>Papel</p>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                    <label className="form-label">Ancho del papel</label>
                    <select
                        className="form-input"
                        value={config.ticket_ancho || '80'}
                        onChange={e => handleChange('ticket_ancho', e.target.value)}
                    >
                        <option value="58">58 mm (pequeño)</option>
                        <option value="80">80 mm (estándar)</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">El 80 mm es el más común en impresoras POS de escritorio.</p>
                </div>
                <div>
                    <label className="form-label">Mostrar desglose IGV</label>
                    <div className="flex items-center gap-3 mt-2">
                        <input
                            type="checkbox"
                            id="ticket_igv"
                            checked={config.ticket_mostrar_igv === '1' || config.ticket_mostrar_igv === true}
                            onChange={e => handleChange('ticket_mostrar_igv', e.target.checked ? '1' : '0')}
                            style={{ width: 16, height: 16, accentColor: '#735DFF', cursor: 'pointer' }}
                        />
                        <label htmlFor="ticket_igv" className="text-sm text-slate-600" style={{ cursor: 'pointer' }}>
                            Mostrar subtotal e IGV en el ticket
                        </label>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Si está desactivado, solo se muestra el total.</p>
                </div>
                <div className="col-span-2">
                    <label className="form-label">N° de serie de máquina registradora</label>
                    <input
                        className="form-input"
                        value={config.ticket_serie_maquina || ''}
                        onChange={e => handleChange('ticket_serie_maquina', e.target.value)}
                        placeholder="Ej: POS-001"
                        maxLength={20}
                    />
                    <p className="text-xs text-slate-400 mt-1">
                        Requerido por SUNAT. Identifica el terminal POS emisor del ticket.
                    </p>
                </div>
            </div>

            {/* Logo */}
            <div className="flex items-center gap-3 mb-4">
                <p style={{ fontSize: 11, fontWeight: 700, color: '#735DFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, whiteSpace: 'nowrap' }}>Logo</p>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <div className="flex items-start gap-5 mb-5">
                <div style={{ width: 100, height: 100, border: '2px dashed #e2e8f0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7FF', flexShrink: 0, overflow: 'hidden' }}>
                    {config.ticket_logo
                        ? <img src={config.ticket_logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        : <Image size={28} style={{ color: '#cbd5e1' }} />
                    }
                </div>
                <div className="flex flex-col gap-2 justify-center" style={{ paddingTop: 8 }}>
                    <button
                        className="btn btn-secondary"
                        onClick={handleSeleccionarLogo}
                        disabled={subiendoLogo}
                        style={{ fontSize: 13 }}
                    >
                        <Image size={14} />
                        {subiendoLogo ? 'Cargando...' : config.ticket_logo ? 'Cambiar logo' : 'Seleccionar logo'}
                    </button>
                    {config.ticket_logo && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => handleChange('ticket_logo', '')}
                            style={{ fontSize: 13, color: '#FF4B6C', borderColor: 'rgba(255,75,108,0.3)' }}
                        >
                            Quitar logo
                        </button>
                    )}
                    <p className="text-xs text-slate-400">PNG o JPG. Se redimensiona automáticamente.</p>
                </div>
            </div>

            {/* Pie de ticket */}
            <div className="flex items-center gap-3 mb-4">
                <p style={{ fontSize: 11, fontWeight: 700, color: '#735DFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, whiteSpace: 'nowrap' }}>Pie de ticket</p>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <div>
                <label className="form-label">Mensaje de cierre</label>
                <input
                    className="form-input"
                    value={config.ticket_mensaje_pie || ''}
                    onChange={e => handleChange('ticket_mensaje_pie', e.target.value)}
                    placeholder="Ej: ¡Gracias por su compra! Vuelva pronto."
                    maxLength={100}
                />
                <p className="text-xs text-slate-400 mt-1">Aparece al final del ticket. Máximo 100 caracteres.</p>
            </div>
        </div>
    );
}