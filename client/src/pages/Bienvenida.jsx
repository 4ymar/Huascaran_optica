import { useState, useMemo, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import logo from '../assets/logo_sin_fondo.png';
import styles from './Bienvenida.module.css';
import { QRCodeSVG } from 'qrcode.react';
import logger from '../utils/logger';

const useStars = (count = 12) =>
    useMemo(
        () =>
            Array.from({ length: count }, (_, i) => ({
                id: i,
                cx: 30 + Math.floor((i * 113) % 1380),
                cy: 20 + Math.floor((i * 67) % 180),
                delay: (i * 0.13).toFixed(2),
                duration: (2 + i * 0.28).toFixed(2),
            })),
        [count]
    );

export default function Bienvenida({ onEntrar }) {
    const [updateStatus, setUpdateStatus] = useState(null);
    const [updateInfo, setUpdateInfo]     = useState(null);
    const [updateOcultado, setUpdateOcultado] = useState(
        () => sessionStorage.getItem('update_dismissed') === '1'
    );
    const [loading, setLoading] = useState(false);
    const [dbStatus, setDbStatus] = useState(
        window.electronAPI?.isElectron ? 'ok' : 'connecting'
    );
    const [serverInfo, setServerInfo] = useState(null);
    const [appVersion, setAppVersion] = useState(null);
    const [serverInfoListo, setServerInfoListo] = useState(false);
    const [appVersionListo, setAppVersionListo] = useState(false);
    const stars = useStars(12);
    const [logoListo, setLogoListo] = useState(false);

        useEffect(() => {
        window.electronAPI?.logEvento?.('Bienvenida: montado');
    }, []);

    // Simula verificación de conexión a BD al montar. En producción, esto podría ser una llamada real a un endpoint de salud.
    // DESPUÉS
    const checkHealth = useCallback(() => {
        setDbStatus('connecting');
        fetch('/api/health')
            .then(r => r.ok ? setDbStatus('ok') : setDbStatus('error'))
            .catch(() => setDbStatus('error'));
    }, []);

    const handleEntrar = useCallback(async () => {
        if (loading || dbStatus === 'connecting') return;
        setLoading(true);
        try {
            await onEntrar();
        } catch (err) {
            logger.error('BIENVENIDA', 'Error al ingresar:', err);
            setLoading(false);
        }
    }, [loading, dbStatus, onEntrar]);

        useEffect(() => {
        if (window.electronAPI?.getAppVersion) {
            window.electronAPI.getAppVersion()
                .then(setAppVersion)
                .finally(() => {
                    window.electronAPI?.logEvento?.('Bienvenida: appVersion resuelto');
                    setAppVersionListo(true);
                });
        } else {
            setAppVersionListo(true);
        }
        if (!window.electronAPI?.isElectron) checkHealth();

        fetch('/api/server-info')
            .then(r => r.json())
            .then(data => setServerInfo(data))
            .catch(() => setServerInfo(null))
            .finally(() => {
                window.electronAPI?.logEvento?.('Bienvenida: serverInfo resuelto');
                setServerInfoListo(true);
            });

        // Escuchar eventos del updater (check ya disparado desde main.js)
        if (!window.electronAPI?.updater) return;
        const unsub = window.electronAPI.updater.onStatus((status) => {
            if (status.state === 'available') {
                setUpdateStatus('available');
                setUpdateInfo(status.info);
            } else if (status.state === 'downloading') {
                setUpdateStatus('downloading');
            } else if (status.state === 'downloaded') {
                setUpdateStatus('downloaded');
            }
        });
        return () => unsub();
    }, [checkHealth]);

    // Guardia: si la BD falla mientras loading está activo, resetearlo
    useEffect(() => {
        if (dbStatus === 'error') setLoading(false);
    }, [dbStatus]);

    // Listener global de teclado — dependencia limpia gracias a useCallback
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Enter') handleEntrar();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [handleEntrar]);

    // Tope de seguridad: si getAppVersion/server-info/logo no resuelven pronto, no bloquear el arranque.
    // 1.5s resultó insuficiente bajo condiciones frías (antivirus escaneando en el
    // primer arranque): serverInfo/logo llegaron a tardar ~2.5s reales, y el resguardo
    // se activaba antes de tiempo, mostrando la ventana con contenido incompleto —
    // justo lo que este resguardo debía evitar. 6s da margen real sin dejar la app
    // colgada si algo genuinamente no responde.
    useEffect(() => {
        const timer = setTimeout(() => {
            setServerInfoListo(true);
            setAppVersionListo(true);
            setLogoListo(true);
        }, 6000);
        return () => clearTimeout(timer);
    }, []);

    // Avisa al proceso principal que ESTA pantalla (la que reemplaza al splash)
    // ya pintó contenido real, para que recién ahí se muestre mainWindow (ver main.js).
    // Espera a que serverInfo y appVersion ya hayan resuelto (o al tope de 1.5s de arriba)
    // para que el panel QR y la versión no aparezcan "de golpe" después de mostrarse la ventana.
    useEffect(() => {
        if (!window.electronAPI?.appReady) return;
        if (!(serverInfoListo && appVersionListo && logoListo)) return;
        window.electronAPI?.logEvento?.('Bienvenida: condiciones listas, esperando 2 rAF para appReady()');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.electronAPI?.logEvento?.('Bienvenida: llamando appReady()');
                window.electronAPI.appReady();
            });
        });
    }, [serverInfoListo, appVersionListo, logoListo]);

    const dbLabel = {
        connecting: 'Iniciando sistema...',
        ok:         'Sistema listo',
        error:      'Error al iniciar BD',
    }[dbStatus];

    return (
        <div className={styles.root} role="main" aria-label="Pantalla de bienvenida Huascarán">

            {/* ── Fondos decorativos ── */}
            <div className={styles.bgGrid}    aria-hidden="true" />
            <div className={styles.dotGrid}   aria-hidden="true" />
            <div className={styles.dotGridBl} aria-hidden="true" />

            {/* ── Escena SVG ── */}
            <svg
                className={styles.geoSvg}
                viewBox="0 0 1440 900"
                preserveAspectRatio="xMidYMid slice"
                aria-hidden="true"
                focusable="false"
            >
                <defs>
                    <linearGradient id="bv-mtnL" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor="#1aa082" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="#0a1628" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="bv-mtnR" x1="100%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%"   stopColor="#2e6da4" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="#0a1628" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="bv-lakeG" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%"   stopColor="#1aa082" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#0a1628" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="bv-snowG" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%"   stopColor="#dff4ee" stopOpacity="0.65" />
                        <stop offset="100%" stopColor="#9dd4c8" stopOpacity="0" />
                    </linearGradient>
                    <filter id="bv-soft">
                        <feGaussianBlur stdDeviation="2.5" />
                    </filter>
                </defs>

                {/* Montañas laterales */}
                <polygon points="0,900 0,170 400,545"        fill="url(#bv-mtnL)" />
                <polyline points="0,170 400,545" fill="none"
                    stroke="rgba(26,160,130,0.22)" strokeWidth="1"
                    strokeDasharray="900" strokeDashoffset="900"
                    className={styles.drawLine} style={{ animationDelay: '0.3s' }} />
                <polygon points="0,900 0,390 210,590"         fill="rgba(10,26,40,0.38)" />

                <polygon points="1440,900 1440,160 1040,535" fill="url(#bv-mtnR)" />
                <polyline points="1440,160 1040,535" fill="none"
                    stroke="rgba(46,109,164,0.2)" strokeWidth="1"
                    strokeDasharray="900" strokeDashoffset="900"
                    className={styles.drawLine} style={{ animationDelay: '0.5s' }} />
                <polygon points="1440,900 1440,360 1230,575"  fill="rgba(10,26,40,0.38)" />

                {/* Nevado central */}
                <polygon points="720,100 845,335 595,335"    fill="rgba(13,42,58,0.5)" />
                <polygon points="720,100 770,225 670,225"    fill="url(#bv-snowG)" filter="url(#bv-soft)" />
                <polyline points="595,335 720,100 845,335" fill="none"
                    stroke="rgba(200,235,228,0.22)" strokeWidth="1"
                    strokeDasharray="500" strokeDashoffset="500"
                    className={styles.drawLine} style={{ animationDelay: '0.8s' }} />

                {/* Picos secundarios */}
                <polygon points="480,215 562,375 398,375"    fill="rgba(10,32,48,0.44)" />
                <polygon points="480,215 508,298 452,298"    fill="url(#bv-snowG)" filter="url(#bv-soft)" />
                <polygon points="960,235 1042,390 878,390"   fill="rgba(10,42,50,0.4)" />
                <polygon points="960,235 989,318 931,318"    fill="url(#bv-snowG)" filter="url(#bv-soft)" />

                {/* Lago */}
                <polygon points="90,900 315,572 1125,572 1350,900" fill="url(#bv-lakeG)" />
                <line x1="315" y1="572" x2="1125" y2="572"
                    stroke="rgba(26,160,130,0.35)" strokeWidth="1"
                    strokeDasharray="900" strokeDashoffset="900"
                    className={styles.drawLine} style={{ animationDelay: '1s' }} />
                <ellipse cx="720" cy="710" rx="210" ry="18"
                    fill="rgba(26,160,130,0.07)" filter="url(#bv-soft)" />
                {[150, 360, 540, 720, 900, 1080, 1290].map((x, i) => (
                    <line key={i} x1="720" y1="572" x2={x} y2="900"
                        stroke="rgba(26,160,130,0.04)" strokeWidth="1" />
                ))}

                {/* Deco esquina */}
                <polygon points="1440,0 1440,220 1200,0"     fill="rgba(46,109,164,0.12)" />
                <polygon points="1440,0 1440,100 1340,0"     fill="rgba(26,160,130,0.07)" />

                {/* Líneas diagonales */}
                <line x1="-20" y1="380" x2="500" y2="-20"
                    stroke="rgba(26,160,130,0.06)" strokeWidth="1"
                    strokeDasharray="700" strokeDashoffset="700"
                    className={styles.drawLine} style={{ animationDelay: '0.2s' }} />
                <line x1="940" y1="-20" x2="1460" y2="370"
                    stroke="rgba(46,109,164,0.06)" strokeWidth="1"
                    strokeDasharray="700" strokeDashoffset="700"
                    className={styles.drawLine} style={{ animationDelay: '0.4s' }} />

                {/* Estrellas */}
                {stars.map(({ id, cx, cy, delay, duration }) => (
                    <circle key={id} cx={cx} cy={cy} r={1.2}
                        fill="rgba(160,215,205,0.6)"
                        className={styles.star}
                        style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
                    />
                ))}
            </svg>

            {/* ── Esquinas decorativas ── */}
            <div className={`${styles.corner} ${styles.cTl}`} aria-hidden="true" />
            <div className={`${styles.corner} ${styles.cTr}`} aria-hidden="true" />
            <div className={`${styles.corner} ${styles.cBl}`} aria-hidden="true" />
            <div className={`${styles.corner} ${styles.cBr}`} aria-hidden="true" />

            {/* ── Indicador estado BD — esquina inferior izquierda ── */}
            <div
                className={`${styles.dbBadge} ${styles[`db${dbStatus.charAt(0).toUpperCase() + dbStatus.slice(1)}`]}`}
                aria-live="polite"
            >
                <span className={styles.dbDot} aria-hidden="true" />
                <span className={styles.dbLabel}>{dbLabel}</span>
            </div>
            
            {/* ── Panel acceso red — esquina inferior derecha ── */}
            {serverInfo && (
                
                <div className={styles.networkBadge} aria-label="Acceso desde otros dispositivos">
                    <span className={styles.networkLabel}>Conecta otros dispositivos</span>
                    <QRCodeSVG
                        value={serverInfo.url}
                        size={100}
                        bgColor="transparent"
                        fgColor="#1aa082"
                        className={styles.qrImg}
                    />
                    <span className={styles.networkUrl}>{serverInfo.url}</span>
                </div>
            )}

{/* ── Banner de actualización — flotante izquierdo central ── */}
{window.electronAPI?.isElectron && updateStatus && !updateOcultado && (
    <div style={{
        position: 'absolute',
        left: 24,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 50,
        width: 280,
        background: 'rgba(10, 18, 35, 0.92)',
        border: '1px solid rgba(115, 93, 255, 0.5)',
        borderRadius: 14,
        padding: '18px 20px',
        boxShadow: '0 8px 32px rgba(115,93,255,0.25)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🚀</span>
            <div>
                <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>
                    {updateStatus === 'available'   && `Nueva versión v${updateInfo?.version || ''} disponible`}
                    {updateStatus === 'downloading' && 'Descargando actualización...'}
                    {updateStatus === 'downloaded'  && '¡Listo para instalar!'}
                </p>
                <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
                    {updateStatus === 'available'   && 'Actualiza con un solo clic'}
                    {updateStatus === 'downloading' && 'Espera unos momentos'}
                    {updateStatus === 'downloaded'  && 'Se reiniciará la aplicación'}
                </p>
            </div>
        </div>

        {updateStatus === 'downloading' && (
            <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: '60%', height: '100%', background: '#735DFF', borderRadius: 3, animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
            {updateStatus === 'available' && (
                <>
                    <button
                        onClick={() => window.electronAPI.updater.download()}
                        style={{
                            flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                            background: '#735DFF', color: '#fff', fontWeight: 700,
                            fontSize: 12, cursor: 'pointer',
                        }}
                    >
                        Actualizar ahora
                    </button>
                    <button
                        onClick={() => { setUpdateOcultado(true); sessionStorage.setItem('update_dismissed', '1'); }}
                        style={{
                            padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                            background: 'transparent', color: 'rgba(255,255,255,0.6)',
                            fontSize: 12, cursor: 'pointer',
                        }}
                    >
                        Luego
                    </button>
                </>
            )}
            {updateStatus === 'downloaded' && (
                <button
                    onClick={() => window.electronAPI.updater.install()}
                    style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                        background: '#10B981', color: '#fff', fontWeight: 700,
                        fontSize: 12, cursor: 'pointer',
                    }}
                >
                    Instalar y reiniciar
                </button>
            )}
        </div>
    </div>
)}

            {/* ── Contenido principal ── */}
            <div className={styles.content}>

                {/* Logo — sin eyebrow "BIENVENIDO" */}
                <div className={styles.logoWrap}>
                    <img
                        src={logo}
                        alt="Huascarán — Sistema de Gestión de Inventarios y Ventas"
                        className={styles.logo}
                        onLoad={(e) => {
                            // onLoad solo confirma bytes descargados, no que el logo ya está
                            // decodificado y compuesto (el drop-shadow del CSS agrega trabajo
                            // extra del compositor después de este evento). decode() sí espera
                            // a que esté realmente listo para pintarse.
                            const img = e.target;
                            (img.decode ? img.decode() : Promise.resolve())
                                .catch(() => {}) // decode() puede rechazar en casos raros (ej. src cambió); no bloqueamos el arranque por eso
                                .finally(() => {
                                    window.electronAPI?.logEvento?.('Bienvenida: logo cargado (onLoad+decode)');
                                    setLogoListo(true);
                                });
                        }}
                        onError={() => { window.electronAPI?.logEvento?.('Bienvenida: logo error (onError)'); setLogoListo(true); }}
                    />
                </div>

                <p className={styles.subtitle}>
                    Sistema de Gestión de Inventarios y Ventas
                </p>

                <div className={styles.sep} aria-hidden="true">
                    <div className={`${styles.sepLine} ${styles.sepLineL}`} />
                    <div className={styles.sepDiamond} />
                    <div className={`${styles.sepLine} ${styles.sepLineR}`} />
                </div>

                {/* Botón con fondo sólido teal */}
                
                <button
                    className={styles.btn}
                    onClick={handleEntrar}
                    disabled={loading || dbStatus !== 'ok'}
                    aria-busy={loading}
                    aria-label="Ingresar al sistema"
                >
                    <span className={styles.btnInner}>
                        {loading ? (
                            <>Cargando<span className={styles.spinner} aria-hidden="true" /></>
                        ) : (
                            <>Ingresar al Sistema <span className={styles.btnArrow} aria-hidden="true" /></>
                        )}
                    </span>
                </button>

                {dbStatus === 'error' && (
                    <div className={styles.errorMsg} role="alert">
                        <span>No se pudo iniciar la base de datos.</span>
                        <button
                            className={styles.retryBtn}
                            onClick={checkHealth}
                            aria-label="Reintentar conexión"
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                <p
                    className={styles.keyHint}
                    aria-hidden={dbStatus !== 'ok' ? 'true' : undefined}
                    style={{ visibility: dbStatus === 'ok' ? 'visible' : 'hidden' }}
                >
                    Presiona <kbd>Enter</kbd> para ingresar
                </p>

                <p className={styles.version}>
                    Versión {appVersion || '—'} &nbsp;·&nbsp; {new Date().getFullYear()}
                </p>
            </div>

            {/* ── Footer ── */}
            <footer className={styles.footer}>
                <div className={styles.footerVline} aria-hidden="true" />
                <p className={styles.footerText}>
                    Desarrollado por <span>GiraDevs</span>
                </p>
            </footer>
        </div>
    );
}

Bienvenida.propTypes = {
    onEntrar: PropTypes.func.isRequired,
};
