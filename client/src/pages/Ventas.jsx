import { useState, useEffect, useMemo, useRef } from 'react';
import { getProductos, createVenta, getVenta, createCliente, getProductoPorBarcode, emitirCPE, consultarDocumento } from '../services/api';
import { useVentas } from '../context/VentasContext';
import { formatCurrency, calcularIGV } from '../utils/helpers';
import { useToast } from '../components/Toast';
import { Search, Plus, Minus, Trash2, ShoppingCart, Banknote, X, FileText, ScanBarcode, CheckCircle2, LayoutGrid, List, AlertTriangle, Landmark } from 'lucide-react';
import { generateComprobantePDF } from '../utils/generateComprobantePDF';
import { generateTicketPDF } from '../utils/generateTicketPDF';
import logger from '../utils/logger';


export default function Ventas() {
    const toast = useToast();
    const {
        cart, setCart,
        tipoComprobante, setTipoComprobante,
        formaPago, setFormaPago,
        clienteId, setClienteId,
        montoRecibido, setMontoRecibido,
        montoEfectivo, setMontoEfectivo,
        montoYape, setMontoYape,
        descuento,
        esCredito, setEsCredito,
        montoAdelanto, setMontoAdelanto,
        medioPagoAdelanto, setMedioPagoAdelanto,
        fechaVencimiento, setFechaVencimiento,
        notasCredito, setNotasCredito,
        barcode, setBarcode,
        search, setSearch,
        clientes, setClientes,
        configApp, sunatActivo,
        categoriasDB,
        vaciarVenta
    } = useVentas();

    const [productos, setProductos] = useState([]);
    const [filterCat, setFilterCat] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [showCheckout, setShowCheckout] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [lastVenta, setLastVenta] = useState(null);
    const [showNuevoCliente, setShowNuevoCliente] = useState(false);
    const [nuevoClienteForm, setNuevoClienteForm] = useState({ tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: '', tipo_documento: 'DNI', numero_documento: '', telefono: '' });
    const [guardandoCliente, setGuardandoCliente] = useState(false);
    const [buscandoDocVenta, setBuscandoDocVenta] = useState(false);
    const [confirmVaciar, setConfirmVaciar] = useState(false);

    const [showPrintModal, setShowPrintModal] = useState(false);
    const [ventaParaImprimir, setVentaParaImprimir] = useState(null);
    const [emitiendoCPE, setEmitiendoCPE] = useState(false);
    const [showQrElegirModal, setShowQrElegirModal] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    const [qrSeleccionado, setQrSeleccionado] = useState(null); // 'YAPE' | 'PLIN'
    const [showTransferenciaModal, setShowTransferenciaModal] = useState(false);

    const searchInputRef = useRef(null);

    const refreshProductos = () => getProductos({ estado: 'true' }).then(setProductos);

    useEffect(() => {
        refreshProductos();
    }, []);

    const tasaIGV = parseFloat(configApp.igv || 18);

    const idsCategoriaConProductos = [...new Set(productos.map(p => p.id_categoria).filter(Boolean))];
    const categorias = idsCategoriaConProductos
        .map(id => categoriasDB.find(c => c.id_categoria === id))
        .filter(Boolean);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        const base = !filterCat
            ? [...productos].filter(p => (p.stock_tienda ?? p.stock_actual) > 0).sort((a, b) => (b.fecha_creacion ?? '').localeCompare(a.fecha_creacion ?? ''))
            : productos.filter(p => p.id_categoria === filterCat);
        return base.filter(p => !q || p.nombre.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }, [productos, search, filterCat]);
    
    const addToCart = (product) => {
        const stockTienda = product.stock_tienda ?? product.stock_actual;
        if (stockTienda <= 0) { toast('Producto sin stock en Tienda', 'error'); return; }
        const existing = cart.find(c => c.id_producto === product.id_producto);
        if (existing) {
            if (existing.cantidad >= stockTienda) {
                toast(`Stock insuficiente en Tienda. Solo hay ${stockTienda} unidades`, 'warning');
                return;
            }
            setCart(cart.map(c => c.id_producto === product.id_producto ? { ...c, cantidad: c.cantidad + 1 } : c));
        } else {
            setCart([...cart, { ...product, cantidad: 1, descuento_linea: 0 }]);
        }
    };

    const handleBarcodeKeyDown = async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = barcode.trim();
            if (!query) return;
            setBarcode('');
            try {
                const product = await getProductoPorBarcode(query);
                const stockTienda = product.stock_tienda ?? product.stock_actual;
                if (stockTienda <= 0) { toast(`El producto ${product.nombre} no tiene stock en Tienda`, 'error'); return; }
                addToCart(product);
            } catch (err) {
                if (err.response?.status === 404) toast(`Código no encontrado: ${query}`, 'warning');
                else toast('Hubo un error al buscar el código de barras', 'error');
            }
        }
    };

    const updateQty = (id, delta) => {
        setCart(cart.map(c => {
            if (c.id_producto !== id) return c;
            const newQty = c.cantidad + delta;
            if (newQty <= 0) return c;
            const prod = productos.find(p => p.id_producto === id);
            const stockTienda = prod ? (prod.stock_tienda ?? prod.stock_actual) : c.stock_actual;
            if (newQty > stockTienda) { toast(`Solo hay ${stockTienda} unidades en Tienda`, 'warning'); return c; }
            return { ...c, cantidad: newQty };
        }));
    };

    const removeFromCart = (id) => setCart(cart.filter(c => c.id_producto !== id));

    const subtotalBruto = cart.reduce((s, c) => s + (c.precio_venta * c.cantidad - c.descuento_linea), 0);
    const totalConDescuento = subtotalBruto - descuento;
    const { subtotal, igv } = calcularIGV(totalConDescuento);
    const vuelto = formaPago === 'EFECTIVO' ? Math.max(0, Number(montoRecibido) - totalConDescuento) : 0;

    const sumaMixto = Number(montoEfectivo || 0) + Number(montoYape || 0);
    const mixtoOk = Math.abs(sumaMixto - totalConDescuento) <= 0.02;

    let cuentasTransferencia = [];
    try { cuentasTransferencia = JSON.parse(configApp.transferencia_cuentas || '[]'); } catch { cuentasTransferencia = []; }

    const clienteSeleccionado = clientes.find(c => String(c.id_cliente) === String(clienteId));
    const facturaRequiereRuc = tipoComprobante === 'FACTURA' && !clienteId;
    const facturaClienteSinRuc = tipoComprobante === 'FACTURA' && clienteId && clienteSeleccionado?.tipo_documento !== 'RUC';

    const handleCheckout = async () => {
        if (cart.length === 0) return;

        if (tipoComprobante === 'FACTURA' && !clienteId) {
            toast('La factura requiere seleccionar un cliente con RUC', 'warning');
            return;
        }
        if (tipoComprobante === 'FACTURA' && clienteSeleccionado?.tipo_documento !== 'RUC') {
            toast('La factura solo puede emitirse a clientes con RUC (empresas)', 'warning');
            return;
        }
        if (formaPago === 'MIXTO' && !esCredito && !mixtoOk) {
            toast(`La suma de Efectivo + Yape/Plin debe ser S/ ${totalConDescuento.toFixed(2)}`, 'warning');
            return;
        }
        if (esCredito && !clienteId) {
            toast('Para venta a crédito debes seleccionar un cliente', 'warning');
            return;
        }
        if (esCredito && Number(montoAdelanto) > totalConDescuento) {
            toast('El adelanto no puede ser mayor al total', 'warning');
            return;
        }

        setProcessing(true);
        try {
            let finalFormaPago = formaPago;
            let montoEfectivoFinal = 0;
            let montoYapeFinal     = 0;

            if (esCredito) {
                finalFormaPago = 'CREDITO';
                if (Number(montoAdelanto) > 0) {
                    if (medioPagoAdelanto === 'EFECTIVO')  montoEfectivoFinal = Number(montoAdelanto);
                    else                                    montoYapeFinal     = Number(montoAdelanto);
                }
            } else if (formaPago === 'MIXTO') {
                montoEfectivoFinal = Number(montoEfectivo) || 0;
                montoYapeFinal     = Number(montoYape)     || 0;
            } else if (formaPago === 'EFECTIVO') {
                montoEfectivoFinal = totalConDescuento;
            } else if (formaPago === 'YAPE_PLIN') {
                montoYapeFinal = totalConDescuento;
            } else if (formaPago === 'TRANSFERENCIA') {
                montoEfectivoFinal = 0;
                montoYapeFinal     = 0;
            }

            const result = await createVenta({
                items: cart.map(c => ({ id_producto: c.id_producto, cantidad: c.cantidad, descuento_linea: c.descuento_linea })),
                id_cliente: clienteId || null,
                tipo_comprobante: tipoComprobante,
                forma_pago: finalFormaPago,
                monto_efectivo:  montoEfectivoFinal,
                monto_yape_plin: montoYapeFinal,
                descuento,
                es_credito: esCredito,
                monto_adelanto: esCredito ? Number(montoAdelanto) || 0 : 0,
                medio_pago_adelanto: medioPagoAdelanto,
                fecha_vencimiento: esCredito && fechaVencimiento ? fechaVencimiento : null,
                notas_credito: notasCredito,
            });
            toast('Venta registrada: ' + (result.numero_comprobante || result.numero_venta));
            setLastVenta(result);
            try {
                const ventaCompleta = await getVenta(result.id_venta);
                try { await generateComprobantePDF(ventaCompleta, { soloGuardar: true }); } catch (e) { logger.error('VENTAS', '[guardar A4]', e); }
                setVentaParaImprimir(ventaCompleta);
                setShowPrintModal(true);
            } catch (pdfErr) {
                logger.error('VENTAS', 'Error cargando venta:', pdfErr);
            }
            vaciarVenta();
            setShowCheckout(false);
            refreshProductos();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al procesar la venta', 'error');
        }
        setProcessing(false);
    };

    // Decide qué pasa al elegir Yape/Plin: modal de elección si hay ambos QR,
    // modal grande directo si hay solo uno, o nada si está desactivado / sin QR.
    const activarFlujoQr = () => {
        if (configApp.qr_pago_activo !== '1') return;
        const tieneYape = !!configApp.qr_yape_imagen;
        const tienePlin = !!configApp.qr_plin_imagen;
        if (tieneYape && tienePlin) {
            setShowQrElegirModal(true);
        } else if (tieneYape) {
            setQrSeleccionado('YAPE');
            setShowQrModal(true);
        } else if (tienePlin) {
            setQrSeleccionado('PLIN');
            setShowQrModal(true);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            // F2: enfocar búsqueda de productos
            if (e.key === 'F2') {
                e.preventDefault();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
            }

            // Escape: cerrar modales
            if (e.key === 'Escape') {
                if (showNuevoCliente) {
                    setShowNuevoCliente(false);
                } else if (showCheckout) {
                    setShowCheckout(false);
                } else if (confirmVaciar) {
                    setConfirmVaciar(false);
                } else if (showPrintModal) {
                    setShowPrintModal(false);
                }
            }

            // F12: Cobrar / Registrar Venta
            if (e.key === 'F12') {
                e.preventDefault();
                if (!showCheckout) {
                    if (cart.length > 0) {
                        setShowCheckout(true);
                    }
                } else {
                    if (!processing && !facturaRequiereRuc && !facturaClienteSinRuc) {
                        handleCheckout();
                    }
                }
            }

            // Teclas de pago (F5 - F8) solo si el checkout está abierto
            if (showCheckout && !showNuevoCliente) {
                if (e.key === 'F5') {
                    e.preventDefault();
                    setFormaPago('EFECTIVO');
                    setEsCredito(false);
                    setMontoEfectivo('');
                    setMontoYape('');
                }
                if (e.key === 'F6') {
                    e.preventDefault();
                    setFormaPago('YAPE_PLIN');
                    setEsCredito(false);
                    setMontoEfectivo('');
                    setMontoYape('');
                    activarFlujoQr();
                }
                if (e.key === 'F7') {
                    e.preventDefault();
                    setFormaPago('TRANSFERENCIA');
                    setEsCredito(false);
                    setMontoEfectivo('');
                    setMontoYape('');
                }
                if (e.key === 'F8') {
                    e.preventDefault();
                    setFormaPago('MIXTO');
                    setEsCredito(false);
                    setMontoEfectivo('');
                    setMontoYape('');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
        }, [showCheckout, showNuevoCliente, confirmVaciar, showPrintModal, cart, processing, facturaRequiereRuc, facturaClienteSinRuc, setFormaPago, setEsCredito, setMontoEfectivo, setMontoYape, handleCheckout, configApp, activarFlujoQr]);

    const buscarDocumentoVenta = async (tipo, numero) => {
        setBuscandoDocVenta(true);
        try {
            const data = await consultarDocumento(tipo, numero);
            if (data.nombre_razon_social) {
                setNuevoClienteForm(prev => ({ ...prev, nombre_razon_social: data.nombre_razon_social }));
            }
        } catch (err) {
            toast(err.response?.data?.error || 'No se pudo autocompletar. Ingresa el nombre manualmente.', 'warning');
        } finally {
            setBuscandoDocVenta(false);
        }
    };

    const handleCrearClienteRapido = async (e) => {
        e.preventDefault();
        setGuardandoCliente(true);
        try {
            const nuevo = await createCliente({ ...nuevoClienteForm, direccion: '', email: '' });
            toast('Cliente registrado correctamente');
            setClienteId(nuevo.id_cliente);
            setClientes(prev => [...prev, nuevo]);
            setShowNuevoCliente(false);
            setNuevoClienteForm({ tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: '', tipo_documento: 'DNI', numero_documento: '', telefono: '' });
        } catch (err) {
            toast(err.response?.data?.error || 'Error al registrar cliente', 'error');
        }
        setGuardandoCliente(false);
    };

    return (
        <div className="page-enter" style={{ height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#735DFF,#C516E1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingCart size={19} color="white" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1D1136', margin: 0, letterSpacing: '-0.02em' }}>Punto de Venta</h1>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{productos.filter(p => p.stock_actual > 0).length} productos disponibles</p>
                    </div>
                </div>
                {lastVenta && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(16,185,129,0.06)', border: '1.5px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '8px 14px' }}>
                        <CheckCircle2 size={15} color="#10B981" />
                        <div>
                            <p style={{ fontSize: 11, fontWeight: 800, color: '#10B981', margin: 0 }}>{lastVenta.numero_comprobante || lastVenta.numero_venta}</p>
                            <p style={{ fontSize: 10, color: '#64748b', margin: 0 }}>{formatCurrency(lastVenta.total)}</p>
                        </div>
                        <button onClick={async () => { const v = await getVenta(lastVenta.id_venta); await generateComprobantePDF(v); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1.5px solid rgba(16,185,129,0.3)', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#10B981' }}>
                            <FileText size={12} /> A4
                        </button>
                        <button onClick={async () => { const v = await getVenta(lastVenta.id_venta); await generateTicketPDF(v, configApp); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1.5px solid rgba(16,185,129,0.3)', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#10B981' }}>
                            <FileText size={12} /> Ticket
                        </button>
                    </div>
                )}
            </div>

            {/* ── Layout POS ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden' }}>

                {/* ── Panel izquierdo: Productos ── */}
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: 'calc(100vh - 130px)', overflow: 'hidden' }}>

                    {/* Búsqueda + barcode + vista */}
                    <div className="card" style={{ padding: '12px 16px', marginBottom: 12, flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                            <div className="search-bar" style={{ flex: 1 }}>
                                <Search size={14} className="search-icon" />
                                <input ref={searchInputRef} className="form-input" placeholder="Buscar producto por nombre o SKU…"
                                    value={search} onChange={e => setSearch(e.target.value)}
                                    autoFocus style={{ paddingLeft: 38 }} />
                            </div>
                            {configApp.escaner_activo === '1' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(115,93,255,0.06)', border: '1.5px solid rgba(115,93,255,0.2)', borderRadius: 10, padding: '0 12px', height: 42, minWidth: 200 }}>
                                    <ScanBarcode size={15} color="#735DFF" />
                                    <input style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'Inter', color: '#1D1136', width: '100%' }}
                                        placeholder="Escanear código…" value={barcode}
                                        onChange={e => setBarcode(e.target.value)} onKeyDown={handleBarcodeKeyDown} />
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 4 }}>
                                {[['grid', LayoutGrid], ['list', List]].map(([m, _Icon]) => (
                                    <button key={m} onClick={() => setViewMode(m)}
                                        style={{ padding: '8px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s', borderColor: viewMode === m ? '#735DFF' : '#e2e8f0', background: viewMode === m ? 'rgba(115,93,255,0.08)' : 'white', color: viewMode === m ? '#735DFF' : '#94a3b8' }}>
                                        <_Icon size={16} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Filtro categorías */}
                        {categorias.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                                <button onClick={() => setFilterCat('')}
                                    style={{ padding: '5px 12px', borderRadius: 20, border: '1.5px solid', whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0, transition: 'all 0.15s', borderColor: !filterCat ? '#735DFF' : '#e2e8f0', background: !filterCat ? 'rgba(115,93,255,0.08)' : 'white', color: !filterCat ? '#735DFF' : '#64748b' }}>
                                    Recientes
                                </button>
                                {categorias.map(cat => (
                                    <button key={cat.id_categoria} onClick={() => setFilterCat(cat.id_categoria === filterCat ? '' : cat.id_categoria)}
                                        style={{ padding: '5px 12px', borderRadius: 20, border: '1.5px solid', whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0, transition: 'all 0.15s', borderColor: filterCat === cat.id_categoria ? '#735DFF' : '#e2e8f0', background: filterCat === cat.id_categoria ? 'rgba(115,93,255,0.08)' : 'white', color: filterCat === cat.id_categoria ? '#735DFF' : '#64748b' }}>
                                        {cat.icono || '📦'} {cat.nombre}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Grid / Lista productos */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {viewMode === 'grid' ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 10 }}>
                                {filtered.slice(0, 50).map(p => {
                                    const sinStock  = p.stock_actual <= 0;
                                    const stockBajo = !sinStock && p.stock_minimo && p.stock_actual <= p.stock_minimo;
                                    const inCart    = cart.find(c => c.id_producto === p.id_producto);
                                    return (
                                        <div key={p.id_producto} onClick={() => addToCart(p)}
                                            style={{ background: 'white', border: `2px solid ${inCart ? '#735DFF' : sinStock ? '#fecaca' : '#e2e8f0'}`, borderRadius: 12, padding: '14px 12px', cursor: sinStock ? 'not-allowed' : 'pointer', opacity: sinStock ? 0.55 : 1, transition: 'all 0.15s', position: 'relative', boxShadow: inCart ? '0 0 0 3px rgba(115,93,255,0.1)' : 'none' }}>
                                            {inCart && (
                                                <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: '#735DFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white' }}>{inCart.cantidad}</div>
                                            )}
                                            <p style={{ fontSize: 10, fontWeight: 700, color: '#735DFF', fontFamily: 'monospace', margin: '0 0 4px' }}>{p.sku}</p>
                                            {p.categoria && <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', marginBottom: 4, display: 'inline-block' }}>{categoriasDB.find(c => c.id_categoria === p.id_categoria)?.icono || '📦'} {p.categoria}</span>}
                                            <p style={{ fontSize: 12, fontWeight: 600, color: '#1D1136', margin: '4px 0 8px', lineHeight: 1.3, minHeight: '2.4em' }}>{p.nombre}</p>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <p style={{ fontSize: 15, fontWeight: 800, color: '#1D1136', margin: 0 }}>{formatCurrency(p.precio_venta)}</p>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: sinStock ? 'rgba(239,68,68,0.1)' : stockBajo ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', color: sinStock ? '#EF4444' : stockBajo ? '#D97706' : '#10B981' }}>
                                                    {sinStock ? 'Agotado' : `${p.stock_actual} uds`}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <table className="data-table">
                                    <thead><tr><th>Producto</th><th>Categoría</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'center' }}>Stock</th><th></th></tr></thead>
                                    <tbody>
                                        {filtered.slice(0, 60).map(p => {
                                            const stockTienda = p.stock_tienda ?? p.stock_actual;
                                            const sinStock  = stockTienda <= 0;
                                            const stockBajo = !sinStock && p.stock_minimo && stockTienda <= p.stock_minimo;
                                            const inCart    = cart.find(c => c.id_producto === p.id_producto);
                                            return (
                                                <tr key={p.id_producto} style={{ opacity: sinStock ? 0.5 : 1 }}>
                                                    <td>
                                                        <p style={{ fontSize: 13, fontWeight: 600, color: '#1D1136', margin: 0 }}>{p.nombre}</p>
                                                        <p style={{ fontSize: 10, color: '#735DFF', fontFamily: 'monospace', margin: '1px 0 0' }}>{p.sku}</p>
                                                    </td>
                                                    <td style={{ fontSize: 11, color: '#64748b' }}>{p.categoria || '—'}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#1D1136' }}>{formatCurrency(p.precio_venta)}</td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: sinStock ? 'rgba(239,68,68,0.1)' : stockBajo ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', color: sinStock ? '#EF4444' : stockBajo ? '#D97706' : '#10B981' }}>
                                                            {sinStock ? 'Agotado' : stockTienda}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button onClick={() => addToCart(p)} disabled={sinStock}
                                                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 7, border: `1.5px solid ${inCart ? '#735DFF' : '#e2e8f0'}`, background: inCart ? 'rgba(115,93,255,0.08)' : 'white', cursor: sinStock ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, color: inCart ? '#735DFF' : '#64748b' }}>
                                                            {inCart ? <><Plus size={12} />{inCart.cantidad}</> : <><Plus size={12} /> Agregar</>}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Panel derecho: Carrito ── */}
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', padding: 0, overflow: 'hidden' }}>

                        {/* Header carrito */}
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg,#f8f7ff,#fdf4ff)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ShoppingCart size={17} color="#735DFF" />
                                <span style={{ fontSize: 14, fontWeight: 800, color: '#1D1136' }}>Carrito</span>
                                {cart.length > 0 && (
                                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: '#735DFF', color: 'white' }}>{cart.length}</span>
                                )}
                            </div>
                            {cart.length > 0 && (
                                <button
                                    onClick={() => setConfirmVaciar(true)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, border: '1.5px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#EF4444' }}>
                                    <Trash2 size={12} /> Vaciar
                                </button>
                            )}
                        </div>

                        {/* Confirmación inline vaciar carrito */}
                        {confirmVaciar && (
                            <div style={{ margin: '8px 14px 0', padding: '10px 14px', background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>¿Vaciar todo el carrito?</span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => setConfirmVaciar(false)}
                                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                                        Cancelar
                                    </button>
                                    <button onClick={() => { vaciarVenta(); setConfirmVaciar(false); }}
                                        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'white' }}>
                                        Sí, vaciar
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Items carrito */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', minHeight: 0 }}>
                            {cart.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32 }}>
                                    <ShoppingCart size={48} style={{ color: '#e2e8f0' }} />
                                    <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 12 }}>Carrito vacío</p>
                                    <p style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>Haz clic en un producto para agregarlo</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {cart.map(item => (
                                        <div key={item.id_producto} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1D1136', lineHeight: 1.3, margin: 0 }}>{item.nombre}</p>
                                                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.sku} · {formatCurrency(item.precio_venta)} c/u</p>
                                                </div>
                                                <p style={{ fontSize: 14, fontWeight: 800, color: '#735DFF', flexShrink: 0, margin: 0 }}>{formatCurrency(item.precio_venta * item.cantidad)}</p>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <button onClick={() => updateQty(item.id_producto, -1)} style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}><Minus size={12} /></button>
                                                    <span style={{ width: 32, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#1D1136' }}>{item.cantidad}</span>
                                                    <button onClick={() => updateQty(item.id_producto, 1)} style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}><Plus size={12} /></button>
                                                </div>
                                                <button onClick={() => removeFromCart(item.id_producto)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1.5px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#EF4444' }}>
                                                    <Trash2 size={11} /> Quitar
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Totales + botón */}
                        <div style={{ padding: '12px 14px', borderTop: '1px solid #f1f5f9', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                                    <span>Subtotal (sin IGV)</span><span>{formatCurrency(subtotal)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                                    <span>IGV ({tasaIGV}%)</span><span>{formatCurrency(igv)}</span>
                                </div>
                                {descuento > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#EF4444', marginBottom: 4 }}>
                                        <span>Descuento</span><span>-{formatCurrency(descuento)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#1D1136', paddingTop: 8, borderTop: '1px solid #e2e8f0', marginTop: 6 }}>
                                    <span>TOTAL</span>
                                    <span style={{ color: '#735DFF' }}>{formatCurrency(totalConDescuento)}</span>
                                </div>
                            </div>
                            <button disabled={cart.length === 0} onClick={() => setShowCheckout(true)}
                                style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: cart.length === 0 ? '#94a3b8' : 'linear-gradient(135deg,#735DFF,#C516E1)', color: 'white', fontSize: 15, fontWeight: 800, cursor: cart.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: cart.length === 0 ? 'none' : '0 4px 16px rgba(115,93,255,0.35)', transition: 'all 0.15s' }}>
                                <ShoppingCart size={18} /> Procesar Venta
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══ Modal Checkout — 2 columnas ══════════════════════════ */}
            {showCheckout && (
                <div className="modal-overlay" style={{ zIndex: 50 }} onClick={() => setShowCheckout(false)}>
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'white',
                            borderRadius: 16,
                            width: '92vw',
                            maxWidth: 860,
                            maxHeight: '92vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Header */}
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'white' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#735DFF,#C516E1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ShoppingCart size={16} color="white" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: 0 }}>Finalizar Venta</h2>
                                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0' }}>
                                        {cart.length} {cart.length === 1 ? 'producto' : 'productos'} · {formatCurrency(totalConDescuento)}
                                    </p>
                                </div>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowCheckout(false)}><X size={18} /></button>
                        </div>

                        {/* Body 2 columnas */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', flex: 1, minHeight: 0, overflow: 'hidden' }}>

                            {/* ── Columna izquierda: formulario ─── */}
                            <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                                {/* Tipo comprobante */}
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                                        Tipo de Comprobante
                                    </label>
                                    <div className="flex gap-3">
                                        {[
                                            { val: 'BOLETA', emoji: '🧾', desc: 'Personas naturales' },
                                            { val: 'FACTURA', emoji: '📄', desc: 'Empresas con RUC' },
                                        ].map(t => (
                                            <button key={t.val} onClick={() => setTipoComprobante(t.val)}
                                                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${tipoComprobante === t.val ? '#7c3aed' : '#e2e8f0'}`, background: tipoComprobante === t.val ? '#f5f3ff' : '#fafafa', textAlign: 'center', transition: 'all 0.15s' }}>
                                                <div style={{ fontSize: 18 }}>{t.emoji}</div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: tipoComprobante === t.val ? '#7c3aed' : '#334155' }}>{t.val}</div>
                                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{t.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Cliente */}
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                                        Cliente
                                        {tipoComprobante === 'FACTURA' && (
                                            <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'none', letterSpacing: 0 }}>* Obligatorio con RUC</span>
                                        )}
                                    </label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <select className="form-select" style={{ flex: 1 }} value={clienteId} onChange={e => setClienteId(e.target.value)}>
                                            <option value="">👤 Consumidor Final</option>
                                            {[...clientes]
                                                .sort((a, b) => b.id_cliente - a.id_cliente)
                                                .slice(0, 20)
                                                .map(c => (
                                                    <option key={c.id_cliente} value={c.id_cliente}>{c.nombre_razon_social} — {c.numero_documento}</option>
                                                ))}
                                        </select>
                                        <button type="button" onClick={() => setShowNuevoCliente(true)}
                                            style={{ padding: '8px 14px', background: 'white', border: '1.5px solid #7c3aed', borderRadius: 8, cursor: 'pointer', color: '#7c3aed', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Plus size={14} /> Nuevo
                                        </button>
                                    </div>
                                    {facturaRequiereRuc && (
                                        <div style={{ marginTop: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <AlertTriangle size={14} color="#ea580c" />
                                            <p style={{ fontSize: 12, color: '#ea580c', fontWeight: 600, margin: 0 }}>La factura requiere seleccionar un cliente con RUC.</p>
                                        </div>
                                    )}
                                    {facturaClienteSinRuc && (
                                        <div style={{ marginTop: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <AlertTriangle size={14} color="#ea580c" />
                                            <p style={{ fontSize: 12, color: '#ea580c', fontWeight: 600, margin: 0 }}>Este cliente no tiene RUC. La factura solo puede emitirse a empresas.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Medio de Pago */}
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                                        Medio de Pago
                                    </label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[
                                            { val: 'EFECTIVO',      emoji: '💵', label: 'Efectivo' },
                                            { val: 'YAPE_PLIN',     emoji: '📱', label: 'Yape / Plin' },
                                            { val: 'TRANSFERENCIA', emoji: '🏦', label: 'Transferencia' },
                                            { val: 'MIXTO',         emoji: '🔀', label: 'Mixto' },
                                        ].map(f => (
                                            <button key={f.val} onClick={() => {
                                                setFormaPago(f.val);
                                                setEsCredito(false);
                                                setMontoEfectivo('');
                                                setMontoYape('');
                                                if (f.val === 'YAPE_PLIN') activarFlujoQr();
                                            }}
                                                style={{ padding: '10px 6px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${formaPago === f.val && !esCredito ? '#7c3aed' : '#e2e8f0'}`, background: formaPago === f.val && !esCredito ? '#f5f3ff' : '#fafafa', textAlign: 'center', transition: 'all 0.15s', opacity: esCredito ? 0.45 : 1 }}>
                                                <div style={{ fontSize: 18 }}>{f.emoji}</div>
                                                <div style={{ fontSize: 11, fontWeight: 600, color: formaPago === f.val && !esCredito ? '#7c3aed' : '#64748b', marginTop: 2 }}>{f.label}</div>
                                            </button>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
                                        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Condición de pago</span>
                                        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                                    </div>

                                    <button onClick={() => { setEsCredito(!esCredito); if (!esCredito) setFormaPago('EFECTIVO'); }}
                                        style={{ width: '100%', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${esCredito ? '#dc2626' : '#e2e8f0'}`, background: esCredito ? '#fef2f2' : '#fafafa', textAlign: 'center', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 18 }}>📋</span>
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: esCredito ? '#dc2626' : '#64748b' }}>Venta a Crédito / Fiado</div>
                                            <div style={{ fontSize: 11, color: esCredito ? '#f87171' : '#94a3b8' }}>Registra la deuda y abonos del cliente</div>
                                        </div>
                                        {esCredito && <span style={{ marginLeft: 'auto', fontSize: 14, color: '#dc2626', fontWeight: 800 }}>✓</span>}
                                    </button>
                                </div>

                                {/* Panel FIADO */}
                                {esCredito && (
                                    <div style={{ background: 'linear-gradient(135deg, #fff5f5, #fef2f2)', border: '2px solid #fca5a5', borderRadius: 14, padding: 18, boxShadow: '0 2px 12px rgba(220,38,38,0.08)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                            <div>
                                                <p style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', margin: 0 }}>Configuración de Venta a Crédito</p>
                                                <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>El cliente pagará en partes o al vencimiento</p>
                                            </div>
                                        </div>

                                        <div style={{ background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: '1px solid #fca5a5' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Total de la deuda</span>
                                                <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{formatCurrency(totalConDescuento)}</span>
                                            </div>
                                            {Number(montoAdelanto) > 0 && (
                                                <>
                                                    <div style={{ height: 8, background: '#fee2e2', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                                                        <div style={{ height: '100%', width: `${Math.min(100, (Number(montoAdelanto) / totalConDescuento) * 100)}%`, background: 'linear-gradient(90deg, #16a34a, #22c55e)', borderRadius: 4, transition: 'width 0.3s' }} />
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                                        <span style={{ color: '#16a34a', fontWeight: 600 }}>Adelanto: {formatCurrency(Number(montoAdelanto))}</span>
                                                        <span style={{ color: '#dc2626', fontWeight: 700 }}>Pendiente: {formatCurrency(Math.max(0, totalConDescuento - Number(montoAdelanto)))}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Adelanto */}
                                        <div style={{ marginBottom: 12 }}>
                                            <label className="form-label" style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'block' }}>
                                                Adelanto inicial (S/) — 0 si es fiado puro
                                            </label>
                                            <input className="form-input" type="number" step="0.10" min="0" max={totalConDescuento}
                                                value={montoAdelanto} onChange={e => setMontoAdelanto(e.target.value)}
                                                placeholder="0.00" style={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }} />
                                            {totalConDescuento > 0 && (
                                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                    {[0, 25, 50].map(pct => (
                                                        <button key={pct} type="button"
                                                            onClick={() => setMontoAdelanto(pct === 0 ? '' : (totalConDescuento * pct / 100).toFixed(2))}
                                                            style={{ flex: 1, padding: '4px', borderRadius: 6, border: '1px solid #fca5a5', background: 'white', cursor: 'pointer', fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                                                            {pct === 0 ? 'Sin adelanto' : `${pct}%`}
                                                        </button>
                                                    ))}
                                                    <button type="button"
                                                        onClick={() => setMontoAdelanto(totalConDescuento.toFixed(2))}
                                                        style={{ flex: 1, padding: '4px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', cursor: 'pointer', fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
                                                        100%
                                                    </button>
                                                </div>
                                            )}
                                            {Number(montoAdelanto) > 0 && (
                                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                                    {[
                                                        { val: 'EFECTIVO',      label: 'Efectivo' },
                                                        { val: 'YAPE_PLIN',     label: 'Yape/Plin' },
                                                        { val: 'TRANSFERENCIA', label: 'Transferencia' },
                                                    ].map(m => (
                                                        <button key={m.val} type="button" onClick={() => setMedioPagoAdelanto(m.val)}
                                                            style={{ flex: 1, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                                border: `1.5px solid ${medioPagoAdelanto === m.val ? '#dc2626' : '#fca5a5'}`,
                                                                background: medioPagoAdelanto === m.val ? '#fee2e2' : 'white',
                                                                color: medioPagoAdelanto === m.val ? '#dc2626' : '#64748b' }}>
                                                            {m.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Fecha vencimiento */}
                                        <div style={{ marginBottom: 12 }}>
                                            <label className="form-label" style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'block' }}>
                                                Fecha límite de pago <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span>
                                            </label>
                                            <input className="form-input" type="date" value={fechaVencimiento}
                                                min={new Date().toISOString().split('T')[0]}
                                                onChange={e => setFechaVencimiento(e.target.value)} />
                                            {fechaVencimiento && (
                                                <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                                                    El crédito vencerá el {new Date(fechaVencimiento + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}
                                                </p>
                                            )}
                                        </div>

                                        {/* Notas */}
                                        <div style={{ marginBottom: 4 }}>
                                            <label className="form-label" style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'block' }}>
                                                Notas del acuerdo <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span>
                                            </label>
                                            <input className="form-input" value={notasCredito}
                                                onChange={e => setNotasCredito(e.target.value)}
                                                placeholder="Ej: Paga a fin de mes, cuotas de S/ 50..." style={{ fontSize: 13 }} />
                                        </div>

                                        {!clienteId && (
                                            <div style={{ marginTop: 10, background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <AlertTriangle size={14} color="#dc2626" />
                                                <p style={{ fontSize: 12, color: '#dc2626', fontWeight: 700, margin: 0 }}>
                                                    Debes seleccionar un cliente para registrar el fiado
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Efectivo puro */}
                                {formaPago === 'EFECTIVO' && !esCredito && (
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14 }}>
                                        <label className="form-label" style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8, display: 'block' }}>
                                            Monto Recibido (S/)
                                        </label>
                                        <input className="form-input" type="number" step="0.10" value={montoRecibido}
                                            onChange={e => setMontoRecibido(e.target.value)}
                                            placeholder={totalConDescuento.toFixed(2)}
                                            style={{ fontSize: 18, fontWeight: 700, textAlign: 'right' }} />
                                        {Number(montoRecibido) >= totalConDescuento && Number(montoRecibido) > 0 && (
                                            <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>Vuelto</span>
                                                <span style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{formatCurrency(vuelto)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                            {/* Yape / Plin — el QR se muestra en un modal aparte; aquí solo hay un acceso para reabrirlo */}
                                {formaPago === 'YAPE_PLIN' && !esCredito && configApp.qr_pago_activo === '1' &&
                                 (configApp.qr_yape_imagen || configApp.qr_plin_imagen) &&
                                 !showQrModal && !showQrElegirModal && (
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={activarFlujoQr}
                                            style={{ fontSize: 13 }}
                                        >
                                            <ScanBarcode size={14} />
                                            Mostrar QR de pago
                                        </button>
                                    </div>
                                )}

                                {/* Mixto */}
                                {formaPago === 'MIXTO' && !esCredito && (
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14 }}>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', margin: '0 0 10px' }}>
                                            Desglose del pago mixto
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>
                                                    Efectivo (S/)
                                                </label>
                                                <input className="form-input" type="number" step="0.10" value={montoEfectivo}
                                                    onChange={e => { setMontoEfectivo(e.target.value); const diff = totalConDescuento - Number(e.target.value); setMontoYape(diff >= 0 ? diff.toFixed(2) : ''); }}
                                                    style={{ textAlign: 'right', fontWeight: 700 }} placeholder="0.00" />
                                            </div>
                                            <div>
                                                <label className="form-label" style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>
                                                    Yape / Plin (S/)
                                                </label>
                                                <input className="form-input" type="number" step="0.10" value={montoYape}
                                                    onChange={e => { setMontoYape(e.target.value); const diff = totalConDescuento - Number(e.target.value); setMontoEfectivo(diff >= 0 ? diff.toFixed(2) : ''); }}
                                                    style={{ textAlign: 'right', fontWeight: 700 }} placeholder="0.00" />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: mixtoOk ? '#f0fdf4' : '#fef2f2', border: `1px solid ${mixtoOk ? '#86efac' : '#fca5a5'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: mixtoOk ? '#15803d' : '#dc2626' }}>
                                                {mixtoOk ? 'Montos correctos ✓' : `Faltan: S/ ${(totalConDescuento - sumaMixto).toFixed(2)}`}
                                            </span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: mixtoOk ? '#15803d' : '#dc2626' }}>
                                                {formatCurrency(sumaMixto)} / {formatCurrency(totalConDescuento)}
                                            </span>
                                        </div>
                                        {configApp.qr_pago_activo === '1' && (configApp.qr_yape_imagen || configApp.qr_plin_imagen) && (
                                            <button
                                                className="btn btn-secondary"
                                                onClick={activarFlujoQr}
                                                style={{ fontSize: 12, marginTop: 10, width: '100%' }}
                                            >
                                                <ScanBarcode size={13} />
                                                Mostrar QR (para la parte de Yape/Plin)
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Transferencia */}
                                {formaPago === 'TRANSFERENCIA' && !esCredito && configApp.transferencia_activo === '1' && cuentasTransferencia.length > 0 && (
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => setShowTransferenciaModal(true)}
                                            style={{ fontSize: 13 }}
                                        >
                                            <Landmark size={14} />
                                            Mostrar cuentas
                                        </button>
                                    </div>
                                )}

                            </div>

                            {/* ── Columna derecha: resumen + total + CTA ─── */}
                            <div style={{ display: 'flex', flexDirection: 'column', background: '#fafafa', borderLeft: '1px solid #f1f5f9', minHeight: 0, overflow: 'hidden' }}>

                                {/* Resumen items — scrollable */}
                                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px 16px 12px' }}>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 12px' }}>
                                        Resumen · {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {cart.map(item => (
                                            <div key={item.id_producto} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', margin: 0, lineHeight: 1.3 }}>{item.nombre}</p>
                                                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{item.cantidad} × {formatCurrency(item.precio_venta)}</p>
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 800, color: '#735DFF', flexShrink: 0 }}>{formatCurrency(item.precio_venta * item.cantidad)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Totales + botón confirmar — siempre visible al fondo */}
                                <div style={{ padding: '14px 16px', borderTop: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
                                    {/* Desglose */}
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                                            <span>Subtotal (sin IGV)</span><span>{formatCurrency(subtotal)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                                            <span>IGV ({tasaIGV}%)</span><span>{formatCurrency(igv)}</span>
                                        </div>
                                        {descuento > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#dc2626', marginBottom: 4 }}>
                                                <span>Descuento</span><span>-{formatCurrency(descuento)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Total destacado */}
                                    <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div>
                                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: 0 }}>Total a Cobrar</p>
                                            <p style={{ fontSize: 24, fontWeight: 800, color: 'white', margin: '1px 0 0', lineHeight: 1 }}>{formatCurrency(totalConDescuento)}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: 0 }}>IGV ({tasaIGV}%) inc.</p>
                                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: '2px 0 0' }}>{formatCurrency(igv)}</p>
                                        </div>
                                    </div>

                                    {/* Botón confirmar — siempre visible */}
                                    <button
                                        className="btn btn-success btn-lg w-full justify-center"
                                        onClick={handleCheckout}
                                        disabled={
                                            processing ||
                                            (formaPago === 'MIXTO' && !esCredito && !mixtoOk) ||
                                            (esCredito && !clienteId) ||
                                            facturaRequiereRuc ||
                                            facturaClienteSinRuc
                                        }
                                        style={{ fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 10, width: '100%' }}
                                    >
                                        {processing ? 'Procesando...' : esCredito ? '📋 Registrar Fiado' : 'Confirmar Venta'}
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* ── Mini-modal Nuevo Cliente (stacked sobre checkout) ── */}
            {showNuevoCliente && (
                <div className="modal-overlay" style={{ zIndex: 60 }} onClick={() => setShowNuevoCliente(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="modal-header" style={{ marginBottom: 16 }}>
                            <div>
                                <h2 style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed', margin: 0 }}>Registro Rápido de Cliente</h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Quedará seleccionado automáticamente</p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowNuevoCliente(false)}><X size={16} /></button>
                        </div>
                        <form onSubmit={handleCrearClienteRapido}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label" style={{ fontSize: 12 }}>Nombre completo o Razón Social *</label>
                                    <input className="form-input" required value={nuevoClienteForm.nombre_razon_social}
                                        onChange={e => setNuevoClienteForm({ ...nuevoClienteForm, nombre_razon_social: e.target.value })}
                                        placeholder="Juan Perez Lopez" style={{ fontSize: 13 }} autoFocus />
                                </div>
                                <div>
                                    <label className="form-label" style={{ fontSize: 12 }}>Tipo Doc.</label>
                                    <select className="form-select" style={{ fontSize: 13 }} value={nuevoClienteForm.tipo_documento}
                                        onChange={e => setNuevoClienteForm({ ...nuevoClienteForm, tipo_documento: e.target.value, tipo_cliente: e.target.value === 'RUC' ? 'EMPRESA' : 'PERSONA_NATURAL' })}>
                                        <option>DNI</option><option>RUC</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label" style={{ fontSize: 12 }}>N° Documento *</label>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input className="form-input" required style={{ fontSize: 13 }} value={nuevoClienteForm.numero_documento}
                                            maxLength={nuevoClienteForm.tipo_documento === 'DNI' ? 8 : 11}
                                            onChange={e => {
                                                const numero = e.target.value.replace(/\D/g, '');
                                                setNuevoClienteForm({ ...nuevoClienteForm, numero_documento: numero });
                                                const longitudEsperada = nuevoClienteForm.tipo_documento === 'DNI' ? 8 : 11;
                                                if (numero.length === longitudEsperada) buscarDocumentoVenta(nuevoClienteForm.tipo_documento, numero);
                                            }}
                                            placeholder={nuevoClienteForm.tipo_documento === 'DNI' ? '12345678' : '20123456789'} />
                                        <button type="button" className="btn btn-secondary" style={{ flexShrink: 0, padding: '0 10px', fontSize: 13 }}
                                            disabled={buscandoDocVenta || !nuevoClienteForm.numero_documento}
                                            onClick={() => buscarDocumentoVenta(nuevoClienteForm.tipo_documento, nuevoClienteForm.numero_documento)}
                                            title="Buscar datos por documento">
                                            {buscandoDocVenta ? '...' : <Search size={14} />}
                                        </button>
                                    </div>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label" style={{ fontSize: 12 }}>Teléfono</label>
                                    <input className="form-input" style={{ fontSize: 13 }} value={nuevoClienteForm.telefono}
                                        onChange={e => setNuevoClienteForm({ ...nuevoClienteForm, telefono: e.target.value })}
                                        placeholder="943123456" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" onClick={() => setShowNuevoCliente(false)}
                                    style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={guardandoCliente}
                                    style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 8, background: '#7c3aed', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                                    {guardandoCliente ? 'Guardando...' : 'Registrar y Seleccionar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal elección de impresión ── */}
            {showPrintModal && ventaParaImprimir && (
                <div className="modal-overlay" onClick={() => setShowPrintModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
                        <div className="modal-header" style={{ marginBottom: 4 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: 0 }}>¿Cómo deseas imprimir?</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowPrintModal(false)}><X size={18} /></button>
                        </div>
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                            Venta <strong>{ventaParaImprimir.numero_comprobante || ventaParaImprimir.numero_venta}</strong> registrada correctamente.
                        </p>
                        <div className="flex flex-col gap-3">
                            <button className="btn btn-primary" onClick={async () => {
                                setShowPrintModal(false);
                                try { await generateComprobantePDF(ventaParaImprimir); } catch (_e) { toast('Error al generar PDF A4', 'error'); }
                            }}>
                                <FileText size={15} /> Imprimir A4 (hoja completa)
                            </button>
                            <button className="btn btn-primary" onClick={async () => {
                                setShowPrintModal(false);
                                try { await generateTicketPDF(ventaParaImprimir, configApp); } catch (e) { 
                                        logger.error('VENTAS', 'Error ticket:', e?.message, e?.stack);
                                    }
                            }}>
                                <FileText size={15} /> Imprimir Ticket térmico
                            </button>
                            {sunatActivo && ventaParaImprimir.tipo_comprobante !== 'TICKET' && ventaParaImprimir.cpe_estado !== 'ACEPTADO' && (
                                <button className="btn btn-secondary" style={{ borderColor: '#10B981', color: '#065f46' }}
                                    disabled={emitiendoCPE}
                                    onClick={async () => {
                                        if (emitiendoCPE) return;
                                        setEmitiendoCPE(true);
                                        try {
                                            await emitirCPE(ventaParaImprimir.id_venta);
                                            toast('Comprobante electrónico emitido correctamente', 'success');
                                            const ventaActualizada = await getVenta(ventaParaImprimir.id_venta);
                                            setVentaParaImprimir(ventaActualizada);
                                            // Abrir PDF oficial de NubeFact si está disponible
                                            if (ventaActualizada.cpe_enlace_pdf) {
                                                if (window.electronAPI?.openExternal) window.electronAPI.openExternal(ventaActualizada.cpe_enlace_pdf);
                                                else window.open(ventaActualizada.cpe_enlace_pdf, '_blank');
                                            } else {
                                                try { await generateComprobantePDF(ventaActualizada); } catch (_e) { toast('Error al generar PDF', 'error'); }
                                            }
                                            setShowPrintModal(false);
                                        } catch (err) {
                                            const data          = err.response?.data;
                                            const nubefactError = data?.nubefact?.errors;
                                            const mensajeError  = typeof nubefactError === 'string'
                                                ? `Error SUNAT: ${nubefactError}`
                                                : data?.error || 'Error al emitir CPE';
                                            toast(mensajeError, 'error');
                                        } finally {
                                            setEmitiendoCPE(false);
                                        }
                                    }}
                                >
                                    <CheckCircle2 size={15} /> {emitiendoCPE ? 'Emitiendo...' : 'Emitir CPE a SUNAT'}
                                </button>
                            )}
                            <button className="btn btn-secondary" onClick={() => setShowPrintModal(false)}>
                                No imprimir ahora
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal elegir QR (cuando hay Yape y Plin configurados) ── */}
            {showQrElegirModal && (
                <div className="modal-overlay" onClick={() => setShowQrElegirModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
                        <div className="modal-header" style={{ marginBottom: 4 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: 0 }}>¿Con qué QR paga el cliente?</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowQrElegirModal(false)}><X size={18} /></button>
                        </div>
                        <div className="flex flex-col gap-3" style={{ marginTop: 12 }}>
                            <button
                                onClick={() => { setQrSeleccionado('YAPE'); setShowQrElegirModal(false); setShowQrModal(true); }}
                                style={{ padding: '16px', borderRadius: 12, border: '2px solid #742284', background: '#faf5ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                            >
                                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#742284', display: 'inline-block' }} />
                                <span style={{ fontSize: 15, fontWeight: 700, color: '#742284' }}>Yape</span>
                            </button>
                            <button
                                onClick={() => { setQrSeleccionado('PLIN'); setShowQrElegirModal(false); setShowQrModal(true); }}
                                style={{ padding: '16px', borderRadius: 12, border: '2px solid #00958A', background: '#effcfb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                            >
                                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#00B8AA', display: 'inline-block' }} />
                                <span style={{ fontSize: 15, fontWeight: 700, color: '#00958A' }}>Plin</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal grande: QR + monto + confirmar venta ── */}
            {showQrModal && qrSeleccionado && (
                <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
                        <div className="modal-header" style={{ marginBottom: 4 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: 0 }}>
                                Cobro con {qrSeleccionado === 'YAPE' ? 'Yape' : 'Plin'}
                            </h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowQrModal(false)}><X size={18} /></button>
                        </div>

                        <div style={{ textAlign: 'center', marginTop: 8 }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: qrSeleccionado === 'YAPE' ? '#742284' : '#00B8AA', display: 'inline-block' }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: qrSeleccionado === 'YAPE' ? '#742284' : '#00958A' }}>
                                    {qrSeleccionado === 'YAPE' ? 'Yape' : 'Plin'}
                                </span>
                            </div>

                            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', padding: 16, display: 'inline-block' }}>
                                <img
                                    src={qrSeleccionado === 'YAPE' ? configApp.qr_yape_imagen : configApp.qr_plin_imagen}
                                    alt={`QR ${qrSeleccionado === 'YAPE' ? 'Yape' : 'Plin'}`}
                                    style={{ width: 240, height: 240, objectFit: 'contain', borderRadius: 8 }}
                                />
                            </div>

                            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Monto a cobrar</span>
                                <span style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{formatCurrency(totalConDescuento)}</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2" style={{ marginTop: 16 }}>
                            <button
                                className="btn btn-success btn-lg w-full justify-center"
                                onClick={() => { setShowQrModal(false); handleCheckout(); }}
                                disabled={processing || facturaRequiereRuc || facturaClienteSinRuc}
                                style={{ fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 10, width: '100%' }}
                            >
                                {processing ? 'Procesando...' : 'Confirmar Venta'}
                            </button>
                                                        <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setShowQrModal(false);
                                    if (configApp.qr_yape_imagen && configApp.qr_plin_imagen) setShowQrElegirModal(true);
                                }}
                                style={{ fontSize: 13 }}
                            >
                                {configApp.qr_yape_imagen && configApp.qr_plin_imagen ? 'Elegir otro QR' : 'Cambiar método de pago'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: cuentas de transferencia ── */}
            {showTransferenciaModal && (
                <div className="modal-overlay" onClick={() => setShowTransferenciaModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="modal-header" style={{ marginBottom: 4 }}>
                            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: 0 }}>Datos para transferencia</h2>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowTransferenciaModal(false)}><X size={18} /></button>
                        </div>

                        <div className="flex flex-col gap-3" style={{ marginTop: 10 }}>
                            {cuentasTransferencia.map((cuenta, i) => (
                                <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                                    <p style={{ fontSize: 13, fontWeight: 800, color: '#735DFF', margin: '0 0 10px' }}>{cuenta.banco || 'Cuenta ' + (i + 1)}</p>
                                    {cuenta.numero && (
                                        <div style={{ marginBottom: cuenta.cci ? 10 : 0 }}>
                                            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, margin: '0 0 2px' }}>N° de cuenta</p>
                                            <p style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: 0, letterSpacing: 1, fontFamily: 'monospace' }}>{cuenta.numero}</p>
                                        </div>
                                    )}
                                    {cuenta.cci && (
                                        <div>
                                            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, margin: '0 0 2px' }}>CCI</p>
                                            <p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0, letterSpacing: 1, fontFamily: 'monospace' }}>{cuenta.cci}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'linear-gradient(135deg, #735DFF 0%, #C516E1 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Monto a transferir</span>
                            <span style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{formatCurrency(totalConDescuento)}</span>
                        </div>

                        <button
                            className="btn btn-success btn-lg w-full justify-center"
                            onClick={() => { setShowTransferenciaModal(false); handleCheckout(); }}
                            disabled={processing || facturaRequiereRuc || facturaClienteSinRuc}
                            style={{ fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 10, width: '100%', marginTop: 12 }}
                        >
                            {processing ? 'Procesando...' : 'Finalizar Venta'}
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}