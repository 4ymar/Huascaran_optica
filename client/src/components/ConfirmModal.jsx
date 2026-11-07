import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmModal({
    open,
    title = 'Confirmar acción',
    message,
    confirmLabel = 'Eliminar',
    cancelLabel = 'Cancelar',
    danger = true,
    requirePassword = false,
    onConfirm,
    onCancel,
}) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (!open) return null;

    const handleConfirm = () => {
        if (requirePassword) {
            if (!password) { setError('Ingresa tu contraseña'); return; }
            onConfirm(password);
        } else {
            onConfirm();
        }
        setPassword('');
        setError('');
    };

    const handleCancel = () => {
        setPassword('');
        setError('');
        onCancel();
    };

    return (
        <div className="modal-overlay" onClick={handleCancel}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: danger ? '#fef2f2' : '#f5f3ff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <AlertTriangle size={20} style={{ color: danger ? '#dc2626' : '#7c3aed' }} />
                    </div>
                    <div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>{title}</h3>
                        <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0', lineHeight: 1.5 }}>{message}</p>
                    </div>
                </div>

                {requirePassword && (
                    <div style={{ marginBottom: 20 }}>
                        <input
                            type="password"
                            className="form-input"
                            placeholder="Tu contraseña de administrador..."
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(''); }}
                            autoFocus
                        />
                        {error && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{error}</p>}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        style={{
                            background: danger ? '#dc2626' : '#7c3aed',
                            color: 'white', border: 'none', borderRadius: 8,
                            padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}