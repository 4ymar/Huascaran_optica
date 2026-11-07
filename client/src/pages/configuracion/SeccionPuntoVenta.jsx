import { ScanBarcode, Info, IdCard, ExternalLink, Keyboard, QrCode, Image, Landmark, Plus, Trash2 } from 'lucide-react';

export default function SeccionPuntoVenta({
    config, handleChange, documentosTokenNuevo, onDocumentosTokenChange,
    handleSeleccionarQrYape, subiendoQrYape,
    handleSeleccionarQrPlin, subiendoQrPlin,
}) {
    let cuentasTransferencia = [];
    try { cuentasTransferencia = JSON.parse(config.transferencia_cuentas || '[]'); } catch { cuentasTransferencia = []; }

    const actualizarCuentaTransferencia = (index, campo, valor) => {
        const nuevas = cuentasTransferencia.map((c, i) => i === index ? { ...c, [campo]: valor } : c);
        handleChange('transferencia_cuentas', JSON.stringify(nuevas));
    };

    const agregarCuentaTransferencia = () => {
        const nuevas = [...cuentasTransferencia, { banco: '', numero: '', cci: '' }];
        handleChange('transferencia_cuentas', JSON.stringify(nuevas));
    };

    const quitarCuentaTransferencia = (index) => {
        const nuevas = cuentasTransferencia.filter((_, i) => i !== index);
        handleChange('transferencia_cuentas', JSON.stringify(nuevas));
    };

    return (
        <>
            {/* Tarjeta 1: Escáner de código de barras */}
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <ScanBarcode size={20} className="text-purple-500" />
                    <h2 className="text-lg font-bold">Escáner de código de barras</h2>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                    Configuración del lector de código de barras en la pantalla de Ventas.
                </p>

                <div className="flex items-center gap-3 mb-3">
                    <input
                        type="checkbox"
                        id="escaner_activo"
                        checked={config.escaner_activo === '1'}
                        onChange={e => handleChange('escaner_activo', e.target.checked ? '1' : '0')}
                        style={{ width: 16, height: 16, accentColor: '#735DFF', cursor: 'pointer' }}
                    />
                    <label htmlFor="escaner_activo" className="text-sm font-semibold text-slate-700" style={{ cursor: 'pointer' }}>
                        Activar escaneo de código de barras en Ventas
                    </label>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
                    <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700">
                        Si tu negocio no usa lector de código de barras, deja esta opción desactivada:
                        el ícono de escaneo no aparecerá en la pantalla de Ventas.
                    </p>
                </div>
            </div>

            {/* Tarjeta 2: Autocompletado de clientes (DNI/RUC) */}
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <IdCard size={20} className="text-purple-500" />
                    <h2 className="text-lg font-bold">Autocompletado de clientes</h2>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                    Al registrar un cliente por DNI o RUC, los datos se completan automáticamente
                    usando el servicio de <strong>ApiPeru.dev</strong>.
                </p>

                <div className="mb-2">
                    <label className="form-label">Token de ApiPeru.dev</label>
                    <input
                        className="form-input font-mono text-xs"
                        type="password"
                        value={documentosTokenNuevo}
                        onChange={e => onDocumentosTokenChange(e.target.value)}
                        placeholder={
                            config.documentos_token_configurado === '1'
                                ? (config.documentos_token_masked || 'Token configurado')
                                : 'Pegar token de ApiPeru.dev (opcional)'
                        }
                    />
                    <p className="text-xs text-slate-400 mt-1">Token secreto de ApiPeru.dev. Trátalo como una contraseña.</p>
                </div>

                <a
                    href="https://apiperu.dev/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary inline-flex items-center gap-2 mb-6"
                >
                    <ExternalLink size={14} />
                    Visitar apiperu.dev
                </a>

                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
                    <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700">
                        Este campo es completamente opcional. Si no lo configuras, el sistema funciona igual —
                        solo que tendrás que escribir el nombre y dirección del cliente a mano.
                    </p>
                </div>
            </div>

            {/* Tarjeta 3: QR de pago (Yape / Plin) */}
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <QrCode size={20} className="text-purple-500" />
                    <h2 className="text-lg font-bold">QR de pago (Yape / Plin)</h2>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                    Sube la imagen de tu QR de Yape y/o Plin. Al seleccionar ese método de pago (F6) en Ventas,
                    se mostrará junto al monto a cobrar para que el cliente escanee y pague.
                </p>

                <div className="flex items-center gap-3 mb-5">
                    <input
                        type="checkbox"
                        id="qr_pago_activo"
                        checked={config.qr_pago_activo === '1'}
                        onChange={e => handleChange('qr_pago_activo', e.target.checked ? '1' : '0')}
                        style={{ width: 16, height: 16, accentColor: '#735DFF', cursor: 'pointer' }}
                    />
                    <label htmlFor="qr_pago_activo" className="text-sm font-semibold text-slate-700" style={{ cursor: 'pointer' }}>
                        Mostrar QR de pago en Ventas
                    </label>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    {/* Yape */}
                    <div className="flex flex-col items-center gap-3">
                        <p className="text-sm font-semibold text-slate-700">Yape</p>
                        <div style={{ width: 140, height: 140, border: '2px dashed #e2e8f0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7FF', flexShrink: 0, overflow: 'hidden' }}>
                            {config.qr_yape_imagen
                                ? <img src={config.qr_yape_imagen} alt="QR Yape" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                : <Image size={28} style={{ color: '#cbd5e1' }} />
                            }
                        </div>
                        <div className="flex flex-col gap-2 w-full">
                            <button
                                className="btn btn-secondary"
                                onClick={handleSeleccionarQrYape}
                                disabled={subiendoQrYape}
                                style={{ fontSize: 13 }}
                            >
                                <Image size={14} />
                                {subiendoQrYape ? 'Cargando...' : config.qr_yape_imagen ? 'Cambiar QR' : 'Seleccionar QR'}
                            </button>
                            {config.qr_yape_imagen && (
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleChange('qr_yape_imagen', '')}
                                    style={{ fontSize: 13, color: '#FF4B6C', borderColor: 'rgba(255,75,108,0.3)' }}
                                >
                                    Quitar QR
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Plin */}
                    <div className="flex flex-col items-center gap-3">
                        <p className="text-sm font-semibold text-slate-700">Plin</p>
                        <div style={{ width: 140, height: 140, border: '2px dashed #e2e8f0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F7FF', flexShrink: 0, overflow: 'hidden' }}>
                            {config.qr_plin_imagen
                                ? <img src={config.qr_plin_imagen} alt="QR Plin" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                : <Image size={28} style={{ color: '#cbd5e1' }} />
                            }
                        </div>
                        <div className="flex flex-col gap-2 w-full">
                            <button
                                className="btn btn-secondary"
                                onClick={handleSeleccionarQrPlin}
                                disabled={subiendoQrPlin}
                                style={{ fontSize: 13 }}
                            >
                                <Image size={14} />
                                {subiendoQrPlin ? 'Cargando...' : config.qr_plin_imagen ? 'Cambiar QR' : 'Seleccionar QR'}
                            </button>
                            {config.qr_plin_imagen && (
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleChange('qr_plin_imagen', '')}
                                    style={{ fontSize: 13, color: '#FF4B6C', borderColor: 'rgba(255,75,108,0.3)' }}
                                >
                                    Quitar QR
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2" style={{ marginTop: 16 }}>
                    <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700">
                        Es completamente opcional. Si no subes ninguna imagen, el método de pago Yape/Plin
                        sigue funcionando igual que ahora — solo que no se mostrará ningún QR en pantalla.
                    </p>
                </div>
            </div>

            {/* Tarjeta 4: Cuentas para Transferencia */}
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <Landmark size={20} className="text-purple-500" />
                    <h2 className="text-lg font-bold">Cuentas para Transferencia</h2>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                    Registra las cuentas bancarias del negocio. Al seleccionar Transferencia (F7) en Ventas,
                    el cajero podrá mostrarlas al cliente para que digite los datos y transfiera.
                </p>

                <div className="flex items-center gap-3 mb-5">
                    <input
                        type="checkbox"
                        id="transferencia_activo"
                        checked={config.transferencia_activo === '1'}
                        onChange={e => handleChange('transferencia_activo', e.target.checked ? '1' : '0')}
                        style={{ width: 16, height: 16, accentColor: '#735DFF', cursor: 'pointer' }}
                    />
                    <label htmlFor="transferencia_activo" className="text-sm font-semibold text-slate-700" style={{ cursor: 'pointer' }}>
                        Activar cuentas de transferencia en Ventas
                    </label>
                </div>

                <div className="space-y-3 mb-4">
                    {cuentasTransferencia.map((cuenta, i) => (
                        <div key={i} style={{ background: '#F8F7FF', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                            <div className="grid grid-cols-3 gap-3 mb-2">
                                <div>
                                    <label className="form-label" style={{ fontSize: 11 }}>Banco</label>
                                    <input className="form-input" value={cuenta.banco}
                                        onChange={e => actualizarCuentaTransferencia(i, 'banco', e.target.value)}
                                        placeholder="Ej: BCP" />
                                </div>
                                <div>
                                    <label className="form-label" style={{ fontSize: 11 }}>N° de cuenta</label>
                                    <input className="form-input font-mono text-xs" value={cuenta.numero}
                                        onChange={e => actualizarCuentaTransferencia(i, 'numero', e.target.value)}
                                        placeholder="000-000000-0-00" />
                                </div>
                                <div>
                                    <label className="form-label" style={{ fontSize: 11 }}>CCI</label>
                                    <input className="form-input font-mono text-xs" value={cuenta.cci}
                                        onChange={e => actualizarCuentaTransferencia(i, 'cci', e.target.value)}
                                        placeholder="00200000000000000000" />
                                </div>
                            </div>
                            <button
                                className="btn btn-secondary"
                                onClick={() => quitarCuentaTransferencia(i)}
                                style={{ fontSize: 12, color: '#FF4B6C', borderColor: 'rgba(255,75,108,0.3)' }}
                            >
                                <Trash2 size={13} /> Quitar cuenta
                            </button>
                        </div>
                    ))}
                </div>

                <button className="btn btn-secondary" onClick={agregarCuentaTransferencia} style={{ fontSize: 13 }}>
                    <Plus size={14} /> Agregar cuenta
                </button>

                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2" style={{ marginTop: 16 }}>
                    <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700">
                        Es completamente opcional. Si no agregas ninguna cuenta, el método de pago Transferencia
                        sigue funcionando igual que ahora.
                    </p>
                </div>
            </div>

            {/* Tarjeta 5: Atajos de teclado */}
            <div className="card mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <Keyboard size={20} className="text-purple-500" />
                    <h2 className="text-lg font-bold">Atajos de teclado</h2>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                    Disponibles en la pantalla de Ventas para agilizar el registro de ventas sin usar el mouse.
                </p>

                <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 w-16 text-center shrink-0">F2</span>
                        <span className="text-slate-600">Enfoca el buscador de productos para escribir de inmediato.</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 w-16 text-center shrink-0">F12</span>
                        <span className="text-slate-600">Abre el cobro; si ya está abierto y los datos son válidos, confirma la venta.</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 w-16 text-center shrink-0">Esc</span>
                        <span className="text-slate-600">Cierra cualquier modal o alerta de confirmación activo.</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 w-16 text-center shrink-0">F5</span>
                        <span className="text-slate-600">Método de pago: Efectivo (con el cobro abierto).</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 w-16 text-center shrink-0">F6</span>
                        <span className="text-slate-600">Método de pago: Yape / Plin (con el cobro abierto).</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 w-16 text-center shrink-0">F7</span>
                        <span className="text-slate-600">Método de pago: Transferencia Bancaria (con el cobro abierto).</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 w-16 text-center shrink-0">F8</span>
                        <span className="text-slate-600">Método de pago: Mixto (con el cobro abierto).</span>
                    </div>
                </div>
            </div>
        </>
    );
}
