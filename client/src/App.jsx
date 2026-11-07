import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import Activacion from './pages/Activacion';
import Bienvenida from './pages/Bienvenida';
import Login from './pages/Login';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Productos = lazy(() => import('./pages/Productos'));
const Inventario = lazy(() => import('./pages/Inventario'));
const Ventas = lazy(() => import('./pages/Ventas'));
const Compras = lazy(() => import('./pages/Compras'));
const Clientes = lazy(() => import('./pages/Clientes'));
const Reportes = lazy(() => import('./pages/Reportes'));
const Comprobantes = lazy(() => import('./pages/Comprobantes'));
const Configuracion = lazy(() => import('./pages/Configuracion'));
const Creditos = lazy(() => import('./pages/Creditos'));
const Caja = lazy(() => import('./pages/Caja'));
const Usuarios = lazy(() => import('./pages/Usuarios'));
const Auditoria = lazy(() => import('./pages/Auditoria'));
const Recetas = lazy(() => import('./pages/Recetas'));
const Talleres = lazy(() => import('./pages/Talleres'));
const Ordenes = lazy(() => import('./pages/Ordenes'));
import { VentasProvider, useVentas } from './context/VentasContext';
import TitleBar from './components/TitleBar';
import logger from './utils/logger';

// ── Pantalla de error fatal (backend no disponible) ───────────────────────────
function ErrorBackend({ onReintentar }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100vh', gap: 16,
            background: '#fafafa', fontFamily: 'sans-serif'
        }}>
            <span style={{ fontSize: 48 }}>⚠️</span>
            <h2 style={{ margin: 0, color: '#dc2626' }}>No se pudo conectar al sistema</h2>
            <p style={{ color: '#64748b', textAlign: 'center', maxWidth: 400 }}>
                El servicio interno no respondió correctamente.<br />
                Cierra y vuelve a abrir la aplicación. Si el error persiste,
                contacta al soporte técnico.
            </p>
            <button
                onClick={onReintentar}
                style={{
                    padding: '10px 24px', borderRadius: 8, border: 'none',
                    background: '#6366f1', color: 'white', cursor: 'pointer', fontSize: 15
                }}
            >
                Reintentar
            </button>
        </div>
    );
}

function UpdateBanner() {
    const [updateStatus, setUpdateStatus] = useState(null); // null, 'checking', 'available', 'not-available', 'downloading', 'downloaded', 'error'
    const [updateInfo, setUpdateInfo] = useState(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [errorMessage, setErrorMessage] = useState('');
    const [ocultado, setOcultado] = useState(false);

    useEffect(() => {
        if (!window.electronAPI || !window.electronAPI.updater) {
            return;
        }

        const unsubscribe = window.electronAPI.updater.onStatus((status) => {
            logger.debug('UPDATER', 'Status received:', status);
            if (status.state) {
                setUpdateStatus(status.state);
                if (status.state === 'available') {
                    setUpdateInfo(status.info);
                    setOcultado(false);
                } else if (status.state === 'downloaded') {
                    setUpdateInfo(status.info);
                    setOcultado(false);
                } else if (status.state === 'downloading') {
                    if (status.progress) {
                        setDownloadProgress(Math.round(status.progress.percent || 0));
                    }
                } else if (status.state === 'error') {
                    setErrorMessage(status.error || 'Error desconocido');
                }
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    if (ocultado || !updateStatus) return null;
    if (updateStatus === 'not-available' || updateStatus === 'checking') return null;

    const handleDownload = () => {
        window.electronAPI.updater.download().catch((err) => {
            setUpdateStatus('error');
            setErrorMessage(err.message);
        });
    };

    const handleInstall = () => {
        window.electronAPI.updater.install().catch((err) => {
            setUpdateStatus('error');
            setErrorMessage(err.message);
        });
    };

    return (
        <div style={{
            background: 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)',
            color: 'white',
            borderRadius: '12px',
            padding: '12px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 15px rgba(115,93,255,0.2)',
            position: 'relative',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>🚀</span>
                <div>
                    {updateStatus === 'available' && (
                        <p style={{ margin: 0, fontWeight: 600 }}>
                            Nueva versión disponible: <span style={{ textDecoration: 'underline' }}>v{updateInfo?.version || ''}</span>. ¡Actualiza con un solo clic!
                        </p>
                    )}
                    {updateStatus === 'downloading' && (
                        <div>
                            <p style={{ margin: 0, fontWeight: 600 }}>
                                Descargando actualización... {downloadProgress}%
                            </p>
                            <div style={{ width: '200px', height: '6px', background: 'rgba(255,255,255,0.3)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                                <div style={{ width: `${downloadProgress}%`, height: '100%', background: '#FFD522', borderRadius: '3px', transition: 'width 0.2s' }} />
                            </div>
                        </div>
                    )}
                    {updateStatus === 'downloaded' && (
                        <p style={{ margin: 0, fontWeight: 600 }}>
                            ¡Descarga completada! Reinicia la aplicación para instalar.
                        </p>
                    )}
                    {updateStatus === 'error' && (
                        <p style={{ margin: 0, fontWeight: 600, color: '#FFD522' }}>
                            Error de actualización: {errorMessage}
                        </p>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {updateStatus === 'available' && (
                    <button onClick={handleDownload} className="btn btn-sm" style={{ background: '#FFD522', color: '#1D1136', border: 'none' }}>
                        Descargar
                    </button>
                )}
                {updateStatus === 'downloaded' && (
                    <button onClick={handleInstall} className="btn btn-sm btn-success" style={{ border: 'none' }}>
                        Instalar y Reiniciar
                    </button>
                )}
                <button onClick={() => setOcultado(true)} style={{ background: 'transparent', border: 'none', color: 'white', opacity: 0.7, cursor: 'pointer', fontSize: '18px' }}>
                    ✕
                </button>
            </div>
        </div>
    );
}

function AppContent() {
    const [licenciaValida, setLicenciaValida]       = useState(null); // null = cargando
    const [errorBackend, setErrorBackend]           = useState(false);
    const [mostrarBienvenida, setMostrarBienvenida] = useState(true);
    const [mostrarReactivacion, setMostrarReactivacion] = useState(false);
    const navigate  = useNavigate();
    const location  = useLocation();
    const esLogin   = location.pathname === '/login';
    const { cargarDatosVentas } = useVentas();

    const verificarLicencia = () => {
        setErrorBackend(false);
        setLicenciaValida(null);
        window.electronAPI?.logEvento?.('AppContent: verificarLicencia() iniciada');

        axios.get('/api/licencia/estado', { timeout: 8000 })
            .then(r => {
                window.electronAPI?.logEvento?.('AppContent: licencia resuelta, valida=' + (r.data.valida === true));
                setLicenciaValida(r.data.valida === true);
            })
            .catch(() => setErrorBackend(true));

        const visto = sessionStorage.getItem('bienvenida_vista');
        if (visto) setMostrarBienvenida(false);
    };

    useEffect(() => {
        window.electronAPI?.logEvento?.('AppContent: montado');
        verificarLicencia();
    }, []);

    // Heartbeat — mantiene el servidor vivo mientras el navegador está abierto
    useEffect(() => {
        const sendHeartbeat = () => axios.post('/api/heartbeat').catch(() => {});
        sendHeartbeat();
        const interval = setInterval(sendHeartbeat, 10000);
        return () => clearInterval(interval);
    }, []);

    // Atajo Ctrl+Shift+L — permite a un ADMIN reactivar/cambiar de licencia sin esperar a que venza
    useEffect(() => {
        if (!licenciaValida) return;
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
                const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
                if (usuario.rol === 'ADMIN') {
                    setMostrarReactivacion(true);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [licenciaValida]);

    const handleLoginExitoso = useCallback(() => {
        cargarDatosVentas();
        navigate('/');
    }, [navigate, cargarDatosVentas]);

    const handleEntrar = () => {
        setMostrarBienvenida(false);
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        navigate(token ? '/' : '/login');
    };

    // ── Redirección por autenticación ─────────────────────────────────────────
    useEffect(() => {
        if (mostrarBienvenida) return;
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token && location.pathname !== '/login') {
            navigate('/login');
        }
    }, [location.pathname, navigate]);

    // ── Estados de carga y error ──────────────────────────────────────────────
    if (errorBackend) {
        return <ErrorBackend onReintentar={verificarLicencia} />;
    }

    if (licenciaValida === null) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', background: '#0a1628'
            }}>
                <div className="spinner" />
            </div>
        );
    }

    if (!licenciaValida) {
        return <Activacion onActivada={() => setLicenciaValida(true)} />;
    }

    if (mostrarBienvenida) {
        return <Bienvenida onEntrar={handleEntrar} />;
    }
    if (esLogin) {
        return <Login onLoginExitoso={handleLoginExitoso} />;
    }

    return (
        <>
        <div className="app-layout">
            {!esLogin && <Sidebar />}
            <main className={esLogin ? '' : 'main-content'}>
                {!esLogin && <UpdateBanner />}
                <Suspense fallback={<div className="loader"><div className="spinner"></div></div>}>
                    <Routes>
                        <Route path="/"              element={<Dashboard />} />
                        <Route path="/productos"     element={<Productos />} />
                        <Route path="/inventario"    element={<Inventario />} />
                        <Route path="/ventas"        element={<Ventas />} />
                        <Route path="/compras"       element={<Compras />} />
                        <Route path="/clientes"      element={<Clientes />} />
                        <Route path="/reportes"      element={<Reportes />} />
                        <Route path="/comprobantes"  element={<Comprobantes />} />
                        <Route path="/configuracion" element={<Configuracion />} />
                        <Route path="/creditos"      element={<Creditos />} />
                        <Route path="/caja"          element={<Caja />} />
                        <Route path="/usuarios"      element={<Usuarios />} />
                        <Route path="/auditoria"     element={<Auditoria />} />
                        <Route path="/recetas"       element={<Recetas />} />
                        <Route path="/talleres"      element={<Talleres />} />
                        <Route path="/ordenes"       element={<Ordenes />} />
                    </Routes>
                </Suspense>
            </main>
        </div>
        {mostrarReactivacion && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
                <Activacion
                    onActivada={() => setMostrarReactivacion(false)}
                    onCerrar={() => setMostrarReactivacion(false)}
                />
            </div>
        )}
        </>
    );
}

export default function App() {

    return (
        <HashRouter>
            <ToastProvider>
                <ConfirmProvider>
                    <VentasProvider>
                        <TitleBar />
                        <AppContent />
                    </VentasProvider>
                </ConfirmProvider>
            </ToastProvider>
        </HashRouter>
    );
}
