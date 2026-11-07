import { useState, useEffect, useCallback, useRef } from 'react';
import { useVentas } from '../context/VentasContext';
import { Save, Settings } from 'lucide-react';
import { useToast } from '../components/Toast';
import { getConfig, updateConfig, updateSunatToken, updateDocumentosToken, getBackups, crearBackup, probarConfiguracionCPE } from '../services/api';
import logger from '../utils/logger';

import ConfigSidebar      from './configuracion/ConfigSidebar';
import SeccionEmpresa     from './configuracion/SeccionEmpresa';
import SeccionComprobantes from './configuracion/SeccionComprobantes';
import SeccionTicket      from './configuracion/SeccionTicket';
import SeccionCatalogo from './configuracion/SeccionCatalogo';
import SeccionBackups     from './configuracion/SeccionBackups';
import SeccionSistema     from './configuracion/SeccionSistema';
import ZonaPeligro        from './configuracion/ZonaPeligro';
import SeccionPuntoVenta from './configuracion/SeccionPuntoVenta';

export default function Configuracion() {
    const toast = useToast();
    const { refreshConfig } = useVentas();

    // ── Estado global (solo lo que se comparte entre secciones) ─────────────
    const [config, setConfig]                     = useState(null);
    const [loading, setLoading]                   = useState(true);
    const [saving, setSaving]                     = useState(false);
    const [hayDatosPendientes, setHayDatosPendientes] = useState(false);
    const [sunatTokenNuevo, setSunatTokenNuevo]   = useState('');
    const [documentosTokenNuevo, setDocumentosTokenNuevo] = useState('');
    const [probandoCpe, setProbandoCpe]           = useState(false);
        const [subiendoImagen, setSubiendoImagen]     = useState({ ticket_logo: false, qr_yape_imagen: false, qr_plin_imagen: false });
    const logoInputRef = useRef(null);
    const qrYapeInputRef = useRef(null);
    const qrPlinInputRef = useRef(null);

    // ── Estado backups (se pasa a SeccionBackups) ────────────────────────────
    const [backups, setBackups]                   = useState({ ultimoDiario: null, ultimoManual: null });
    const [loadingBackups, setLoadingBackups]     = useState(false);
    const [generandoBackup, setGenerandoBackup]   = useState(false);
    const [ultimoGenerado, setUltimoGenerado]     = useState(null);

    // ── Sección activa del nav lateral ───────────────────────────────────────
    const [seccionActiva, setSeccionActiva]       = useState('empresa');

    // ── Carga inicial ────────────────────────────────────────────────────────
    useEffect(() => {
        getConfig()
            .then(data => setConfig(data))
            .catch(err => logger.error('CONFIGURACION', 'Error cargando configuración:', err))
            .finally(() => setLoading(false));
    }, []);

    const cargarBackups = useCallback(async () => {
        setLoadingBackups(true);
        try {
            const data = await getBackups();
            setBackups(data);
        } catch { /* silencioso */ }
        finally { setLoadingBackups(false); }
    }, []);

    useEffect(() => { cargarBackups(); }, [cargarBackups]);

    // ── Handlers compartidos ─────────────────────────────────────────────────
    const handleChange = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
        setHayDatosPendientes(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { _sunat_token, ...configSinToken } = config;
            if (sunatTokenNuevo.trim()) {
                await updateSunatToken(sunatTokenNuevo.trim());
                setSunatTokenNuevo('');
            }
            if (documentosTokenNuevo.trim()) {
                await updateDocumentosToken(documentosTokenNuevo.trim());
                setDocumentosTokenNuevo('');
            }
            const data = await updateConfig(configSinToken);
            setConfig(data);
            setHayDatosPendientes(false);
            await refreshConfig();
            toast('Configuración guardada correctamente', 'success');
        } catch (err) {
            toast(err.response?.data?.error || 'Error al guardar', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleProbarCPE = async () => {
        if (hayDatosPendientes || sunatTokenNuevo.trim()) {
            toast('Guarda los cambios antes de probar la conexion CPE', 'warning');
            return;
        }
        setProbandoCpe(true);
        try {
            await probarConfiguracionCPE();
            toast('Conexion con proveedor CPE disponible', 'success');
        } catch (err) {
            toast(err.response?.data?.error || 'No se pudo probar la configuracion CPE', 'error');
        } finally {
            setProbandoCpe(false);
        }
    };

        const handleSeleccionarImagen = async (campo, inputRef) => {
        if (!window.electronAPI?.selectImage) {
            inputRef.current?.click();
            return;
        }
        setSubiendoImagen(prev => ({ ...prev, [campo]: true }));
        try {
            const result = await window.electronAPI.selectImage();
            if (!result?.ok) return;
            const img = new window.Image();
            img.onload = () => {
                const MAX    = 400;
                const scale  = img.width > MAX ? MAX / img.width : 1;
                const canvas = document.createElement('canvas');
                canvas.width  = Math.round(img.width  * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                handleChange(campo, canvas.toDataURL('image/png'));
            };
            img.src = result.base64;
        } catch {
            toast('Error al cargar la imagen', 'error');
        } finally {
            setSubiendoImagen(prev => ({ ...prev, [campo]: false }));
        }
    };

    const handleArchivoImagenSeleccionado = (event, campo) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setSubiendoImagen(prev => ({ ...prev, [campo]: true }));
        const reader = new FileReader();
        reader.onload = () => {
            const img = new window.Image();
            img.onload = () => {
                const MAX    = 400;
                const scale  = img.width > MAX ? MAX / img.width : 1;
                const canvas = document.createElement('canvas');
                canvas.width  = Math.round(img.width  * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                handleChange(campo, canvas.toDataURL('image/png'));
                setSubiendoImagen(prev => ({ ...prev, [campo]: false }));
            };
            img.onerror = () => {
                toast('Error al cargar la imagen', 'error');
                setSubiendoImagen(prev => ({ ...prev, [campo]: false }));
            };
            img.src = reader.result;
        };
        reader.onerror = () => {
            toast('Error al leer el archivo', 'error');
            setSubiendoImagen(prev => ({ ...prev, [campo]: false }));
        };
        reader.readAsDataURL(file);
    };

    // Wrappers — mantienen la firma que ya usa SeccionTicket.jsx sin tocarlo
    const handleSeleccionarLogo         = () => handleSeleccionarImagen('ticket_logo', logoInputRef);
    const handleArchivoLogoSeleccionado = (event) => handleArchivoImagenSeleccionado(event, 'ticket_logo');

    // Nuevos — para SeccionPuntoVenta.jsx
    const handleSeleccionarQrYape         = () => handleSeleccionarImagen('qr_yape_imagen', qrYapeInputRef);
    const handleArchivoQrYapeSeleccionado = (event) => handleArchivoImagenSeleccionado(event, 'qr_yape_imagen');
    const handleSeleccionarQrPlin         = () => handleSeleccionarImagen('qr_plin_imagen', qrPlinInputRef);
    const handleArchivoQrPlinSeleccionado = (event) => handleArchivoImagenSeleccionado(event, 'qr_plin_imagen');

    const handleBackupManual = async () => {
        setGenerandoBackup(true);
        try {
            const data = await crearBackup();
            if (data.ok) {
                toast('Copia de seguridad generada correctamente', 'success');
                setUltimoGenerado(data.archivo);
                cargarBackups();
            } else {
                toast('Error al generar backup: ' + (data.error || ''), 'error');
            }
        } catch {
            toast('Error al generar copia de seguridad', 'error');
        } finally {
            setGenerandoBackup(false);
        }
    };

    // ── Render de la sección activa ──────────────────────────────────────────
    const renderSeccion = () => {
        if (!config) return null;
        switch (seccionActiva) {
            case 'empresa':
                return (
                    <SeccionEmpresa
                        config={config}
                        hayDatosPendientes={hayDatosPendientes}
                        handleChange={handleChange}
                    />
                );
            case 'comprobantes':
                return (
                    <SeccionComprobantes
                        config={config}
                        handleChange={handleChange}
                        hayDatosPendientes={hayDatosPendientes}
                        sunatTokenNuevo={sunatTokenNuevo}
                        onTokenChange={(val) => {
                            setSunatTokenNuevo(val);
                            setHayDatosPendientes(true);
                        }}
                        probandoCpe={probandoCpe}
                        handleProbarCPE={handleProbarCPE}
                    />
                );
            case 'puntoventa':
            return (
                <SeccionPuntoVenta
                    config={config}
                    handleChange={handleChange}
                    documentosTokenNuevo={documentosTokenNuevo}
                    onDocumentosTokenChange={(val) => {
                        setDocumentosTokenNuevo(val);
                        setHayDatosPendientes(true);
                    }}
                    handleSeleccionarQrYape={handleSeleccionarQrYape}
                    subiendoQrYape={subiendoImagen.qr_yape_imagen}
                    handleSeleccionarQrPlin={handleSeleccionarQrPlin}
                    subiendoQrPlin={subiendoImagen.qr_plin_imagen}
                />
            );
            case 'catalogo':
                return <SeccionCatalogo />;
            case 'ticket':
                return (
                    <SeccionTicket
                        config={config}
                        handleChange={handleChange}
                        handleSeleccionarLogo={handleSeleccionarLogo}
                        subiendoLogo={subiendoImagen.ticket_logo}
                    />
                );
            case 'backups':
                return (
                    <SeccionBackups
                        backups={backups}
                        loadingBackups={loadingBackups}
                        generandoBackup={generandoBackup}
                        ultimoGenerado={ultimoGenerado}
                        handleBackupManual={handleBackupManual}
                    />
                );
            case 'sistema':
                return <SeccionSistema />;
            case 'peligro':
                return <ZonaPeligro />;
            default:
                return null;
        }
    };

    if (loading) return <div className="loader"><div className="spinner"></div></div>;

    // Barra de guardado solo visible en secciones con campos editables
    const seccionesConGuardado = ['empresa', 'comprobantes', 'ticket', 'puntoventa'];
    const mostrarBarraGuardado = hayDatosPendientes && seccionesConGuardado.includes(seccionActiva);

    return (
        <div
            className="page-enter"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: 'calc(100vh - 48px)', // 48px = padding vertical de .main-content
                minHeight: 0,
            }}
        >
            <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleArchivoLogoSeleccionado}
                style={{ display: 'none' }}
            />
            <input
                ref={qrYapeInputRef}
                type="file"
                accept="image/*"
                onChange={handleArchivoQrYapeSeleccionado}
                style={{ display: 'none' }}
            />
            <input
                ref={qrPlinInputRef}
                type="file"
                accept="image/*"
                onChange={handleArchivoQrPlinSeleccionado}
                style={{ display: 'none' }}
            />

            {/* Cabecera */}
            <div className="page-header" style={{ marginBottom: 28, flexShrink: 0 }}>
                <div className="flex items-start gap-4">
                    <div style={{
                        background: 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)',
                        borderRadius: 14, padding: '10px 12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, boxShadow: '0 4px 14px rgba(115,93,255,0.35)',
                    }}>
                        <Settings size={22} color="white" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1D1136', letterSpacing: '-0.3px' }}>
                            Configuración del sistema
                        </h1>
                        <p style={{ margin: '3px 0 0', fontSize: 14, color: '#64748b' }}>
                            Datos de la empresa para comprobantes y reportes
                        </p>
                    </div>
                </div>
            </div>

            {/* Layout dos columnas */}
            <div style={{ display: 'flex', gap: 28, alignItems: 'stretch', flex: 1, minHeight: 0 }}>

                {/* Nav lateral */}
                <ConfigSidebar
                    activo={seccionActiva}
                    onChange={(id) => setSeccionActiva(id)}
                />

                {/* Contenido de la sección activa */}
                <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', paddingRight: 4 }}>
                    {renderSeccion()}
                </div>
            </div>

            {/* Barra flotante de guardado */}
            {mostrarBarraGuardado && (
                <div style={{
                    position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    color: '#fff', borderRadius: 14, padding: '10px 14px 10px 18px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
                    zIndex: 900, whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.08)',
                }}>
                    <div className="flex items-center gap-2">
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fbbf24', display: 'inline-block', boxShadow: '0 0 6px #fbbf24' }} />
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>Tienes cambios sin guardar</span>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                        style={{ fontSize: 13, padding: '6px 16px', borderRadius: 8 }}
                    >
                        <Save size={14} />
                        {saving ? 'Guardando...' : 'Guardar ahora'}
                    </button>
                </div>
            )}
        </div>
    );
}