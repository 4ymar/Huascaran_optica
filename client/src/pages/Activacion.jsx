import { useState, useEffect } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';

export default function Activacion({ onActivada, onCerrar }) {
    const [machineId, setMachineId] = useState('');
    const [empresa, setEmpresa] = useState('');
    const [clave, setClave] = useState('');
    
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        axios.get('/api/licencia/estado').then(r => {
            setMachineId(r.data.machineId || '');
        }).catch(() => {});
    }, []);

    const handleActivar = async () => {
        if (!empresa || !clave) {
            setError('Complete todos los campos');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const r = await axios.post('/api/licencia/activar', { clave });
            if (r.data.exito) {
                onActivada();
            } else {
                setError(r.data.error || 'Clave incorrecta');
            }
        } catch {
            setError('Error al activar. Verifique su conexion.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: '#0f172a'
        }}>
            <div style={{
                background: 'white', borderRadius: 16, padding: 40,
                width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                position: 'relative'
            }}>
                {onCerrar && (
                    <button
                        onClick={onCerrar}
                        title="Cerrar"
                        style={{
                            position: 'absolute', top: 16, right: 16,
                            background: 'transparent', border: 'none',
                            color: '#94a3b8', cursor: 'pointer', padding: 4,
                            display: 'flex'
                        }}
                    >
                        <X size={18} />
                    </button>
                )}
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{ fontSize: 48 }}>🔒</div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a3c6b', margin: '8px 0 4px' }}>
                        Sistema Bloqueado
                    </h1>
                    <p style={{ color: '#64748b', fontSize: 14 }}>
                        Se requiere activacion para continuar
                    </p>
                </div>

                <div style={{
                    background: '#f1f5f9', borderRadius: 8, padding: '10px 14px',
                    marginBottom: 20, fontFamily: 'monospace', fontSize: 13
                }}>
                    <p style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>
                        CODIGO DE SU EQUIPO (envie esto al proveedor):
                    </p>
                    <p style={{ color: '#1a3c6b', fontWeight: 700, letterSpacing: 2 }}>
                        {machineId || 'Cargando...'}
                    </p>
                </div>

                <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                        Nombre de la Empresa
                    </label>
                    <input
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                        value={empresa}
                        onChange={e => setEmpresa(e.target.value)}
                        placeholder="Ej: mi empresa SAC"
                    />
                </div>

                <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                        Clave de Activacion
                    </label>
                    <input
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', letterSpacing: 2, fontFamily: 'monospace' }}
                        value={clave}
                        onChange={e => setClave(e.target.value.trim())}
                        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    />
                </div>

                {error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
                        {error}
                    </div>
                )}

                <button
                    onClick={handleActivar}
                    disabled={loading}
                    style={{
                        width: '100%', padding: '12px', background: '#1a3c6b',
                        color: 'white', border: 'none', borderRadius: 8,
                        fontSize: 15, fontWeight: 600, cursor: 'pointer'
                    }}
                >
                    {loading ? 'Verificando...' : 'Activar Sistema'}
                </button>

                <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
                    Para obtener su clave de activacion contacte al proveedor del sistema
                </p>
            </div>
        </div>
    );
}