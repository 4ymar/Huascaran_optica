import { createContext, useContext, useState, useEffect } from 'react';
import { getClientes, getPublicConfig, getCategoriasCRUD } from '../services/api';

const VentasContext = createContext();

export function VentasProvider({ children }) {
    const [cart, setCart] = useState([]);
    const [tipoComprobante, setTipoComprobante] = useState('BOLETA');
    const [formaPago, setFormaPago] = useState('EFECTIVO');
    const [clienteId, setClienteId] = useState('');
    const [montoRecibido, setMontoRecibido] = useState('');
    const [montoEfectivo, setMontoEfectivo] = useState('');
    const [montoYape, setMontoYape] = useState('');
    const [descuento, setDescuento] = useState(0);
    const [esCredito, setEsCredito] = useState(false);
    const [montoAdelanto, setMontoAdelanto] = useState('');
    const [medioPagoAdelanto, setMedioPagoAdelanto] = useState('EFECTIVO');
    const [fechaVencimiento, setFechaVencimiento] = useState('');
    const [notasCredito, setNotasCredito] = useState('');
    const [barcode, setBarcode] = useState('');
    const [search, setSearch] = useState('');

    const [clientes, setClientes] = useState([]);
    const [configApp, setConfigApp] = useState({});
    const [sunatActivo, setSunatActivo] = useState(false);
    const [categoriasDB, setCategoriasDB] = useState([]);

    const refreshConfig = () => {
        return getPublicConfig().then(cfg => {
            setConfigApp(cfg);
            setSunatActivo(cfg?.sunat_activo === '1');
            return cfg;
        }).catch(() => {});
    };

    // Carga clientes/config/categorías. Se llama al montar la app y de nuevo
    // tras cada login exitoso (App.jsx), porque el montaje inicial puede
    // ocurrir sin un token válido todavía.
    const cargarDatosVentas = () => {
        getClientes({ estado: 'true' }).then(setClientes).catch(() => {});
        refreshConfig();
        getCategoriasCRUD()
            .then(data => setCategoriasDB(Array.isArray(data) ? data : []))
            .catch(() => {});
    };

    useEffect(() => {
        cargarDatosVentas();
    }, []);

    const vaciarVenta = () => {
        setCart([]);
        setDescuento(0);
        setMontoRecibido('');
        setMontoEfectivo('');
        setMontoYape('');
        setClienteId('');
        setEsCredito(false);
        setMontoAdelanto('');
        setFechaVencimiento('');
        setNotasCredito('');
        setBarcode('');
        setSearch('');
    };

    return (
        <VentasContext.Provider value={{
            cart, setCart,
            tipoComprobante, setTipoComprobante,
            formaPago, setFormaPago,
            clienteId, setClienteId,
            montoRecibido, setMontoRecibido,
            montoEfectivo, setMontoEfectivo,
            montoYape, setMontoYape,
            descuento, setDescuento,
            esCredito, setEsCredito,
            montoAdelanto, setMontoAdelanto,
            medioPagoAdelanto, setMedioPagoAdelanto,
            fechaVencimiento, setFechaVencimiento,
            notasCredito, setNotasCredito,
            barcode, setBarcode,
            search, setSearch,
            clientes, setClientes,
            configApp, setConfigApp, refreshConfig,
            sunatActivo, setSunatActivo,
            categoriasDB, setCategoriasDB,
            vaciarVenta, cargarDatosVentas
        }}>
            {children}
        </VentasContext.Provider>
    );
}

export function useVentas() {
    const context = useContext(VentasContext);
    if (!context) {
        throw new Error('useVentas debe ser utilizado dentro de un VentasProvider');
    }
    return context;
}
