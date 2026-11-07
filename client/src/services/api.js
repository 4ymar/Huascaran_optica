import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// ─── INTERCEPTORES (Auth) ────────────────────────────────────
// ⚠️  DEBEN ir ANTES de cualquier llamada exportada
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('usuario');
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('usuario');
            window.location.hash = '#/login';
        }
        return Promise.reject(error);
    }
);

// ─── AUTH ────────────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data).then(r => r.data);
export const getMe = () => api.get('/auth/me').then(r => r.data);
export const getSetupEstado = () => api.get('/setup/estado').then(r => r.data);
export const crearAdminInicial = (data) => api.post('/setup/admin-inicial', data).then(r => r.data);
export const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.hash = '#/login';
};

// ─── RECUPERACIÓN DE ACCESO ──────────────────────────────────
export const getMachineIdRecuperacion = () => api.get('/recuperacion/machineid').then(r => r.data);
export const verificarCodigoRecuperacion = (codigo) => api.post('/recuperacion/verificar', { codigo }).then(r => r.data);
export const resetearPasswordRecuperacion = (codigo, id_usuario) => api.post('/recuperacion/reset', { codigo, id_usuario }).then(r => r.data);

// ─── PRODUCTOS ──────────────────────────────────────────────
export const getProductos = (params) => api.get('/productos', { params }).then(r => r.data);
export const getProducto = (id) => api.get(`/productos/${id}`).then(r => r.data);
export const createProducto = (data) => api.post('/productos', data).then(r => r.data);
export const updateProducto = (id, data) => api.put(`/productos/${id}`, data).then(r => r.data);
export const getProductoPorBarcode = (codigo) => api.get(`/productos/barcode/${encodeURIComponent(codigo)}`).then(r => r.data);
export const deleteProducto = (id) => api.delete(`/productos/${id}`).then(r => r.data);

// ─── CRÉDITOS / FIADO ────────────────────────────────────────
export const getCreditos = (params) => api.get('/creditos', { params }).then(r => r.data);
export const getCredito = (id) => api.get(`/creditos/${id}`).then(r => r.data);
export const getResumenCreditos = () => api.get('/creditos/resumen').then(r => r.data);
export const createAbono = (id_credito, data) => api.post(`/creditos/${id_credito}/abonos`, data).then(r => r.data);
export const updateCredito = (id, data) => api.put(`/creditos/${id}`, data).then(r => r.data);
export const deleteAbono = (id_credito, id_abono) => api.delete(`/creditos/${id_credito}/abonos/${id_abono}`).then(r => r.data);

// ─── VENTAS ─────────────────────────────────────────────────
export const getVentas = (params) => api.get('/ventas', { params }).then(r => r.data);
export const getVenta = (id) => api.get(`/ventas/${id}`).then(r => r.data);
export const createVenta = (data) => api.post('/ventas', data).then(r => r.data);
export const anularVenta = (id, motivo) => api.put(`/ventas/${id}/anular`, { motivo }).then(r => r.data);
export const editarVenta = (id, data) => api.put(`/ventas/${id}/editar`, data).then(r => r.data);

// ─── COMPRAS ────────────────────────────────────────────────
export const getCompras = (params) => api.get('/compras', { params }).then(r => r.data);
export const getCompra = (id) => api.get(`/compras/${id}`).then(r => r.data);
export const createCompra = (data) => api.post('/compras', data).then(r => r.data);
export const editarCompra = (id, data) => api.put(`/compras/${id}`, data).then(r => r.data);
export const anularCompra = (id, motivo) => api.put(`/compras/${id}/anular`, { motivo }).then(r => r.data);

// ─── CLIENTES ───────────────────────────────────────────────
export const getClientes = (params) => api.get('/clientes', { params }).then(r => r.data);
export const getCliente = (id, params = {}) => api.get(`/clientes/${id}`, { params }).then(r => r.data);
export const createCliente = (data) => api.post('/clientes', data).then(r => r.data);
export const updateCliente = (id, data) => api.put(`/clientes/${id}`, data).then(r => r.data);
export const deleteCliente = (id) => api.delete(`/clientes/${id}`).then(r => r.data);

// ─── CATEGORÍAS ────────────────────────────────────────────
export const getCategoriasCRUD = () => api.get('/categorias').then(r => r.data);
export const createCategoria = (data) => api.post('/categorias', data).then(r => r.data);
export const updateCategoria = (id, data) => api.put(`/categorias/${id}`, data).then(r => r.data);
export const deleteCategoria = (id) => api.delete(`/categorias/${id}`).then(r => r.data);

// ─── UNIDADES ────────────────────────────────────────────────
export const getUnidadesCRUD = () => api.get('/unidades').then(r => r.data);
export const createUnidad = (data) => api.post('/unidades', data).then(r => r.data);
export const updateUnidad = (id, data) => api.put(`/unidades/${id}`, data).then(r => r.data);
export const deleteUnidad = (id) => api.delete(`/unidades/${id}`).then(r => r.data);

// ─── MOVIMIENTOS ────────────────────────────────────────────
export const getMovimientos = (params) => api.get('/movimientos', { params }).then(r => r.data);
export const createAjuste = (data) => api.post('/movimientos/ajuste', data).then(r => r.data);

// ─── REPORTES ───────────────────────────────────────────────
export const getDashboard = () => api.get('/reportes/dashboard').then(r => r.data);
export const getReporteVentas = (params) => api.get('/reportes/ventas', { params }).then(r => r.data);
export const getReporteInventario = (params) => api.get('/reportes/inventario', { params }).then(r => r.data);
export const getProductosSinMovimiento = (params) => api.get('/reportes/productos-sin-movimiento', { params }).then(r => r.data);

// ─── CONFIG & ARCHIVOS ──────────────────────────────────────
export const resetDB = () => api.post('/config/reset').then(r => r.data);
export const guardarArchivoLocal = (data) => api.post('/archivos/guardar', data).then(r => r.data);
export const getConfig = () => api.get('/config').then(r => r.data);
export const getPublicConfig = () => api.get('/config/public').then(r => r.data);
export const updateConfig = (data) => api.put('/config', data).then(r => r.data);
export const updateSunatToken = (token) => api.put('/config/sunat-token', { token }).then(r => r.data);
export const updateDocumentosToken = (token) => api.put('/config/documentos-token', { token }).then(r => r.data);   // ← nueva línea
export const cargarDemo = () => api.post('/config/cargar-demo').then(r => r.data);
export const getDiagnostico = () => api.get('/sistema/diagnostico').then(r => r.data);
export const getEstadoActualizacion = () => api.get('/sistema/estado-actualizacion').then(r => r.data);
export const exportarSoporte = () => api.get('/sistema/diagnostico/exportar').then(r => r.data);

// ─── USUARIOS ────────────────────────────────────────────────
export const getUsuarios = () => api.get('/usuarios').then(r => r.data);
export const createUsuario = (data) => api.post('/usuarios', data).then(r => r.data);
export const updateUsuario = (id, data) => api.put(`/usuarios/${id}`, data).then(r => r.data);
export const updatePassword = (id, data) => api.put(`/usuarios/${id}/password`, data).then(r => r.data);
export const deleteUsuario = (id, adminPassword) =>
    api.delete(`/usuarios/${id}`, { data: { admin_password: adminPassword } }).then(r => r.data);

// ─── LOGS / AUDITORÍA ───────────────────────────────────────
export const getLogs = (params) => api.get('/logs', { params }).then(r => r.data);

// ─── CAJA ───────────────────────────────────────────────────
export const getCajaEstado = () => api.get('/caja/estado').then(r => r.data);
export const abrirCaja = (data) => api.post('/caja/abrir', data).then(r => r.data);
export const cerrarCaja = (data) => api.post('/caja/cerrar', data).then(r => r.data);
export const getCajaResumen = () => api.get('/caja/resumen').then(r => r.data);
export const registrarMovimientoCaja = (data) => api.post('/caja/movimiento', data).then(r => r.data);
export const getCajaHistorial = (params) => api.get('/caja/historial', { params }).then(r => r.data);
export const getCajaSesion = (id) => api.get(`/caja/sesion/${id}`).then(r => r.data);

// ─── BACKUPS ─────────────────────────────────────────────────
export const getBackups          = ()     => api.get('/backups').then(r => r.data);
export const getBackupStatus     = ()     => api.get('/backups/status').then(r => r.data);
export const crearBackup         = ()     => api.post('/backups/manual').then(r => r.data);
export const verificarPasswordBackup = (password) =>
    api.post('/backups/verificar-password', { password }).then(r => r.data);
export const restaurarBackup     = (data) => api.post('/backups/restaurar', data).then(r => r.data);
export const probarRestauracionBackup = (data) => api.post('/backups/probar-restauracion', data).then(r => r.data);
export const descargarBackupUrl  = (archivo, tipo) =>
    `/api/backups/descargar?archivo=${encodeURIComponent(archivo)}&tipo=${tipo}`;

// ─── ESTADÍSTICAS ────────────────────────────────────────────
export const getEstadisticas = () => api.get('/config/estadisticas').then(r => r.data);
// ─── FACTURACIÓN ELECTRÓNICA (SUNAT / NubeFact) ──────────────
export const emitirCPE = (id_venta) =>
    api.post(`/facturacion/emitir/${id_venta}`).then(r => r.data);
export const probarConfiguracionCPE = () =>
    api.post('/facturacion/probar-configuracion').then(r => r.data);
export const corregirClienteCPE = (id_venta, datos) =>
    api.put(`/facturacion/corregir-cliente/${id_venta}`, datos).then(r => r.data);
export const getResumenComprobantesMes = () =>
    api.get('/facturacion/resumen-mes').then(r => r.data);
export const getHistorialComprobantes = () =>
    api.get('/facturacion/historial-meses').then(r => r.data);
export const registrarDevolucion = (id_venta, data) =>
    api.post(`/ventas/${id_venta}/devoluciones`, data).then(r => r.data);
export const registrarNotaCreditoManual = (id_venta, data) =>
    api.post(`/ventas/${id_venta}/nota-credito-manual`, data).then(r => r.data);
export const consultarCpeSunat = (id_venta) =>
    api.post(`/facturacion/consultar-sunat/${id_venta}`).then(r => r.data);
export const consultarAnulacionCpe = (id_venta) =>
    api.post(`/facturacion/consultar-anulacion/${id_venta}`).then(r => r.data);
export const emitirNotaCpe = (id_venta, datosNota) =>
    api.post(`/facturacion/emitir-nota/${id_venta}`, datosNota).then(r => r.data);
export const getAlmacenes = () => api.get('/almacenes').then(r => r.data);
export const createAlmacen = (data) => api.post('/almacenes', data).then(r => r.data);
export const updateAlmacen = (id, data) => api.put(`/almacenes/${id}`, data).then(r => r.data);
export const transferirStock = (data) => api.post('/almacenes/transferir', data).then(r => r.data);
export const getProveedores = (params) => api.get('/proveedores', { params }).then(r => r.data);
export const createProveedor = (data) => api.post('/proveedores', data).then(r => r.data);
export const updateProveedor = (id, data) => api.put(`/proveedores/${id}`, data).then(r => r.data);

// ─── DOCUMENTOS (DNI / RUC) ───────────────────────────────────
export const consultarDocumento = (tipo, numero) =>
    api.get('/documentos/consultar', { params: { tipo, numero } }).then(r => r.data);

// --- OPTICA: RECETAS / ORDENES / TALLERES -----------------------------------
// Recetas (por defecto solo activas; para inactivas: { activa: false })
export const getRecetas = (params) => api.get('/recetas', { params }).then(r => r.data);
export const getReceta = (id) => api.get(`/recetas/${id}`).then(r => r.data);
export const createReceta = (data) => api.post('/recetas', data).then(r => r.data);
export const updateReceta = (id, data) => api.put(`/recetas/${id}`, data).then(r => r.data);
export const deleteReceta = (id) => api.delete(`/recetas/${id}`).then(r => r.data);

// Ordenes de trabajo
export const getOrdenes = (params) => api.get('/ordenes', { params }).then(r => r.data);
export const getOrden = (id) => api.get(`/ordenes/${id}`).then(r => r.data);
export const createOrden = (data) => api.post('/ordenes', data).then(r => r.data);
export const updateOrden = (id, data) => api.put(`/ordenes/${id}`, data).then(r => r.data);
// extra: { nota?, id_taller? }  (EN_TALLER exige taller)
export const updateOrdenEstado = (id, estado, extra = {}) => api.put(`/ordenes/${id}/estado`, { estado, ...extra }).then(r => r.data);

// Talleres
export const getTalleres = (params) => api.get('/talleres', { params }).then(r => r.data);
export const getTaller = (id) => api.get(`/talleres/${id}`).then(r => r.data);
export const createTaller = (data) => api.post('/talleres', data).then(r => r.data);
export const updateTaller = (id, data) => api.put(`/talleres/${id}`, data).then(r => r.data);
export const toggleTallerActivo = (id, activo) => api.patch(`/talleres/${id}/activo`, { activo }).then(r => r.data);
export const deleteTaller = (id) => api.delete(`/talleres/${id}`).then(r => r.data);

export default api;

