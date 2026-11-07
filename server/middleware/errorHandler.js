/**
 * errorHandler.js
 * ────────────────────────────────────────────────────────────
 * Middleware centralizado de errores para Express.
 * Captura cualquier error que pase por next(err) o que
 * sea lanzado dentro de un asyncHandler.
 *
 * Responsabilidades:
 *   1. Logear el error al archivo (app-error.log)
 *   2. Devolver una respuesta JSON consistente al cliente
 *   3. Distinguir entre errores operacionales (400-499) y del servidor (500)
 *
 * USO: Registrar al FINAL de todas las rutas en index.js:
 *   const errorHandler = require('./middleware/errorHandler');
 *   app.use(errorHandler);
 * ────────────────────────────────────────────────────────────
 */

const logger = require('../logger');

/**
 * Escribe un mensaje de error en el archivo de log.
 */
function logError(err, req) {
    const metodo  = req.method || '?';
    const ruta    = req.originalUrl || req.url || '?';
    const mensaje = err.message || 'Error desconocido';
    logger.error('EXPRESS', `${metodo} ${ruta} → ${mensaje}`, err.stack || '');
}

/**
 * Middleware de errores de Express.
 * IMPORTANTE: Debe tener exactamente 4 parámetros (err, req, res, next)
 * para que Express lo reconozca como error handler.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    // 1. Logear al archivo
    logError(err, req);

    // 2. Determinar status code
    //    - Si el error ya tiene un statusCode (puesto por la ruta), usarlo
    //    - Si no, default a 500
    const statusCode = err.statusCode || err.status || 500;

    // 3. Construir respuesta consistente
    const respuesta = {
        ok: false,
        error: err.message || 'Error interno del servidor',
    };

    // En desarrollo, incluir el código de error si lo tiene
    if (err.codigo) {
        respuesta.codigo = err.codigo;
    }

    // 4. Enviar respuesta
    res.status(statusCode).json(respuesta);
}

module.exports = errorHandler;
