import { Building2 } from 'lucide-react';

export default function SeccionEmpresa({ config, hayDatosPendientes, handleChange }) {
    return (
        <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Building2 size={20} className="text-purple-500" />
                    <h2 className="text-lg font-bold">Datos de la empresa</h2>
                </div>
                {hayDatosPendientes && (
                    <span style={{
                        fontSize: 11, fontWeight: 600, color: '#92400e',
                        background: '#fffbeb', border: '1px solid #fcd34d',
                        borderRadius: 20, padding: '3px 10px',
                        display: 'flex', alignItems: 'center', gap: 5, letterSpacing: '0.01em',
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', flexShrink: 0 }} />
                        Sin guardar
                    </span>
                )}
            </div>

            {/* Identificación */}
            <div className="flex items-center gap-3 mb-4" style={{ marginTop: 4 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#735DFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, whiteSpace: 'nowrap' }}>Identificación</p>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="col-span-2">
                    <label className="form-label">Razón social</label>
                    <input
                        className="form-input"
                        value={config.empresa_nombre || ''}
                        onChange={e => handleChange('empresa_nombre', e.target.value)}
                        placeholder="Ej: FERRETERÍA Huascaran E.I.R.L."
                    />
                </div>
                <div>
                    <label className="form-label">Nombre comercial</label>
                    <input
                        className="form-input"
                        value={config.empresa_nombre_corto || ''}
                        onChange={e => handleChange('empresa_nombre_corto', e.target.value)}
                        placeholder="Ej: Ferretería Huascaran"
                    />
                </div>
                <div>
                    <label className="form-label">RUC</label>
                    <input
                        className="form-input"
                        value={config.empresa_ruc || ''}
                        onChange={e => handleChange('empresa_ruc', e.target.value)}
                        placeholder="Ej: 20600897543"
                        maxLength={11}
                        inputMode="numeric"
                    />
                    {config.empresa_ruc && config.empresa_ruc.length !== 11 && (
                        <p className="text-xs text-amber-600 mt-1">El RUC debe tener 11 dígitos</p>
                    )}
                </div>
                <div>
                    <label className="form-label">Teléfono</label>
                    <input
                        className="form-input"
                        value={config.empresa_telefono || ''}
                        onChange={e => handleChange('empresa_telefono', e.target.value)}
                        placeholder="Ej: 043-123456"
                    />
                </div>
                <div>
                    <label className="form-label">Correo electrónico</label>
                    <input
                        className="form-input"
                        type="email"
                        value={config.empresa_email || ''}
                        onChange={e => handleChange('empresa_email', e.target.value)}
                        placeholder="Ej: contacto@empresa.com"
                    />
                </div>
            </div>

            {/* Ubicación */}
            <div className="flex items-center gap-3 mb-4" style={{ marginTop: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#735DFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, whiteSpace: 'nowrap' }}>Ubicación</p>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="form-label">Dirección</label>
                    <input
                        className="form-input"
                        value={config.empresa_direccion || ''}
                        onChange={e => handleChange('empresa_direccion', e.target.value)}
                        placeholder="Ej: Jr. Arequipa 123"
                    />
                </div>
                <div>
                    <label className="form-label">Distrito</label>
                    <input
                        className="form-input"
                        value={config.empresa_distrito || ''}
                        onChange={e => handleChange('empresa_distrito', e.target.value)}
                        placeholder="Ej: Lima"
                    />
                </div>
                <div>
                    <label className="form-label">Provincia</label>
                    <input
                        className="form-input"
                        value={config.empresa_provincia || ''}
                        onChange={e => handleChange('empresa_provincia', e.target.value)}
                        placeholder="Ej: Lima"
                    />
                </div>
                <div>
                    <label className="form-label">Departamento</label>
                    <input
                        className="form-input"
                        value={config.empresa_departamento || ''}
                        onChange={e => handleChange('empresa_departamento', e.target.value)}
                        placeholder="Ej: Lima"
                    />
                </div>
            </div>

            {/* Módulo Óptica */}
            <div className="flex items-center gap-3 mb-4" style={{ marginTop: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#735DFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, whiteSpace: 'nowrap' }}>Módulo Óptica</p>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <label className="flex items-center gap-2 mb-4" style={{ cursor: 'pointer' }}>
                <input
                    type="checkbox"
                    checked={config.modulo_optica_activo === '1'}
                    onChange={e => handleChange('modulo_optica_activo', e.target.checked ? '1' : '0')}
                />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Activar módulo Óptica (recetas, órdenes de trabajo y talleres)</span>
            </label>
            {config.modulo_optica_activo === '1' && (
                <div className="grid grid-cols-2 gap-4">
                    <p className="col-span-2" style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                        Estos datos se imprimen en la cabecera de la receta, junto con los datos de la empresa y el logo del ticket.
                    </p>
                    <div className="col-span-2">
                        <label className="form-label">Profesional que firma la receta</label>
                        <input
                            className="form-input"
                            value={config.optica_profesional_nombre || ''}
                            onChange={e => handleChange('optica_profesional_nombre', e.target.value)}
                            placeholder="Nombre completo"
                        />
                    </div>
                    <div>
                        <label className="form-label">N.º de colegiatura / registro</label>
                        <input
                            className="form-input"
                            value={config.optica_profesional_registro || ''}
                            onChange={e => handleChange('optica_profesional_registro', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="form-label">Cargo o título</label>
                        <input
                            className="form-input"
                            value={config.optica_profesional_cargo || ''}
                            onChange={e => handleChange('optica_profesional_cargo', e.target.value)}
                            placeholder="Ej: Optómetra"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}