/**
 * Catálogo de códigos de error y respuestas de NubeFact / SUNAT
 * Referencia: NUBEFACT DOC API JSON V1.md y especificaciones de SUNAT.
 */
const ERRORES_NUBEFACT = {
    "10": "El comprobante tiene observaciones que deben ser revisadas, pero fue aceptado preliminarmente.",
    "11": "El comprobante ha sido rechazado por SUNAT debido a inconsistencias en los datos.",
    "12": "El número de documento de identidad del cliente no es válido o no existe en los padrones de SUNAT.",
    "20": "El RUC de la empresa emisora no se encuentra activo o no está autorizado a emitir este tipo de comprobante.",
    "21": "El token de autorización proporcionado no es válido o ha expirado. Verifique la configuración.",
    "22": "La serie del comprobante es inválida o no corresponde al tipo de documento.",
    "23": "El comprobante ya fue registrado previamente en NubeFact con la misma serie y número.",
    "24": "El número de correlativo enviado es menor o igual al último comprobante aceptado para esta serie.",
    "40": "Error de comunicación o timeout con los servidores de SUNAT. NubeFact reintentará el envío automáticamente.",
    "50": "Error interno en los servidores de NubeFact. Intente la operación en unos momentos.",
    "51": "El formato del archivo JSON enviado contiene errores de estructura o tipos de datos incorrectos."
};

/**
 * Traduce un código de error de NubeFact a un mensaje amigable.
 * 
 * @param {string|number} codigo Código de error devuelto por NubeFact
 * @param {string} mensajeOriginal Mensaje crudo recibido de la API
 * @returns {string} Mensaje amigable
 */
function obtenerMensajeError(codigo, mensajeOriginal) {
    const codigoStr = String(codigo || '');
    if (ERRORES_NUBEFACT[codigoStr]) {
        return ERRORES_NUBEFACT[codigoStr];
    }
    return mensajeOriginal || "Ocurrió un error inesperado al procesar el comprobante.";
}

module.exports = {
    ERRORES_NUBEFACT,
    obtenerMensajeError
};
