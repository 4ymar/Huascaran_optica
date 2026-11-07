import { FileText, CheckCircle, Info, ExternalLink } from 'lucide-react';

export default function SeccionComprobantes({
    config,
    handleChange,
    hayDatosPendientes,
    sunatTokenNuevo,
    onTokenChange,
    probandoCpe,
    handleProbarCPE,
}) {
    return (
        <>
            {/* Card 1 — Series de comprobantes */}
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <FileText size={20} className="text-purple-500" />
                    <h2 className="text-lg font-bold">Series de comprobantes</h2>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                    Defina las series para sus boletas y facturas. El correlativo se incrementa automáticamente con cada emisión.
                </p>
                <div className="grid grid-cols-2 gap-5">
                    <div>
                        <label className="form-label">Serie boleta</label>
                        <input
                            className="form-input"
                            value={config.serie_boleta || 'B001'}
                            onChange={e => handleChange('serie_boleta', e.target.value)}
                            placeholder="B001"
                            maxLength={4}
                        />
                    </div>
                    <div>
                        <label className="form-label">Serie factura</label>
                        <input
                            className="form-input"
                            value={config.serie_factura || 'F001'}
                            onChange={e => handleChange('serie_factura', e.target.value)}
                            placeholder="F001"
                            maxLength={4}
                        />
                    </div>
                    <div>
                        <label className="form-label">Correlativo actual boleta</label>
                        <input
                            className="form-input"
                            type="number"
                            min={1}
                            value={config.correlativo_boleta ?? ''}
                            onChange={e => {
                                const v = e.target.value;
                                handleChange('correlativo_boleta', v === '' ? '' : (parseInt(v) || ''));
                            }}
                            onBlur={() => { if (!config.correlativo_boleta) handleChange('correlativo_boleta', 1); }}
                        />
                    </div>
                    <div>
                        <label className="form-label">Correlativo actual factura</label>
                        <input
                            className="form-input"
                            type="number"
                            min={1}
                            value={config.correlativo_factura ?? ''}
                            onChange={e => {
                                const v = e.target.value;
                                handleChange('correlativo_factura', v === '' ? '' : (parseInt(v) || ''));
                            }}
                            onBlur={() => { if (!config.correlativo_factura) handleChange('correlativo_factura', 1); }}
                        />
                    </div>

                    {(config.serie_nota_credito_boleta || config.serie_nota_credito_factura) && (
                        <>
                            <div style={{ gridColumn: '1 / -1', marginTop: 8, marginBottom: -4 }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#735DFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    Nota de Crédito
                                </p>
                            </div>
                            <div>
                                <label className="form-label">Serie NC (boleta)</label>
                                <input
                                    className="form-input"
                                    value={config.serie_nota_credito_boleta || ''}
                                    onChange={e => handleChange('serie_nota_credito_boleta', e.target.value)}
                                    placeholder="BC01"
                                    maxLength={4}
                                />
                            </div>
                            <div>
                                <label className="form-label">Serie NC (factura)</label>
                                <input
                                    className="form-input"
                                    value={config.serie_nota_credito_factura || ''}
                                    onChange={e => handleChange('serie_nota_credito_factura', e.target.value)}
                                    placeholder="FC01"
                                    maxLength={4}
                                />
                            </div>
                            <div>
                                <label className="form-label">Correlativo actual NC (boleta)</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    min={1}
                                    value={config.correlativo_nota_credito_boleta ?? ''}
                                    onChange={e => {
                                        const v = e.target.value;
                                        handleChange('correlativo_nota_credito_boleta', v === '' ? '' : (parseInt(v) || ''));
                                    }}
                                    onBlur={() => { if (!config.correlativo_nota_credito_boleta) handleChange('correlativo_nota_credito_boleta', 1); }}
                                />
                            </div>
                            <div>
                                <label className="form-label">Correlativo actual NC (factura)</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    min={1}
                                    value={config.correlativo_nota_credito_factura ?? ''}
                                    onChange={e => {
                                        const v = e.target.value;
                                        handleChange('correlativo_nota_credito_factura', v === '' ? '' : (parseInt(v) || ''));
                                    }}
                                    onBlur={() => { if (!config.correlativo_nota_credito_factura) handleChange('correlativo_nota_credito_factura', 1); }}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Aviso según estado SUNAT */}
                {config.sunat_activo === '1' ? (
                    <div className="mt-6 p-4 rounded-lg flex items-start gap-3 bg-green-50 border border-green-200">
                        <CheckCircle size={16} className="text-green-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-green-700">
                            <span className="font-semibold">Facturación electrónica activa.</span>{' '}
                            Los comprobantes emitidos se enviarán a SUNAT vía NubeFact.
                            La serie y correlativo configurados arriba deben coincidir con los registrados en NubeFact.
                        </p>
                    </div>
                ) : (
                    <div className="mt-6 p-4 rounded-lg flex items-start gap-3 bg-amber-50 border border-amber-200">
                        <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-700">
                            <span className="font-semibold">Aviso sobre comprobantes:</span>{' '}
                            Los comprobantes generados son para control interno del negocio y no tienen validez
                            tributaria ante SUNAT. Active la integración en Facturación Electrónica para emitir CPE válidos.
                        </p>
                    </div>
                )}
            </div>

            {/* Card 2 — Facturación Electrónica SUNAT / NubeFact */}
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <FileText size={20} className="text-purple-500" />
                    <h2 className="text-lg font-bold">Facturación Electrónica (SUNAT)</h2>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                    Integración con NubeFact para emitir boletas y facturas electrónicas válidas ante SUNAT.
                    Requiere cuenta activa en <strong>nubefact.com</strong>.
                </p>
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                    <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">
                        <strong>Al crear tu cuenta en NubeFact:</strong> selecciona el plan "INTEGRACIÓN VÍA TXT-JSON".
                        Es el único compatible con la forma en que este sistema emite tus comprobantes.
                    </p>
                </div>
                <div className="mb-5">
                    
                        <a href="https://www.nubefact.com/login"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <ExternalLink size={14} />
                        Ir al panel de NubeFact
                    </a>
                    <p className="text-xs text-slate-400 mt-2">
                        Configura tu logo, colores y datos de empresa directamente en NubeFact.
                    </p>
                </div>

                {/* Toggle activar */}
                <div className="flex items-center gap-3 mb-5">
                    <input
                        type="checkbox"
                        id="sunat_activo"
                        checked={config.sunat_activo === '1'}
                        onChange={e => handleChange('sunat_activo', e.target.checked ? '1' : '0')}
                        style={{ width: 16, height: 16, accentColor: '#735DFF', cursor: 'pointer' }}
                    />
                    <label htmlFor="sunat_activo" className="text-sm font-semibold text-slate-700" style={{ cursor: 'pointer' }}>
                        Activar emisión electrónica via NubeFact
                    </label>
                    {config.sunat_activo === '1' && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#065f46', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 20, padding: '2px 10px' }}>
                            ACTIVO
                        </span>
                    )}
                </div>

                {/* Campos solo visibles si está activo */}
                {config.sunat_activo === '1' && (
                    <div className="grid grid-cols-1 gap-4 mb-5">
                        <div>
                            <label className="form-label">Proveedor CPE</label>
                            <select
                                className="form-input"
                                value={config.cpe_proveedor || 'nubefact'}
                                onChange={e => handleChange('cpe_proveedor', e.target.value)}
                            >
                                <option value="nubefact">NubeFact</option>
                            </select>
                            <p className="text-xs text-slate-400 mt-1">
                                La arquitectura queda preparada para agregar otro PSE sin cambiar el flujo de ventas.
                            </p>
                        </div>
                        <div>
                            <label className="form-label">URL del API NubeFact</label>
                            <input
                                className="form-input"
                                value={config.sunat_url || ''}
                                onChange={e => handleChange('sunat_url', e.target.value)}
                                placeholder="https://api.nubefact.com/api/v1/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            />
                            <p className="text-xs text-slate-400 mt-1">
                                La URL única de tu empresa en NubeFact. La encuentras en tu panel → Empresas → Ver API.
                            </p>
                        </div>
                        <div>
                            <label className="form-label">Token de autenticación</label>
                            <input
                                className="form-input font-mono text-xs"
                                type="password"
                                value={sunatTokenNuevo}
                                onChange={e => onTokenChange(e.target.value)}
                                placeholder={
                                    config.sunat_token_configurado === '1'
                                        ? (config.sunat_token_masked || 'Token configurado')
                                        : 'Pegar nuevo token NubeFact'
                                }
                            />
                            <p className="text-xs text-slate-400 mt-1">Token secreto de NubeFact. Trátalo como una contraseña.</p>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={(config.cpe_envio_email_cliente || '1') === '1'}
                                onChange={e => handleChange('cpe_envio_email_cliente', e.target.checked ? '1' : '0')}
                                style={{ width: 16, height: 16, accentColor: '#735DFF', cursor: 'pointer' }}
                            />
                            <span className="text-sm text-slate-700">
                                Enviar automaticamente el PDF al email del cliente cuando tenga correo registrado
                            </span>
                        </label>
                        <div className="flex justify-start">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleProbarCPE}
                                disabled={probandoCpe || hayDatosPendientes || !!sunatTokenNuevo.trim()}
                                title={
                                    hayDatosPendientes || sunatTokenNuevo.trim()
                                        ? 'Guarda los cambios antes de probar'
                                        : 'Probar conexion con proveedor CPE'
                                }
                            >
                                <CheckCircle size={14} />
                                {probandoCpe ? 'Probando...' : 'Probar conexion'}
                            </button>
                        </div>
                        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
                            <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-blue-700">
                                El modo demo o producción lo controla <strong>NubeFact</strong> desde su panel web
                                (Empresas → Pase a Producción). Mientras no hayas activado producción en NubeFact,
                                todos los comprobantes son de prueba y no tienen validez ante SUNAT.
                            </p>
                        </div>
                    </div>
                )}

                {/* Formato del PDF electrónico — siempre visible */}
                <div>
                    <div className="flex items-center gap-3 mb-3" style={{ marginTop: 8 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#735DFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, whiteSpace: 'nowrap' }}>
                            Representación impresa
                        </p>
                        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    </div>
                    <label className="form-label">Formato del PDF electrónico (NubeFact)</label>
                    <select
                        className="form-input"
                        value={config.cpe_formato_pdf || 'A4'}
                        onChange={e => handleChange('cpe_formato_pdf', e.target.value)}
                    >
                        <option value="A4">A4 — Hoja completa (21 × 29.7 cm)</option>
                        <option value="A5">A5 — Media hoja (14.8 × 21 cm)</option>
                        <option value="TICKET">Ticket — Papel térmico (80 mm)</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                        Define el tamaño del PDF que NubeFact genera y envía por correo al cliente.
                        El ticket térmico es ideal si tu negocio usa impresora POS.
                    </p>
                </div>
            </div>
        </>
    );
}