import { useState, useEffect } from 'react';
import { Lock, User, LogIn, Eye, EyeOff, ShoppingCart, Package, BarChart2, MessageCircle } from 'lucide-react';
import logo from '../assets/logo_sin_fondo.png';
import bgHuascaran from '../assets/huascaran.webp';
import { login, getMe, getSetupEstado, crearAdminInicial } from '../services/api';
import { useToast } from '../components/Toast';
import ModalRecuperacion from '../components/ModalRecuperacion';
import s from './Login.module.css';

const FEATURES = [
    { icon: <ShoppingCart size={17}/>, title: 'Ventas rápidas',        desc: 'Agiliza tus cobros y mejora la atención al cliente.' },
    { icon: <Package size={17}/>,      title: 'Control de inventario', desc: 'Actualiza tu stock en tiempo real y evita quiebres.' },
    { icon: <BarChart2 size={17}/>,    title: 'Reportes inteligentes', desc: 'Toma decisiones con datos claros y confiables.' },
];

const abrirWhatsApp = () => {
    if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal('https://wa.me/51924659250');
    } else {
        window.open('https://wa.me/51924659250', '_blank');
    }
};

export default function Login({ onLoginExitoso }) {
    const toast = useToast();
    const savedRemember = localStorage.getItem('recordarme') === '1';
    const savedUsername = savedRemember ? (localStorage.getItem('savedUsername') || '') : '';
    const [username, setUsername] = useState(savedUsername);
    const [password, setPassword] = useState('');
    const [showPw,   setShowPw]   = useState(false);
    const [remember, setRemember] = useState(savedRemember);
    const [loading,  setLoading]  = useState(false);
    const [requiereSetup, setRequiereSetup] = useState(false);
    const [nombreAdmin, setNombreAdmin] = useState('');
    const tokenExistente = localStorage.getItem('token') || sessionStorage.getItem('token');
    const [checking, setChecking] = useState(!!tokenExistente);
    const [mostrarRecuperacion, setMostrarRecuperacion] = useState(false);

    useEffect(() => {
        const handleAtajoRecuperacion = (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
                e.preventDefault();
                setMostrarRecuperacion(true);
            }
        };
        window.addEventListener('keydown', handleAtajoRecuperacion);
        return () => window.removeEventListener('keydown', handleAtajoRecuperacion);
    }, []);

    useEffect(() => {
        getSetupEstado()
            .then(data => setRequiereSetup(!!data.requiere_setup))
            .catch(() => {});

        const verify = async () => {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            if (!token) return;
            try {
                const data = await getMe();
                if (data.ok) {
                    localStorage.setItem('usuario', JSON.stringify(data.usuario));
                    onLoginExitoso(data.usuario);
                } else {
                    localStorage.removeItem('token');
                    sessionStorage.removeItem('token');
                    setChecking(false);
                }
            } catch (err) {
                // Solo borrar el token si fue un error 401 (token inválido/expirado)
                // Si fue error de red u otro, conservar el token y dejar pasar
                const status = err?.response?.status;
                if (status === 401 || status === 403) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('usuario');
                    sessionStorage.removeItem('token');
                }
                setChecking(false);
}
        };
        verify();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            toast('Por favor ingresa usuario y contraseña', 'warning');
            return;
        }
        try {
            setLoading(true);
            if (requiereSetup) {
                const data = await crearAdminInicial({
                    username,
                    password,
                    nombre_completo: nombreAdmin || username,
                });
                if (data.ok) {
                    toast('Administrador inicial creado. Inicia sesion con tus credenciales.', 'success');
                    setRequiereSetup(false);
                    setPassword('');
                }
                return;
            }
            const data = await login({ username, password });
            if (data.ok && data.token) {
                if (remember) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('recordarme', '1');
                    localStorage.setItem('savedUsername', username);
                } else {
                    sessionStorage.setItem('token', data.token);
                    localStorage.setItem('recordarme', '0');
                    localStorage.removeItem('savedUsername');
                    localStorage.removeItem('token');
                }
                localStorage.setItem('usuario', JSON.stringify(data.usuario));
                toast('Bienvenido al sistema', 'success');
                setChecking(false);
                onLoginExitoso(data.usuario);
            }
        } catch (err) {
            toast(err.response?.data?.error || 'Credenciales incorrectas', 'error');
            setPassword('');
        } finally {
            setLoading(false);
        }
    };

    if (checking) return (
        <div className={s.loadingScreen}>
            <div className={s.loadingLogo}>HUASCARÁN</div>
            <div className={s.loadingRing}/>
        </div>
    );

    return (
        <div className={s.root}>

            {/* Fondo */}
            <div className={s.bgPhoto} style={{ '--bg-url': `url(${bgHuascaran})` }}/>
            <div className={s.bgOverlay}/>
            <div className={s.bgGrid}/>
            <div className={s.dotGrid}/>

            {/* Geometría SVG */}
            <svg className={s.geo} viewBox="0 0 1440 900"
                preserveAspectRatio="xMidYMid slice"
                aria-hidden="true" focusable="false">
                <line x1="-20" y1="380" x2="500" y2="-20"
                    stroke="rgba(26,160,130,0.07)" strokeWidth="1"
                    strokeDasharray="700" strokeDashoffset="700"
                    className={s.drawLine}/>
                <line x1="0" y1="900" x2="340" y2="540"
                    stroke="rgba(46,109,164,0.1)" strokeWidth="1"
                    strokeDasharray="500" strokeDashoffset="500"
                    className={s.drawLine}/>
                <polygon points="1440,0 1440,180 1260,0" fill="rgba(46,109,164,0.1)"/>
                <polygon points="1440,0 1440,80 1360,0"  fill="rgba(26,160,130,0.07)"/>
                <circle cx="0" cy="900" r="180" fill="none" stroke="rgba(26,160,130,0.06)" strokeWidth="1"/>
                <circle cx="0" cy="900" r="110" fill="none" stroke="rgba(26,160,130,0.09)" strokeWidth="1"/>
            </svg>

            {/* Esquinas */}
            <div className={`${s.corner} ${s.cTl}`} aria-hidden="true"/>
            <div className={`${s.corner} ${s.cTr}`} aria-hidden="true"/>
            <div className={`${s.corner} ${s.cBl}`} aria-hidden="true"/>
            <div className={`${s.corner} ${s.cBr}`} aria-hidden="true"/>

            <div className={s.inner}>

                {/* Panel izquierdo */}
                <div className={s.hero}>
                    <div className={s.heroTop}>
                        <img src={logo} alt="Huascarán" className={s.heroLogo}/>
                    </div>
                    <div className={s.heroMiddle}>
                        <h1 className={s.heroHeadline}>
                            Controla tus ventas<br/>
                            y stock en <span className={s.accent}>tiempo real,</span><br/>
                            sin errores ni pérdidas
                        </h1>
                        <div className={s.heroDivider}/>
                        <p className={s.heroSub}>
                            Una plataforma completa de punto de venta<br/>
                            e inventario para impulsar tu negocio.
                        </p>
                        <div className={s.heroFeatures}>
                            {FEATURES.map((f, i) => (
                                <div className={s.featureCard} key={i}>
                                    <div className={s.featureIcon}>{f.icon}</div>
                                    <div className={s.featureTitle}>{f.title}</div>
                                    <div className={s.featureDesc}>{f.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Panel derecho glass */}
                <div className={s.formPanel}>
                    <div className={s.formHead}>
                        <p className={s.formEyebrow}>{requiereSetup ? 'Primer arranque' : 'Acceso al sistema'}</p>
                        <h2 className={s.formTitle}>Iniciar sesión</h2>
                        <p className={s.formSub}>Ingresa tus credenciales para continuar</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className={s.fieldGroup}>
                            {requiereSetup && (
                                <div className={`${s.field} ${s.fieldA1}`}>
                                    <label className={s.fieldLabel}><User size={11}/> Nombre completo</label>
                                    <div className={s.fieldWrap}>
                                        <User className={s.fieldIcon} size={15}/>
                                        <input type="text" className={s.fieldInput}
                                            placeholder="Administrador"
                                            value={nombreAdmin}
                                            onChange={e => setNombreAdmin(e.target.value)}
                                            disabled={loading}/>
                                    </div>
                                </div>
                            )}
                            <div className={`${s.field} ${s.fieldA1}`}>
                                <label className={s.fieldLabel}><User size={11}/> Usuario</label>
                                <div className={s.fieldWrap}>
                                    <User className={s.fieldIcon} size={15}/>
                                    <input type="text" className={s.fieldInput}
                                        placeholder={requiereSetup ? 'Nuevo usuario admin' : 'Nombre de usuario'}
                                        value={username}
                                        onChange={e => setUsername(e.target.value)}
                                        autoFocus disabled={loading}/>
                                </div>
                            </div>

                            <div className={`${s.field} ${s.fieldA2}`}>
                                <label className={s.fieldLabel}><Lock size={11}/> Contraseña</label>
                                <div className={s.fieldWrap}>
                                    <Lock className={s.fieldIcon} size={15}/>
                                    <input type={showPw ? 'text' : 'password'}
                                        className={s.fieldInput} placeholder="••••••••"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        disabled={loading} style={{ paddingRight: '44px' }}/>
                                    <button type="button" className={s.togglePw}
                                        onClick={() => setShowPw(v => !v)}
                                        tabIndex={-1}
                                        aria-label={showPw ? 'Ocultar' : 'Mostrar'}>
                                        {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className={s.formOptions}>
                            <label className={s.rememberLabel}>
                                <input type="checkbox" className={s.rememberCheck}
                                    checked={remember}
                                    onChange={e => setRemember(e.target.checked)}/>
                                <span className={s.rememberText}>Permanecer conectado</span>
                            </label>
                        </div>

                        <div className={s.btnWrap}>
                            <button type="submit" className={s.btnSubmit} disabled={loading}>
                                {loading
                                    ? <><div className={s.spinnerRing}/> Verificando...</>
                                    : <><LogIn size={17}/> {requiereSetup ? 'Crear administrador' : 'Ingresar'}</>}
                            </button>
                        </div>

                        <div className={s.waHelp}>
                            <span>¿Necesitas ayuda? Contáctanos por</span>
                            <button className={s.waLink} onClick={abrirWhatsApp} type="button">
                                <MessageCircle size={14}/> WhatsApp
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {mostrarRecuperacion && (
                <ModalRecuperacion onCerrar={() => setMostrarRecuperacion(false)} />
            )}
        </div>
    );
}
