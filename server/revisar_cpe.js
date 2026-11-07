const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'inventario.db'));

console.log('=== cpe_eventos (últimos 5 de anulación) ===');
console.log(db.prepare(`
    SELECT operacion, estado, request_json, response_json, mensaje, fecha_hora
    FROM cpe_eventos
    WHERE operacion IN ('ANULAR_CPE','CONSULTAR_ANULACION')
    ORDER BY fecha_hora DESC
    LIMIT 5
`).all());

console.log('=== cpe_documentos (boleta B001-00000035) ===');
console.log(db.prepare(`
    SELECT proveedor, tipo_comprobante, serie, numero, estado, response_json, fecha_actualizacion
    FROM cpe_documentos
    WHERE tipo_comprobante = 'BOLETA' AND serie = 'B001' AND numero = '00000035'
`).all());

db.close();