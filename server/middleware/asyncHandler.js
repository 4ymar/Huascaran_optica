/**
 * asyncHandler.js
 * ────────────────────────────────────────────────────────────
 * Envuelve cualquier handler de ruta Express (sync o async).
 * Si el handler lanza un error, lo captura y lo pasa a next()
 * para que lo atrape el middleware de errores centralizado.
 *
 * USO:
 *   const asyncHandler = require('../middleware/asyncHandler');
 *   router.get('/', asyncHandler((req, res) => {
 *       const data = db.productos.listar();
 *       res.json(data);
 *   }));
 *
 * Si la función falla, el error va directo al errorHandler
 * sin necesidad de try/catch manual en cada ruta.
 * ────────────────────────────────────────────────────────────
 */

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
