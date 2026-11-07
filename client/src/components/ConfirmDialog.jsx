import { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
    const [config, setConfig] = useState(null);

    const confirmar = useCallback((mensaje, opciones = {}) => {
        return new Promise((resolve) => {
            setConfig({
                titulo: opciones.titulo || 'Confirmar acción',
                mensaje,
                textoConfirmar: opciones.textoConfirmar || 'Confirmar',
                textoCancelar: opciones.textoCancelar || 'Cancelar',
                peligro: opciones.peligro ?? true,
                resolve
            });
        });
    }, []);

    const handleClose = (valor) => {
        config?.resolve(valor);
        setConfig(null);
    };

    return (
        <ConfirmContext.Provider value={confirmar}>
            {children}
            {config && (
                <div className="modal-overlay" onClick={() => handleClose(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <h2>{config.titulo}</h2>
                        </div>
                        <p style={{ marginBottom: 20, fontSize: '0.9rem', color: '#64748b' }}>
                            {config.mensaje}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button type="button" className="btn btn-secondary" onClick={() => handleClose(false)}>
                                {config.textoCancelar}
                            </button>
                            <button
                                type="button"
                                className={config.peligro ? 'btn btn-danger' : 'btn btn-primary'}
                                onClick={() => handleClose(true)}
                            >
                                {config.textoConfirmar}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm debe usarse dentro de un <ConfirmProvider>');
    return ctx;
}