function translateCpeError(rawError) {
    if (!rawError) return 'Error desconocido al procesar el comprobante electrónico.';

    let messageStr = '';
    if (typeof rawError === 'string') {
        messageStr = rawError;
    } else if (typeof rawError === 'object') {
        if (rawError.errors) {
            messageStr = Array.isArray(rawError.errors) ? rawError.errors.join(' | ') : String(rawError.errors);
        } else if (rawError.mensaje) {
            messageStr = String(rawError.mensaje);
        } else {
            messageStr = JSON.stringify(rawError);
        }
    }

    const lower = messageStr.toLowerCase();

    if (lower.includes('codigo: 23') || lower.includes('ya existe')) {
        return 'El comprobante ya fue registrado anteriormente en NubeFact. Se ha sincronizado el estado.';
    }
    if (lower.includes('2010') || lower.includes('el ruc no existe') || lower.includes('ruc invalido')) {
        return 'El RUC ingresado no existe en el padrón de SUNAT. Verifique los 11 dígitos con el cliente.';
    }
    if (lower.includes('2015') || lower.includes('dni invalido') || lower.includes('dni no existe')) {
        return 'El DNI ingresado no es válido. Verifique los 8 dígitos con el cliente.';
    }
    if (lower.includes('supera los 700') || lower.includes('700 soles')) {
        return 'Las Boletas mayores a S/ 700.00 requieren identificar al cliente con DNI o RUC obligatoriamente.';
    }
    if (lower.includes('1033') || lower.includes('comprobante fue registrado previamente')) {
        return 'El número de comprobante ya existe en SUNAT. La serie o correlativo ya fue utilizado.';
    }
    if (lower.includes('token') || lower.includes('unauthorized') || lower.includes('401')) {
        return 'Error de autenticación con NubeFact. Verifique el token de facturación en Ajustes.';
    }
    if (lower.includes('saldo insuficiente') || lower.includes('plan agotado') || lower.includes('limite superado')) {
        return 'Su plan o saldo de comprobantes en NubeFact se ha agotado. Por favor recargue su cuenta en NubeFact.';
    }
    if (lower.includes('timeout') || lower.includes('tardo demasiado')) {
        return 'NubeFact tardó en responder. El comprobante puede estar en proceso. Use "Consultar SUNAT" antes de reintentar.';
    }

    return messageStr;
}

module.exports = { translateCpeError };
