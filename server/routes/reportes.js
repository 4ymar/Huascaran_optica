const router = require('express').Router();
const db = require('../data/database');
const { requireRole } = require('../middleware/auth');
const logger = require('../logger');

// Offset de negocio (Perú, UTC-5). Única fuente de verdad para el cálculo
// de "día de negocio" — usado tanto por las funciones de fecha del dashboard
// como por el filtro de rango de /ventas.
const BUSINESS_UTC_OFFSET_MINUTES = -300;
const BUSINESS_UTC_OFFSET_HOURS = -BUSINESS_UTC_OFFSET_MINUTES / 60; // 5

// Paginación
const PAGINACION_LIMITE_DEFAULT = 20;
const PAGINACION_LIMITE_MAX = 100;

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function esFechaValida(str) {
    if (!FECHA_REGEX.test(str)) return false;
    const d = new Date(str + 'T00:00:00.000Z');
    return !isNaN(d.getTime());
}

function parsePaginacion(req) {
    let pagina = parseInt(req.query.page, 10);
    let limite = parseInt(req.query.limit, 10);
    if (!Number.isInteger(pagina) || pagina < 1) pagina = 1;
    if (!Number.isInteger(limite) || limite < 1) limite = PAGINACION_LIMITE_DEFAULT;
    if (limite > PAGINACION_LIMITE_MAX) limite = PAGINACION_LIMITE_MAX;
    const offset = (pagina - 1) * limite;
    return { pagina, limite, offset };
}

function manejarError(e, res, contexto) {
    logger.error('REPORTES', `${contexto}:`, e);
    res.status(500).json({ error: 'Ocurrió un error al generar el reporte. Inténtalo de nuevo.' });
}

const getNowBusinessDay = () => {
    const ahora = new Date();
    const peruMs = ahora.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000;
    const peru = new Date(peruMs);
    const y = peru.getUTCFullYear();
    const m = peru.getUTCMonth();
    const d = peru.getUTCDate();
    // Medianoche peruana expresada en UTC
    return new Date(Date.UTC(y, m, d, BUSINESS_UTC_OFFSET_HOURS, 0, 0));
};

const getStartOfMonthBusiness = () => {
    const ahora = new Date();
    const peruMs = ahora.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000;
    const peru = new Date(peruMs);
    const y = peru.getUTCFullYear();
    const m = peru.getUTCMonth();
    return new Date(Date.UTC(y, m, 1, BUSINESS_UTC_OFFSET_HOURS, 0, 0));
};

const getStartOfPrevMonthBusiness = () => {
    const ahora = new Date();
    const peruMs = ahora.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000;
    const peru = new Date(peruMs);
    const y = peru.getUTCFullYear();
    const m = peru.getUTCMonth();
    return new Date(Date.UTC(y, m - 1, 1, BUSINESS_UTC_OFFSET_HOURS, 0, 0));
};

// GET dashboard report
router.get('/dashboard', (req, res) => {
    try {
        const hoy = getNowBusinessDay();
        const inicioMes = getStartOfMonthBusiness();
        const ahora = new Date();

        const ventasHoy = db.reportes.ventasResumenDesde(hoy.toISOString());
        const ventasMes = db.reportes.ventasResumenDesde(inicioMes.toISOString());

        // Ayer (para variación de ventas de hoy)
        const ayer = new Date(hoy.getTime() - 86400000);
        const finAyer = new Date(hoy.getTime() - 1);
        const ventasAyer = db.reportes.ventasResumenRango({
            desde: ayer.toISOString(),
            hasta: finAyer.toISOString(),
        });

        // Mismo tramo de días del mes anterior (para variación de ventas del mes)
        const inicioMesAnterior = getStartOfPrevMonthBusiness();
        const finMesAnteriorTramo = new Date(inicioMesAnterior.getTime() + (ahora.getTime() - inicioMes.getTime()));
        const ventasMesAnterior = db.reportes.ventasResumenRango({
            desde: inicioMesAnterior.toISOString(),
            hasta: finMesAnteriorTramo.toISOString(),
        });

        // Utilidad y margen del mes, y del mismo tramo del mes anterior
        const utilidadMes = db.reportes.utilidadResumenRango({
            desde: inicioMes.toISOString(),
            hasta: ahora.toISOString(),
        });
        const utilidadMesAnterior = db.reportes.utilidadResumenRango({
            desde: inicioMesAnterior.toISOString(),
            hasta: finMesAnteriorTramo.toISOString(),
        });

        // Por debajo de este monto, la base de comparación es tan chica que
        // el % resultante no es representativo (ej. S/10 → S/250 da "2400%",
        // matemáticamente correcto pero inútil para el dueño del negocio).
        const UMBRAL_MINIMO_COMPARACION = 50;

        const variacionVentasHoy = ventasAyer.total >= UMBRAL_MINIMO_COMPARACION
            ? ((ventasHoy.total - ventasAyer.total) / ventasAyer.total) * 100
            : null;
        const variacionVentasMes = ventasMesAnterior.total >= UMBRAL_MINIMO_COMPARACION
            ? ((ventasMes.total - ventasMesAnterior.total) / ventasMesAnterior.total) * 100
            : null;
        const variacionMargen = ventasMesAnterior.total >= UMBRAL_MINIMO_COMPARACION
            ? utilidadMes.margen - utilidadMesAnterior.margen
            : null;

        const inv = db.reportes.inventarioResumen();

        // Todos los productos vendidos en el mes (sin límite) — el frontend
        // elige el top 5 según la métrica seleccionada (unidades/ventas/utilidad/margen).
        const topProductos = db.reportes.topProductosVendidos({
            desde: inicioMes.toISOString(),
            limite: null,
            agruparPorId: true,
        });

        // Últimos 90 días — un buen cliente puede no comprar todos los meses,
        // a diferencia de Top Productos que sí usa el mes en curso.
        const desde90Dias = new Date(hoy.getTime() - 89 * 86400000);
        const topClientes = db.reportes.topClientesCompra({
            desde: desde90Dias.toISOString(),
            limite: null,
        });

        // Ventas por día (últimos 7 días) con media móvil real de 7 días y
        // comparación contra el mismo día de la semana anterior.
        // Se piden 14 días en una sola consulta: los 7 visibles + 7 más atrás,
        // que sirven tanto de ventana para la media móvil como de "período anterior".
        const desdeTendencia = new Date(hoy.getTime() - 13 * 86400000);
        const filasTendencia = db.reportes.ventasPorDiaRango({
            desde: desdeTendencia.toISOString(),
            hasta: ahora.toISOString(),
        });
        const porFecha = {};
        filasTendencia.forEach(r => { porFecha[r.fecha] = { total: r.total, cantidad: r.cantidad }; });

        const totales14 = [];
        for (let i = 13; i >= 0; i--) {
            const dia = new Date(hoy.getTime() - i * 86400000);
            const fecha = dia.toISOString().split('T')[0];
            const entry = porFecha[fecha];
            totales14.push({ fecha, total: entry?.total || 0, cantidad: entry?.cantidad || 0 });
        }

        // Los últimos 7 (índices 7-13) son los días visibles del gráfico.
        const ventasPorDia = totales14.slice(7).map((punto, idx) => {
            const i = idx + 7;
            const ventana = totales14.slice(i - 6, i + 1); // el día + 6 anteriores
            const promedioMovil = ventana.reduce((acc, p) => acc + p.total, 0) / ventana.length;
            return {
                fecha: punto.fecha,
                total: punto.total,
                cantidad: punto.cantidad,
                promedioMovil,
                totalPeriodoAnterior: totales14[idx].total, // mismo día, 7 días antes
            };
        });

        // Productos con stock bajo/crítico (críticos primero, alfabético, máx. 10)
        const criticos = db.reportes.productosStockCritico(10);
        const bajos = db.reportes.productosStockBajoNivel(10);
        const productosStockBajo = [...criticos, ...bajos].slice(0, 10);

        const sunatActivo = db.config.obtener('sunat_activo') === '1';
        let cpeStatus = {
            activo: false,
            modo: 'demo',
            proveedor: 'nubefact',
            pendientes: 0,
            rechazados: 0,
        };

        if (sunatActivo) {
            const { pendientes, rechazados } = db.reportes.cpeEstadoContadores();
            cpeStatus = {
                activo: true,
                modo: db.config.obtener('sunat_modo') || 'demo',
                proveedor: db.config.obtener('cpe_proveedor') || 'nubefact',
                pendientes,
                rechazados,
            };
        }

        res.json({
            ventasHoy: { total: ventasHoy.total, cantidad: ventasHoy.cantidad },
            ventasMes: { total: ventasMes.total, cantidad: ventasMes.cantidad },
            ventasAyer: { total: ventasAyer.total, cantidad: ventasAyer.cantidad },
            ventasMesAnterior: { total: ventasMesAnterior.total, cantidad: ventasMesAnterior.cantidad },
            variacionVentasHoy,
            variacionVentasMes,
            utilidadMes,
            variacionMargen,
            stockCritico: inv.stock_critico,
            stockBajo: inv.stock_bajo,
            valorInventario: inv.valor_compra,
            topProductos,
            topClientes,
            ventasPorDia,
            productosStockBajo,
            totalProductos: inv.total_productos,
            cpeStatus,
        });
    } catch (e) {
        manejarError(e, res, 'GET /dashboard');
    }
});

// GET sales report by period
router.get('/ventas', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const { fecha_desde, fecha_hasta } = req.query;

        if (fecha_desde && !esFechaValida(fecha_desde)) {
            return res.status(400).json({ error: 'fecha_desde inválida. Formato esperado: YYYY-MM-DD' });
        }
        if (fecha_hasta && !esFechaValida(fecha_hasta)) {
            return res.status(400).json({ error: 'fecha_hasta inválida. Formato esperado: YYYY-MM-DD' });
        }

        let desde, hasta;
        if (fecha_desde) {
            desde = new Date(new Date(fecha_desde + 'T00:00:00.000Z').getTime() - (BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000)).toISOString();
        }
        if (fecha_hasta) {
            hasta = new Date(new Date(fecha_hasta + 'T23:59:59.999Z').getTime() - (BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000)).toISOString();
        }

        const resumen = db.reportes.ventasResumenRango({ desde, hasta });
        const ticketPromedio = resumen.cantidad > 0 ? resumen.total / resumen.cantidad : 0;

        // Top products (agrupado por nombre, igual que el comportamiento original de esta ruta)
        const topProductos = db.reportes.topProductosVendidos({ desde, hasta, limite: 10, agruparPorId: false });

        // By payment method
        const porFormaPagoRows = db.reportes.ventasPorFormaPago({ desde, hasta });
        const porFormaPago = {};
        porFormaPagoRows.forEach(r => {
            porFormaPago[r.forma_pago] = { total: r.total, cantidad: r.cantidad };
        });

        // By product category
        const ventasPorCategoria = db.reportes.ventasPorCategoria({ desde, hasta });

        // Tendencia diaria de ventas en el rango seleccionado (para el gráfico)
        const ventasPorDia = db.reportes.ventasPorDiaRango({ desde, hasta });

        // Listado paginado de ventas del rango. El total viene de `resumen.cantidad`,
        // que ya cuenta con el mismo filtro (estado ACTIVA + rango de fechas).
        const { pagina, limite, offset } = parsePaginacion(req);
        const ventas = db.reportes.ventasRango({ desde, hasta, limite, offset });

        res.json({
            totalVentas: resumen.cantidad,
            totalFacturado: resumen.total,
            totalIgv: resumen.igv,
            ticketPromedio,
            topProductos,
            porFormaPago,
            ventasPorCategoria,
            ventas,
            ventasPorDia,
            paginacion: {
                pagina,
                limite,
                total: resumen.cantidad,
                totalPaginas: Math.ceil(resumen.cantidad / limite) || 0,
            },
        });
    } catch (e) {
        manejarError(e, res, 'GET /ventas');
    }
});

// GET inventory report
router.get('/inventario', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        const inv = db.reportes.inventarioResumen();
        const porCategoriaRows = db.reportes.inventarioPorCategoria();
        const porCategoria = {};
        porCategoriaRows.forEach(c => {
            porCategoria[c.categoria] = { cantidad: c.cantidad, valor: c.valor, items: c.items };
        });

        // Stock total agrupado por ubicación (tienda vs almacén)
        const stockPorUbicacion = db.reportes.stockPorUbicacion();

        // Listado paginado de productos activos. El total viene de `inv.total_productos`
        // (mismo filtro estado = 1 que usa la consulta paginada vía soloActivos).
        const { pagina, limite, offset } = parsePaginacion(req);
        const productos = db.productos.listar({ soloActivos: true, limite, offset });

        res.json({
            totalProductos: inv.total_productos,
            valorTotalCompra: inv.valor_compra,
            valorTotalVenta: inv.valor_venta,
            stockCritico: db.reportes.productosStockCritico(),
            stockBajo: db.reportes.productosStockBajoNivel(),
            porCategoria,
            stockPorUbicacion,
            productos,
            paginacion: {
                pagina,
                limite,
                total: inv.total_productos,
                totalPaginas: Math.ceil(inv.total_productos / limite) || 0,
            },
        });
    } catch (e) {
        manejarError(e, res, 'GET /inventario');
    }
});

// GET productos sin movimiento (para detectar sobreinventario / capital inmovilizado)
router.get('/productos-sin-movimiento', requireRole('ADMIN', 'ENCARGADO_ALMACEN'), (req, res) => {
    try {
        let dias = parseInt(req.query.dias, 10);
        if (!Number.isInteger(dias) || dias < 1) dias = 30;
        if (dias > 365) dias = 365;

        const productos = db.reportes.productosSinMovimiento({ dias });
        res.json({ dias, productos });
    } catch (e) {
        manejarError(e, res, 'GET /productos-sin-movimiento');
    }
});

module.exports = router;
