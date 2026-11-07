import { useState, useEffect, useRef } from 'react';
import { getProductos, createProducto, updateProducto, deleteProducto, createAjuste, getCategoriasCRUD, getUnidadesCRUD, getAlmacenes } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import { formatCurrency, downloadExcel } from '../utils/helpers';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { Plus, Search, Download, Edit2, X, Filter, ChevronLeft, ChevronRight, Package, TrendingUp, Upload, FileSpreadsheet, AlertTriangle, CheckCircle, PackagePlus, Trash2  } from 'lucide-react';
import logger from '../utils/logger';

const ITEMS_PER_PAGE = 25;

const CODIGOS_SUNAT = [
    { grupo: 'Bebidas', opciones: [
        { nombre: 'Cerveza', codigo: '50202201' },
        { nombre: 'Agua', codigo: '50202301' },
        { nombre: 'Gaseosas', codigo: '50202300' },
    ]},
    { grupo: 'Construcción', opciones: [
        { nombre: 'Madera', codigo: '11121600' },
        { nombre: 'Arena', codigo: '11111700' },
        { nombre: 'Piedra', codigo: '11111600' },
    ]},
    { grupo: 'Abarrotes', opciones: [
        { nombre: 'Harina de trigo', codigo: '50221002' },
        { nombre: 'Trigo (grano)', codigo: '50221110' },
        { nombre: 'Maíz amarillo', codigo: '50403200' },
        { nombre: 'Azúcar a granel', codigo: '50161509' },
        { nombre: 'Grano de cereal', codigo: '50221101' },
    ]},
    { grupo: 'Otros', opciones: [
        { nombre: 'Gas licuado (balón)', codigo: '15111510' },
        { nombre: 'Kerosene', codigo: '15101502' },
        { nombre: 'Carnes y despojos', codigo: '50111500' },
    ]},
];
const SUNAT_CODIGOS_FLAT = CODIGOS_SUNAT.flatMap(g => g.opciones);
const PALABRAS_CLAVE_SUNAT = ['cerveza', 'agua', 'gaseosa', 'refresco', 'gas', 'balon', 'balón', 'kerosene', 'madera', 'arena', 'piedra', 'harina', 'trigo', 'maiz', 'maíz', 'azucar', 'azúcar', 'carne'];

const emptyProduct = {
    sku: '', codigo_barras: '', nombre: '', descripcion: '', categoria: '', unidad_medida: 'unidad',
    precio_compra: '', precio_venta: '', stock_actual: '', stock_minimo: '', imagen_url: '',
    codigo_producto_sunat: '', tipo_igv: 1
};


export default function Productos() {
    const toast = useToast();
    const fileInputRef = useRef(null);
    const [productos, setProductos] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [filterStock, setFilterStock] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [form, setForm] = useState(emptyProduct);
    const [page, setPage] = useState(1);
    const [showFilters, setShowFilters] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [importData, setImportData] = useState([]);
    const [importProcessing, setImportProcessing] = useState(false);
    const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
    const [importAlmacenId, setImportAlmacenId] = useState('');
    const [showDataMenu, setShowDataMenu] = useState(false);
    const [categoriasDB, setCategoriasDB] = useState([]);
    const [unidadesDB, setUnidadesDB] = useState([]);
    const [showAjusteStock, setShowAjusteStock] = useState(false);
    const [productoAjuste, setProductoAjuste] = useState(null);
    const [ajusteForm, setAjusteForm] = useState({ tipo: 'ENTRADA', cantidad: '', motivo: '', id_almacen: '' });
    const [ajusteProcessing, setAjusteProcessing] = useState(false);
    const [sunatModoOtro, setSunatModoOtro] = useState(false);
    const dataMenuRef = useRef(null);
    const confirmar = useConfirm();

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dataMenuRef.current && !dataMenuRef.current.contains(e.target)) {
                setShowDataMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const loadData = () => {
        setLoading(true);
        const params = {};
        if (search) params.search = search;
        if (filterCat) params.categoria = filterCat;
        if (filterStock) params.stock_level = filterStock;
        Promise.all([getProductos(params), getAlmacenes()])
            .then(([prods, alms]) => {
                setProductos(prods);
                setAlmacenes(alms);
            })
            .finally(() => setLoading(false));
    };
    const loadCategorias = () => {
        getCategoriasCRUD()
            .then(data => setCategoriasDB(Array.isArray(data) ? data.filter(c => c.activo) : []))
            .catch(() => {});
    };
    const loadUnidades = () => {
        getUnidadesCRUD()
            .then(data => setUnidadesDB(Array.isArray(data) ? data.filter(u => u.activo) : []))
            .catch(() => {});
    };

    useEffect(() => { loadData(); }, [search, filterCat, filterStock]);
    useEffect(() => { loadData(); loadCategorias(); loadUnidades(); }, []);

    const totalPages = Math.ceil(productos.length / ITEMS_PER_PAGE);

    const sunatSelectValue = sunatModoOtro ? 'OTRO' : form.codigo_producto_sunat;

    const paginatedProducts = productos.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    const openCreate = () => {
        const tiendaDef = almacenes.find(a => a.es_principal) || almacenes[0];
        setForm({ ...emptyProduct, id_almacen: tiendaDef ? tiendaDef.id_almacen : '' });
        setEditingProduct(null);
        setSunatModoOtro(false);
        setShowForm(true);
    };
    const openEdit = (p) => {
        setForm({ ...p });
        setEditingProduct(p);
        setSunatModoOtro(!!p.codigo_producto_sunat && !SUNAT_CODIGOS_FLAT.some(o => o.codigo === p.codigo_producto_sunat));
        setShowForm(true);
    };
    const openAjusteStock = (p) => {
        setProductoAjuste(p);
        const tiendaDef = almacenes.find(a => a.es_principal) || almacenes[0];
        setAjusteForm({ tipo: 'ENTRADA', cantidad: '', motivo: '', id_almacen: tiendaDef ? tiendaDef.id_almacen : '' });
        setShowAjusteStock(true);
    };

    const handleAjusteSubmit = async (e) => {
        e.preventDefault();
        if (!ajusteForm.id_almacen) {
            toast('Seleccione un almacén para el ajuste', 'warning');
            return;
        }

        const LIMITE_MAXIMO_AJUSTE = 100000;
        const cantidadNum = Number(ajusteForm.cantidad);

        if (cantidadNum > LIMITE_MAXIMO_AJUSTE) {
            toast(`La cantidad no puede superar ${LIMITE_MAXIMO_AJUSTE.toLocaleString('es-PE')} unidades`, 'error');
            return;
        }

        const umbralAviso = (productoAjuste.stock_actual > 0 ? productoAjuste.stock_actual : productoAjuste.stock_minimo) * 3;
        if (cantidadNum > umbralAviso) {
            const confirmado = await confirmar(
                `Vas a ingresar ${cantidadNum} unidades, pero el stock actual es ${productoAjuste.stock_actual}.`,
                { titulo: 'Confirmar ajuste de stock', textoConfirmar: 'Sí, ajustar', peligro: false }
            );
            if (!confirmado) return;
        }

        setAjusteProcessing(true);
        try {
            await createAjuste({
                id_producto: productoAjuste.id_producto,
                cantidad: cantidadNum,
                id_almacen: ajusteForm.id_almacen,
                tipo: ajusteForm.tipo,
                motivo: ajusteForm.motivo,
            });
            toast('Stock ajustado correctamente');
            setShowAjusteStock(false);
            loadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al ajustar el stock', 'error');
        } finally {
            setAjusteProcessing(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.codigo_producto_sunat && !/^\d{8}$/.test(form.codigo_producto_sunat.trim())) {
            toast('El código de producto SUNAT debe tener 8 dígitos numéricos', 'error');
            return;
        }
        try {
            const categoriaSeleccionada = categoriasDB.find(c => c.nombre === form.categoria);
            const data = {
                ...form,
                id_categoria: categoriaSeleccionada?.id_categoria ?? null,
                precio_compra: Number(form.precio_compra),
                precio_venta: Number(form.precio_venta),
                stock_actual: Number(form.stock_actual),
                stock_minimo: Number(form.stock_minimo),
                codigo_barras: form.codigo_barras || ''
            };
            if (editingProduct) {
                await updateProducto(editingProduct.id_producto, data);
                toast('Producto actualizado correctamente');
            } else {
                await createProducto(data);
                toast('Producto creado correctamente');
            }
            setShowForm(false);
            loadData();
        } catch (err) {
            toast(err.response?.data?.error || 'Error al guardar', 'error');
        }
    };

    const toggleEstado = async (p) => {
        try {
            await updateProducto(p.id_producto, { estado: !p.estado });
            toast(p.estado ? 'Producto desactivado' : 'Producto activado');
            loadData();
        } catch (err) {
            logger.error('PRODUCTOS', 'Error al cambiar estado de producto:', err);
            toast('Error al cambiar estado', 'error');
        }
    };

    const [confirmarEliminar, setConfirmarEliminar] = useState(null);

    const handleEliminar = async () => {
        const p = confirmarEliminar;
        setConfirmarEliminar(null);
        try {
            const resultado = await deleteProducto(p.id_producto);
            toast(resultado.fisico ? 'Producto eliminado' : 'Producto eliminado (se conservó su historial de ventas/compras)');
            loadData();
        } catch (err) {
            logger.error('PRODUCTOS', 'Error al eliminar producto:', err);
            toast(err.response?.data?.error || 'Error al eliminar', 'error');
        }
    };

    const margen = (pc, pv) => {
        if (!pc || !pv) return null;
        return ((pv - pc) / pc * 100).toFixed(1);
    };

    // ── IMPORTAR CSV / EXCEL ──────────────────────────────────
    const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.read(evt.target.result, { type: 'binary' });
                const sheetName = wb.SheetNames.includes('Productos') ? 'Productos' : wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

                // Catálogo completo y sin filtros para comparar duplicados — NO usar el
                // estado 'productos' de la pantalla, que puede estar filtrado/paginado
                // por la búsqueda o el filtro de categoría activos en ese momento.
                const todosLosProductos = await getProductos({});

                // Normalizar columnas (case insensitive, sin tildes, sin paréntesis/símbolos)
                const normalize = (obj) => {
                    const n = {};
                    Object.keys(obj).forEach(k => {
                        const key = k
                            .replace(/\(.*?\)/g, '') // quita paréntesis y su contenido, ej: "(S/)"
                            .toLowerCase().trim()
                            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
                            .replace(/[^a-z0-9]+/g, '_') // cualquier símbolo o espacio restante -> _
                            .replace(/^_+|_+$/g, ''); // recorta _ sobrantes al inicio/fin
                        n[key] = obj[k];
                    });
                    return n;
                };


                const parsed = raw.map((row, idx) => {
                    const r = normalize(row);
                    const sku = String(r.sku || r.codigo || '').toUpperCase().trim();
                    const nombre = String(r.nombre || r.producto || r.descripcion || '').trim();
                    const existente = todosLosProductos.find(p => p.sku.toUpperCase() === sku);
                    const categoriaNombre = String(r.categoria || 'General').trim();
                    const categoriaExiste = categoriasDB.some(
                        c => c.nombre.trim().toLowerCase() === categoriaNombre.toLowerCase()
                    );
                    const unidadVal = String(r.unidad_medida || r.unidad || 'unidad').trim();
                    const precioVenta = Number(r.precio_venta || r.p_venta || r.precio || 0);

                    const errores = [];
                    if (!sku) errores.push('Falta SKU');
                    if (!nombre) errores.push('Falta nombre');
                    if (precioVenta <= 0) errores.push('Precio de venta debe ser mayor a 0');
                    if (!unidadesDB.some(u => u.nombre.toLowerCase() === unidadVal.toLowerCase())) errores.push(`Unidad "${unidadVal}" no reconocida`);

                    // Advertencia (no bloquea, pero cambia la acción por defecto a "omitir"
                    // para que el usuario decida conscientemente en vez de sumar stock
                    // sin querer al producto equivocado)
                    const nombreConflicto = !!(existente && nombre && existente.nombre.trim().toLowerCase() !== nombre.toLowerCase());

                    return {
                        _idx: idx,
                        sku,
                        nombre,
                        categoria: categoriaNombre,
                        _categoriaNueva: !categoriaExiste,
                        unidad_medida: unidadVal,
                        precio_compra: Number(r.precio_compra || r.p_compra || r.costo || 0),
                        precio_venta: precioVenta,
                        stock_actual: Number(r.stock_actual || r.stock || r.cantidad || 0),
                        stock_minimo: Number(r.stock_minimo || r.stock_min || 5),
                        descripcion: String(r.descripcion_larga || r.detalle || '').trim(),
                        _estado: existente ? 'duplicado' : 'nuevo',
                        _existente: existente || null,
                        _errores: errores,
                        _nombreConflicto: nombreConflicto,
                        _accion: errores.length > 0 ? 'omitir' : (nombreConflicto ? 'omitir' : (existente ? 'aumentar_stock' : 'crear')),
                        _stock_agregar: existente ? Number(r.stock_actual || r.stock || r.cantidad || 0) : 0,
                    };
                }).filter(r => r.sku || r.nombre || r.precio_venta > 0 || r.stock_actual > 0);

                // Detectar SKU repetido dentro del propio archivo (dos filas con el mismo
                // SKU pueden apuntar sin querer al mismo producto existente y duplicar el stock)
                const conteoSku = {};
                parsed.forEach(r => { if (r.sku) conteoSku[r.sku] = (conteoSku[r.sku] || 0) + 1; });
                parsed.forEach(r => {
                    if (r.sku && conteoSku[r.sku] > 1) {
                        r._errores.push('SKU repetido en el archivo');
                        r._accion = 'omitir';
                    }
                });

                if (parsed.length === 0) {
                    toast('El archivo está vacío o no tiene filas de datos', 'error');
                    return;
                }

                const tiendaDef = almacenes.find(a => a.es_principal) || almacenes[0];
                setImportAlmacenId(tiendaDef ? tiendaDef.id_almacen : '');
                setImportData(parsed);
                setShowImport(true);

            } catch (err) {
                logger.error('PRODUCTOS', 'Error al procesar archivo de importación:', err);
                if (err.message?.toLowerCase().includes('zip') || err.message?.toLowerCase().includes('unsupported')) {
                    toast('El archivo no es un Excel/CSV válido. Verifica la extensión (.xlsx, .xls, .csv).', 'error');
                } else {
                    toast('No se pudo leer el archivo. Verifica que no esté dañado ni protegido con contraseña.', 'error');
                }
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const handleImportConfirm = async () => {
        if (!importAlmacenId) {
            toast('Seleccione un almacén de destino para la importación', 'warning');
            return;
        }
        setImportProcessing(true);
        let creados = 0, actualizados = 0, errores = 0;

        const categoriasACrear = [...new Set(
            importData.filter(i => i._categoriaNueva && i._accion !== 'omitir').map(i => i.categoria)
        )];
        for (const nombreCat of categoriasACrear) {
            try {
                await fetch('/api/categorias', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({ nombre: nombreCat, icono: '📦' }),
                });
            } catch { /* si falla la creación, el producto igual se guarda con el texto de categoría */ }
        }

        const categoriasActualizadas = categoriasACrear.length > 0
            ? await getCategoriasCRUD().catch(() => categoriasDB)
            : categoriasDB;
        const resolverIdCategoria = (nombre) =>
            categoriasActualizadas.find(c => c.nombre === nombre)?.id_categoria ?? null;

        setImportProgress({ done: 0, total: importData.filter(i => i._accion !== 'omitir').length });

        for (const item of importData) {
            try {
                if (item._accion === 'omitir') continue;
                // Respaldo: "aumentar stock" nunca debe ejecutarse si el nombre no coincide
                // con el del producto existente, sin importar cómo haya quedado _accion.
                if (item._nombreConflicto && item._accion === 'aumentar_stock') continue;

                if (item._estado === 'duplicado' && item._accion === 'aumentar_stock') {
                    if (item._stock_agregar > 0) {
                        await createAjuste({
                            id_producto: item._existente.id_producto,
                            cantidad: item._stock_agregar,
                            id_almacen: importAlmacenId,
                            tipo: 'ENTRADA',
                            motivo: 'Importación masiva de productos',
                        });
                    }
                    actualizados++;
                } else if (item._estado === 'duplicado' && item._accion === 'reemplazar') {
                    await updateProducto(item._existente.id_producto, {
                        nombre: item.nombre,
                        precio_compra: item.precio_compra,
                        precio_venta: item.precio_venta,
                        stock_minimo: item.stock_minimo,
                        categoria: item.categoria,
                        id_categoria: resolverIdCategoria(item.categoria),
                        unidad_medida: item.unidad_medida,
                    });
                    const deltaStock = item.stock_actual - item._existente.stock_actual;
                    if (deltaStock !== 0) {
                        await createAjuste({
                            id_producto: item._existente.id_producto,
                            cantidad: Math.abs(deltaStock),
                            id_almacen: importAlmacenId,
                            tipo: deltaStock > 0 ? 'ENTRADA' : 'SALIDA',
                            motivo: 'Reemplazo por importación masiva',
                        });
                    }
                    actualizados++;
                }
                else if (item._estado === 'nuevo') {
                    await createProducto({
                        sku: item.sku,
                        nombre: item.nombre,
                        descripcion: item.descripcion,
                        categoria: item.categoria,
                        id_categoria: resolverIdCategoria(item.categoria),
                        unidad_medida: item.unidad_medida,
                        precio_compra: item.precio_compra,
                        precio_venta: item.precio_venta,
                        stock_actual: item.stock_actual,
                        stock_minimo: item.stock_minimo,
                        id_almacen: importAlmacenId,
                    });
                    creados++;
                }
            } catch { errores++; } finally {
                if (item._accion !== 'omitir') setImportProgress(p => ({ ...p, done: p.done + 1 }));
            }
        }

        setImportProcessing(false);
        setShowImport(false);
        setImportData([]);
        setImportProgress({ done: 0, total: 0 });
        loadData();
        loadCategorias();
        const almNombre = almacenes.find(a => a.id_almacen === importAlmacenId)?.nombre || '';
        toast(`Importación completa en ${almNombre}: ${creados} creados, ${actualizados} actualizados${errores > 0 ? `, ${errores} errores` : ''}`, 'success');
    };

    // función descargarPlantilla 
    const descargarPlantilla = async () => {
        const ExcelJS = (await import('exceljs')).default;
        const fecha = new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
        const wb = new ExcelJS.Workbook();

        const wsInfo = wb.addWorksheet('Instrucciones');
        wsInfo.columns = [{ width: 95 }];
        [
            'CÓMO LLENAR ESTA PLANTILLA',
            '',
            'CAMPOS OBLIGATORIOS (si falta alguno, el producto NO se importará):',
            '• SKU: código único del producto. No lo repitas.',
            '• Nombre: nombre del producto.',
            '• P. Venta (S/): debe ser un número mayor a 0.',
            '• Unidad: debe ser exactamente una de las opciones de la lista desplegable (columna D). Si escribes otra palabra, el producto no se importará.',
            '',
            'CAMPOS OPCIONALES (si los dejas vacíos, el sistema usa un valor por defecto):',
            '• Categoría: si la dejas vacía, se asigna "General". Elige una de la lista desplegable (columna C) o escribe una nueva y el sistema la creará.',
            '• P. Compra (S/): si la dejas vacía, queda en 0.',
            '• Stock Actual: si la dejas vacía, queda en 0.',
            '• Stock Mínimo: si la dejas vacía, queda en 5.',
            '• Descripción: totalmente opcional.',
            '',
            'No cambies los nombres de las columnas en la hoja "Productos".',
        ].forEach(linea => wsInfo.addRow([linea]));
        wsInfo.getRow(1).font = { bold: true, size: 13 };

        const wsListas = wb.addWorksheet('ListasValidas');
        wsListas.state = 'hidden';
        const nombresUnidades = unidadesDB.length > 0 ? unidadesDB.map(u => u.nombre) : ['unidad'];
        nombresUnidades.forEach((u, i) => { wsListas.getCell(`A${i + 1}`).value = u; });
        const nombresCategorias = categoriasDB.length > 0 ? categoriasDB.map(c => c.nombre) : ['General'];
        nombresCategorias.forEach((c, i) => { wsListas.getCell(`B${i + 1}`).value = c; });

        const ws = wb.addWorksheet('Productos');
        ws.columns = [
            { header: 'SKU', key: 'sku', width: 14 },
            { header: 'Nombre', key: 'nombre', width: 32 },
            { header: 'Categoría', key: 'categoria', width: 24 },
            { header: 'Unidad', key: 'unidad', width: 12 },
            { header: 'P. Compra (S/)', key: 'p_compra', width: 16 },
            { header: 'P. Venta (S/)', key: 'p_venta', width: 16 },
            { header: 'Stock Actual', key: 'stock', width: 13 },
            { header: 'Stock Mínimo', key: 'stock_min', width: 13 },
            { header: 'Descripción', key: 'descripcion', width: 36 },
        ];
        ws.getRow(1).font = { bold: true };
        ws.addRow({ sku: 'FERR-001', nombre: 'Martillo Stanley 16oz', categoria: nombresCategorias[0], unidad: 'unidad', p_compra: 25.00, p_venta: 42.00, stock: 10, stock_min: 3, descripcion: '' });
        ws.addRow({ sku: 'FERR-002', nombre: 'Destornillador Phillips #2', categoria: nombresCategorias[0], unidad: 'unidad', p_compra: 8.00, p_venta: 15.00, stock: 20, stock_min: 5, descripcion: '' });

        for (let row = 2; row <= 500; row++) {
            ws.getCell(`C${row}`).dataValidation = {
                type: 'list', allowBlank: false,
                formulae: [`ListasValidas!$B$1:$B$${nombresCategorias.length}`],
                showErrorMessage: true, error: 'Elige una categoría de la lista.',
            };
            ws.getCell(`D${row}`).dataValidation = {
                type: 'list', allowBlank: false,
                formulae: [`ListasValidas!$A$1:$A$${nombresUnidades.length}`],
                showErrorMessage: true, error: 'Elige una unidad de la lista.',
            };
        }

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plantilla_productos_${fecha}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const nuevos = importData.filter(i => i._estado === 'nuevo').length;
    const duplicados = importData.filter(i => i._estado === 'duplicado').length;
    const _categoriasNuevas = [...new Set(importData.filter(i => i._categoriaNueva).map(i => i.categoria))].length;
    const stockActivos = productos.filter(p => p.estado).length;
    const stockBajos = productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_actual > 0).length;
    const sinStock = productos.filter(p => p.stock_actual === 0).length;
    const valorTotal = productos.reduce((s, p) => s + (p.precio_venta * p.stock_actual), 0);

    return (
        <div className="page-enter">

            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>Productos</h1>
                    <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
                        Gestion del catalogo — {productos.length} productos registrados
                    </p>
                </div>
                <div className="flex gap-3">
                    <div style={{ position: 'relative' }} ref={dataMenuRef}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowDataMenu(v => !v)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <FileSpreadsheet size={16} />
                            Datos
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: 'transform 0.2s', transform: showDataMenu ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>

                        {showDataMenu && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                                background: 'white', border: '1px solid #e2e8f0',
                                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                                minWidth: 200, zIndex: 50, overflow: 'hidden'
                            }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, padding: '10px 14px 6px' }}>
                                    Gestión de datos
                                </p>
                                <button
                                    onClick={() => { descargarPlantilla(); setShowDataMenu(false); }}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#334155', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f7ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <FileSpreadsheet size={15} style={{ color: '#735DFF' }} /> Descargar Plantilla
                                </button>
                                <button
                                    onClick={() => { fileInputRef.current?.click(); setShowDataMenu(false); }}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#334155', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f7ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <Upload size={15} style={{ color: '#735DFF' }} /> Importar CSV / Excel
                                </button>
                                <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                                <button
                                    onClick={() => {
                                        setShowDataMenu(false);
                                        downloadExcel(productos, 'productos', 'productos', toast, [
                                            { header: 'SKU',            value: p => p.sku },
                                            { header: 'Nombre',         value: p => p.nombre },
                                            { header: 'Categoría',      value: p => p.categoria },
                                            { header: 'Unidad',         value: p => p.unidad_medida },
                                            { header: 'P. Compra (S/)', value: p => Number(p.precio_compra) },
                                            { header: 'P. Venta (S/)',  value: p => Number(p.precio_venta) },
                                            { header: 'Margen %',       value: p => p.precio_compra > 0 ? Number(((p.precio_venta - p.precio_compra) / p.precio_compra * 100).toFixed(1)) : 0 },
                                            { header: 'Stock Actual',   value: p => Number(p.stock_actual) },
                                            { header: 'Stock Mínimo',   value: p => Number(p.stock_minimo) },
                                            { header: 'Estado',         value: p => p.estado ? 'Activo' : 'Inactivo' },
                                            { header: 'Descripción',    value: p => p.descripcion || '' },
                                        ]);
                                    }}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#334155', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f7ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    <Download size={15} style={{ color: '#735DFF' }} /> Exportar Excel
                                </button>
                            </div>
                        )}
                    </div>
                    <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
                    <button className="btn btn-primary" onClick={openCreate}>
                        <Plus size={18} /> Nuevo Producto
                    </button>
                </div>
            </div>

            {/* Mini KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Productos Activos', valor: stockActivos, icon: '📦', color: '#7c3aed', bg: '#f5f3ff', border: '#e9d5ff' },
                    { label: 'Stock Bajo', valor: stockBajos, icon: '⚠️', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                    { label: 'Sin Stock', valor: sinStock, icon: '🚫', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                    { label: 'Valor en Inventario', valor: formatCurrency(valorTotal), icon: '💰', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                ].map((k, i) => (
                    <div key={i} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 28 }}>{k.icon}</span>
                        <div>
                            <p style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>{k.label}</p>
                            <p style={{ fontSize: 20, fontWeight: 800, color: k.color, margin: '2px 0 0' }}>{k.valor}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Busqueda y filtros */}
            <div className="card mb-5">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="search-bar flex-1" style={{ minWidth: 220 }}>
                        <Search size={16} className="search-icon" />
                        <input className="form-input" placeholder="Buscar por nombre o SKU..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                    </div>
                    <button className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowFilters(!showFilters)}>
                        <Filter size={15} /> Filtros {(filterCat || filterStock) && '•'}
                    </button>
                    {(filterCat || filterStock) && (
                        <button className="btn btn-secondary btn-sm" onClick={() => { setFilterCat(''); setFilterStock(''); }}>
                            <X size={14} /> Limpiar
                        </button>
                    )}
                </div>
                {showFilters && (
                    <div className="flex flex-wrap gap-4 mt-4 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
                        <div>
                            <label className="form-label">Categoria</label>
                            <select className="form-select" value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}>
                                <option value="">Todas las categorias</option>
                                {categoriasDB.map(c => (
                                    <option key={c.id_categoria} value={c.nombre}>
                                        {c.icono} {c.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="form-label">Nivel de Stock</label>
                            <select className="form-select" value={filterStock} onChange={e => { setFilterStock(e.target.value); setPage(1); }}>
                                <option value="">Todos</option>
                                <option value="normal">Normal</option>
                                <option value="bajo">Stock Bajo</option>
                                <option value="critico">Sin Stock</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabla */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div className="loader"><div className="spinner"></div></div>
                ) : paginatedProducts.length === 0 ? (
                    <div className="empty-state" style={{ padding: 48 }}>
                        <Package size={48} style={{ color: '#cbd5e1' }} />
                        <p style={{ color: '#94a3b8', marginTop: 12 }}>No se encontraron productos</p>
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ margin: 0 }}>
                                <thead>
                                    <tr>
                                        <th>SKU</th><th>Producto</th><th>Categoria</th>
                                        <th style={{ textAlign: 'right' }}>P. Compra</th>
                                        <th style={{ textAlign: 'right' }}>P. Venta</th>
                                        <th style={{ textAlign: 'right' }}>Margen</th>
                                        <th style={{ textAlign: 'center' }}>Stock</th>
                                        <th style={{ textAlign: 'center' }}>Estado</th>
                                        <th style={{ textAlign: 'center' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedProducts.map(p => {
                                        const mg = margen(p.precio_compra, p.precio_venta);
                                        const mgNum = parseFloat(mg);
                                        const mgColor = mgNum >= 50 ? '#15803d' : mgNum >= 25 ? '#d97706' : '#dc2626';
                                        const stockStatus = p.stock_actual === 0 ? 'critico' : p.stock_actual <= p.stock_minimo ? 'bajo' : 'normal';
                                        const sc = { critico: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }, bajo: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' }, normal: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' } }[stockStatus];
                                        return (
                                            <tr key={p.id_producto} style={{ opacity: p.estado ? 1 : 0.45 }}>
                                                <td><span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '2px 6px', borderRadius: 4 }}>{p.sku}</span></td>
                                                <td>
                                                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>{p.nombre}</p>
                                                    {p.descripcion && <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{p.descripcion.substring(0, 40)}{p.descripcion.length > 40 ? '...' : ''}</p>}
                                                </td>
                                                <td><span style={{ fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 8px', color: '#475569', fontWeight: 500 }}>{(categoriasDB.find(c => c.nombre === p.categoria)?.icono) || '📦'} {p.categoria}</span></td>
                                                <td style={{ textAlign: 'right', fontSize: 13, color: '#64748b' }}>{formatCurrency(p.precio_compra)}</td>
                                                <td style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{formatCurrency(p.precio_venta)}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {mg && <span style={{ fontSize: 13, fontWeight: 700, color: mgColor, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}><TrendingUp size={13} />{mg}%</span>}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                        <span style={{ fontSize: 15, fontWeight: 800, color: sc.color }}>{p.stock_actual}</span>
                                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>min: {p.stock_minimo}</span>
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                                                        {stockStatus === 'critico' ? 'Sin Stock' : stockStatus === 'bajo' ? 'Stock Bajo' : 'Normal'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                        <button onClick={() => openEdit(p)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center' }} title="Editar"><Edit2 size={14} /></button>
                                                        <button onClick={() => openAjusteStock(p)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#2563eb', display: 'flex', alignItems: 'center' }} title="Ajustar stock"><PackagePlus size={14} /></button>
                                                        <button onClick={() => toggleEstado(p)} style={{ background: p.estado ? '#fef2f2' : '#f0fdf4', border: `1px solid ${p.estado ? '#fecaca' : '#bbf7d0'}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: p.estado ? '#dc2626' : '#15803d', display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, gap: 3 }}>
                                                            {p.estado ? <><X size={13} /> Baja</> : <>✓ Activar</>}
                                                        </button>
                                                        <button onClick={() => setConfirmarEliminar(p)} title="Eliminar"
                                                            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>Mostrando {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, productos.length)} de {productos.length}</span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}><ChevronLeft size={16} /></button>
                                    {[...Array(totalPages)].map((_, i) => (
                                        <button key={i} onClick={() => setPage(i + 1)} style={{ padding: '4px 10px', border: '1px solid', borderColor: page === i + 1 ? '#7c3aed' : '#e2e8f0', borderRadius: 6, background: page === i + 1 ? '#7c3aed' : 'white', color: page === i + 1 ? 'white' : '#475569', cursor: 'pointer', fontSize: 13, fontWeight: page === i + 1 ? 700 : 400 }}>{i + 1}</button>
                                    ))}
                                    <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}><ChevronRight size={16} /></button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── MODAL IMPORTACION ────────────────────────────────── */}
            {showImport && (
                <div className="modal-overlay" onClick={() => !importProcessing && setShowImport(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 820, maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>Confirmar Importacion</h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>
                                    {importData.length} productos encontrados — revise y confirme las acciones
                                </p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(false)} disabled={importProcessing}><X size={18} /></button>
                        </div>

                        {/* Selector de almacén destino para la importación */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                            <label className="form-label" style={{ fontWeight: 700, color: '#1e293b' }}>Almacén de Destino del Stock *</label>
                            <select
                                className="form-select"
                                value={importAlmacenId}
                                onChange={e => setImportAlmacenId(e.target.value)}
                                disabled={importProcessing}
                                style={{ fontWeight: 600, background: 'white' }}
                            >
                                {almacenes.map(a => (
                                    <option key={a.id_almacen} value={a.id_almacen}>
                                        {a.nombre} {a.es_principal ? '(Principal / Tienda)' : ''}
                                    </option>
                                ))}
                            </select>
                            <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>
                                El stock de productos nuevos y los incrementos de duplicados se cargarán en este almacén.
                            </p>
                        </div>

                        {/* Resumen */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <CheckCircle size={20} style={{ color: '#15803d' }} />
                                <div>
                                    <p style={{ fontSize: 11, color: '#15803d', fontWeight: 600, margin: 0, textTransform: 'uppercase' }}>Productos Nuevos</p>
                                    <p style={{ fontSize: 22, fontWeight: 800, color: '#15803d', margin: 0 }}>{nuevos}</p>
                                </div>
                            </div>
                            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <AlertTriangle size={20} style={{ color: '#d97706' }} />
                                <div>
                                    <p style={{ fontSize: 11, color: '#d97706', fontWeight: 600, margin: 0, textTransform: 'uppercase' }}>Productos Duplicados</p>
                                    <p style={{ fontSize: 22, fontWeight: 800, color: '#d97706', margin: 0 }}>{duplicados}</p>
                                </div>
                            </div>
                        </div>

                        {/* Tabla de productos */}
                        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>SKU</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Nombre</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Estado</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>P. Venta</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Stock</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Accion</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Eliminar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importData.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: item._estado === 'duplicado' ? '#fffdf0' : 'white' }}>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '2px 5px', borderRadius: 4 }}>{item.sku}</span>
                                            </td>
                                            <td style={{ padding: '8px 10px', maxWidth: 200 }}>
                                                <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>{item.nombre}</p>
                                                {item._estado === 'duplicado' && (
                                                    <p style={{ margin: '2px 0 0', fontSize: 10, color: '#d97706' }}>
                                                        Ya existe — Stock actual: {item._existente?.stock_actual}
                                                    </p>
                                                )}
                                                {item._categoriaNueva && (
                                                    <p style={{ margin: '2px 0 0', fontSize: 10, color: '#735DFF' }}>
                                                        Categoría "{item.categoria}" no existe — se creará
                                                    </p>
                                                )}
                                                {item._nombreConflicto && (
                                                    <p style={{ margin: '2px 0 0', fontSize: 10, color: '#d97706', fontWeight: 600 }}>
                                                        ⚠ Este SKU pertenece a "{item._existente?.nombre}" en el sistema — revisa la acción
                                                    </p>
                                                )}
                                                {item._errores.length > 0 && (
                                                    <p style={{ margin: '2px 0 0', fontSize: 10, color: '#dc2626', fontWeight: 600 }}>
                                                        ⚠ {item._errores.join(' · ')}
                                                    </p>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: item._estado === 'nuevo' ? '#f0fdf4' : '#fffbeb', color: item._estado === 'nuevo' ? '#15803d' : '#d97706', border: `1px solid ${item._estado === 'nuevo' ? '#bbf7d0' : '#fde68a'}` }}>
                                                    {item._estado === 'nuevo' ? 'Nuevo' : 'Duplicado'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                                                S/ {item.precio_venta.toFixed(2)}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                                                {item.stock_actual}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                {item._errores.length > 0 ? (
                                                    <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>No se importará</span>
                                                ) : item._estado === 'duplicado' ? (
                                                    <select
                                                        value={item._accion}
                                                        onChange={e => {
                                                            const updated = [...importData];
                                                            updated[idx]._accion = e.target.value;
                                                            setImportData(updated);
                                                        }}
                                                        style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 6, background: 'white' }}
                                                    >
                                                        {!item._nombreConflicto && (
                                                            <option value="aumentar_stock">Aumentar stock (+{item.stock_actual})</option>
                                                        )}
                                                        <option value="reemplazar">{item._nombreConflicto ? 'Reemplazar (renombrar a este)' : 'Reemplazar datos'}</option>
                                                        <option value="omitir">Omitir</option>
                                                    </select>
                                                ) : (
                                                    <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>Crear nuevo</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => setImportData(importData.filter((_, i) => i !== idx))}
                                                    style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', color: '#dc2626', fontSize: 11 }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {importProcessing && (
                            <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${(importProgress.done / (importProgress.total || 1)) * 100}%`, background: '#7c3aed', transition: 'width 0.2s' }} />
                            </div>
                        )}
                        <div className="flex justify-end gap-3">
                            <button className="btn btn-secondary" onClick={() => setShowImport(false)} disabled={importProcessing}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleImportConfirm} disabled={importProcessing || importData.length === 0} style={{ minWidth: 200 }}>
                                {importProcessing ? `Importando ${importProgress.done}/${importProgress.total}...` : `Confirmar Importacion (${importData.filter(i => i._accion !== 'omitir').length} productos)`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL AJUSTAR STOCK ──────────────────────────────── */}
            {showAjusteStock && productoAjuste && (
                <div className="modal-overlay" onClick={() => !ajusteProcessing && setShowAjusteStock(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>Ajustar Stock</h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{productoAjuste.nombre} — Stock actual: {productoAjuste.stock_actual}</p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowAjusteStock(false)} disabled={ajusteProcessing}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleAjusteSubmit}>
                            <div className="mb-4">
                                <label className="form-label">Tipo de Ajuste *</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" onClick={() => setAjusteForm({ ...ajusteForm, tipo: 'ENTRADA' })} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${ajusteForm.tipo === 'ENTRADA' ? '#15803d' : '#e2e8f0'}`, background: ajusteForm.tipo === 'ENTRADA' ? '#f0fdf4' : 'white', color: ajusteForm.tipo === 'ENTRADA' ? '#15803d' : '#64748b', fontWeight: 600, cursor: 'pointer' }}>+ Entrada</button>
                                    <button type="button" onClick={() => setAjusteForm({ ...ajusteForm, tipo: 'SALIDA' })} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${ajusteForm.tipo === 'SALIDA' ? '#dc2626' : '#e2e8f0'}`, background: ajusteForm.tipo === 'SALIDA' ? '#fef2f2' : 'white', color: ajusteForm.tipo === 'SALIDA' ? '#dc2626' : '#64748b', fontWeight: 600, cursor: 'pointer' }}>− Salida</button>
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="form-label">Cantidad *</label>
                                <input className="form-input" type="number" min="1" required value={ajusteForm.cantidad} onChange={e => setAjusteForm({ ...ajusteForm, cantidad: e.target.value })} placeholder="0" />
                            </div>
                            <div className="mb-6">
                                <label className="form-label">Motivo *</label>
                                <input className="form-input" required value={ajusteForm.motivo} onChange={e => setAjusteForm({ ...ajusteForm, motivo: e.target.value })} placeholder="Ej: Conteo físico, merma, corrección..." />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAjusteStock(false)} disabled={ajusteProcessing}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={ajusteProcessing} style={{ minWidth: 140 }}>{ajusteProcessing ? 'Guardando...' : 'Confirmar Ajuste'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Nuevo/Editar Producto */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</h2>
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{editingProduct ? `Modificando: ${editingProduct.nombre}` : 'Complete los campos para agregar al catalogo'}</p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Identificacion</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">SKU *</label>
                                    <input className="form-input" required value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value.toUpperCase() })} placeholder="FERR-001" style={{ fontFamily: 'monospace', fontWeight: 700 }} />
                                </div>
                                <div>
                                    <label className="form-label">Código de Barras</label>
                                    <div style={{ position: 'relative' }}>
                                        <input className="form-input" value={form.codigo_barras || ''} onChange={e => setForm({ ...form, codigo_barras: e.target.value })} placeholder="Escanear o digitar..." style={{ fontFamily: 'monospace' }} />
                                    </div>
                                </div>
                                <div>
                                    <label className="form-label">Nombre del Producto *</label>
                                    <input className="form-input" required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Martillo Stanley 16oz" />
                                </div>
                                <div>
                                    <label className="form-label">Categoria *</label>
                                    <select className="form-select" required value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                                        <option value="">Seleccionar categoria...</option>
                                        {categoriasDB.map(c => (
                                            <option key={c.id_categoria} value={c.nombre}>
                                                {c.icono} {c.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Unidad de Medida *</label>
                                    <select className="form-select" required value={form.unidad_medida} onChange={e => setForm({ ...form, unidad_medida: e.target.value })}>
                                        {unidadesDB.map(u => <option key={u.id_unidad} value={u.nombre}>{u.nombre}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="form-label">Descripcion</label>
                                    <input className="form-input" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripcion opcional del producto" />
                                </div>
                            </div>
                            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Código Producto SUNAT (Catálogo 25)</p>
                                <select
                                    className="form-select"
                                    value={sunatSelectValue}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val === 'OTRO') {
                                            setSunatModoOtro(true);
                                            setForm({ ...form, codigo_producto_sunat: '' });
                                        } else {
                                            setSunatModoOtro(false);
                                            setForm({ ...form, codigo_producto_sunat: val });
                                        }
                                    }}
                                >
                                    <option value="">Sin código / no aplica</option>
                                    {CODIGOS_SUNAT.map(g => (
                                        <optgroup key={g.grupo} label={g.grupo}>
                                            {g.opciones.map(o => <option key={o.codigo} value={o.codigo}>{o.nombre} ({o.codigo})</option>)}
                                        </optgroup>
                                    ))}
                                    <option value="OTRO">⚠️ Otro código (buscar en catálogo SUNAT)</option>
                                </select>
                                {sunatModoOtro && (
                                    <input
                                        className="form-input"
                                        style={{ marginTop: 8, fontFamily: 'monospace' }}
                                        maxLength={8}
                                        value={form.codigo_producto_sunat}
                                        onChange={e => setForm({ ...form, codigo_producto_sunat: e.target.value })}
                                        placeholder="Digitar código de 8 caracteres (Excel SUNAT)"
                                    />
                                )}
                                {!form.codigo_producto_sunat && PALABRAS_CLAVE_SUNAT.some(p => form.nombre.toLowerCase().includes(p)) && (
                                    <p style={{ fontSize: 12, color: '#b45309', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <AlertTriangle size={13} /> Este producto podría requerir código SUNAT desde agosto 2026 — revisa el selector.
                                    </p>
                                )}
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 }}>Precios</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Precio de Compra (S/) *</label>
                                    <input className="form-input" type="number" step="0.01" min="0" required value={form.precio_compra} onChange={e => setForm({ ...form, precio_compra: e.target.value })} placeholder="0.00" />
                                </div>
                                <div>
                                    <label className="form-label">Precio de Venta (S/) *</label>
                                    <input className="form-input" type="number" step="0.01" min="0" required value={form.precio_venta} onChange={e => setForm({ ...form, precio_venta: e.target.value })} placeholder="0.00" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="form-label">Tipo de Afección al IGV (SUNAT) *</label>
                                    <select
                                        className="form-input"
                                        value={form.tipo_igv || 1}
                                        onChange={e => setForm({ ...form, tipo_igv: Number(e.target.value) })}
                                    >
                                        <option value={1}>Gravado (18% IGV)</option>
                                        <option value={8}>Exonerado (0% IGV — Frutas, verduras, carnes no procesadas, libros, Selva)</option>
                                        <option value={9}>Inafecto (0% IGV — Operaciones inafectas)</option>
                                    </select>
                                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                        Determina la tributación del producto al emitir comprobantes electrónicos ante SUNAT.
                                    </p>
                                </div>
                                {form.precio_compra && form.precio_venta && Number(form.precio_compra) > 0 && (
                                    <div className="md:col-span-2">
                                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <TrendingUp size={16} style={{ color: '#15803d' }} />
                                            <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>Margen: {margen(Number(form.precio_compra), Number(form.precio_venta))}%</span>
                                            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>Ganancia: {formatCurrency(Number(form.precio_venta) - Number(form.precio_compra))}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 }}>Stock</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                {!editingProduct && (
                                    <div className="md:col-span-2">
                                        <label className="form-label">Almacén de Destino para Stock Inicial *</label>
                                        <select
                                            className="form-select"
                                            value={form.id_almacen || ''}
                                            onChange={e => setForm({ ...form, id_almacen: e.target.value })}
                                            required
                                        >
                                            {almacenes.map(a => (
                                                <option key={a.id_almacen} value={a.id_almacen}>
                                                    {a.nombre} {a.es_principal ? '(Principal / Tienda)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className="form-label">Stock Actual {!editingProduct && '*'}</label>
                                    {editingProduct ? (
                                        <>
                                            <input className="form-input" type="number" value={form.stock_actual} disabled style={{ background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }} />
                                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Usa el botón "Ajustar stock" en la tabla para modificar este valor</p>
                                        </>
                                    ) : (
                                        <input className="form-input" type="number" min="0" required value={form.stock_actual} onChange={e => setForm({ ...form, stock_actual: e.target.value })} placeholder="0" />
                                    )}
                                </div>
                                <div>
                                    <label className="form-label">Stock Minimo *</label>
                                    <input className="form-input" type="number" min="0" required value={form.stock_minimo} onChange={e => setForm({ ...form, stock_minimo: e.target.value })} placeholder="0" />
                                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Se alertara cuando el stock baje de este nivel</p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ minWidth: 140 }}>{editingProduct ? 'Guardar Cambios' : 'Crear Producto'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <ConfirmModal
                open={!!confirmarEliminar}
                title="Eliminar producto"
                message={confirmarEliminar ? `¿Eliminar "${confirmarEliminar.nombre}"? Esta acción no se puede deshacer.` : ''}
                onConfirm={handleEliminar}
                onCancel={() => setConfirmarEliminar(null)}
            />
        </div>
    );
}