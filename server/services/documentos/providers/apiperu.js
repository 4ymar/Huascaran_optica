const https = require('https');

const HOST = 'apiperu.dev';

function requestJson(pathUrl, token, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            path: pathUrl,
            method: 'GET',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (_) { resolve({ status: res.statusCode, body: data }); }
            });
        });

        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('Timeout ApiPeru.dev - intente nuevamente')); });
        req.end();
    });
}

/**
 * Consulta un DNI o RUC en ApiPeru.dev.
 * @param {Object} params
 * @param {'DNI'|'RUC'} params.tipo
 * @param {string} params.numero
 * @param {string} params.token - Token Bearer del cliente (desencriptado)
 * @returns {Promise<{ nombre_razon_social: string, direccion: string|null }>}
 * @throws {Error} con mensaje legible si falla la consulta
 */
async function consultarDocumento({ tipo, numero, token }) {
    if (!token) {
        throw new Error('Token de ApiPeru.dev no configurado');
    }

    const endpoint = String(tipo).toUpperCase() === 'RUC' ? 'ruc' : 'dni';
    const result = await requestJson(`/api/${endpoint}/${numero}`, token);

    if (result.status === 401) {
        throw new Error('Token de ApiPeru.dev inválido o vencido');
    }
    if (result.status === 404) {
        throw new Error('Documento no encontrado');
    }
    if (result.status !== 200 || !result.body?.success || !result.body?.data) {
        throw new Error('No se pudo conectar con ApiPeru.dev');
    }

    const data = result.body.data;

    if (endpoint === 'ruc') {
        return {
            nombre_razon_social: data.nombre_o_razon_social || '',
            direccion: data.direccion_completa || data.direccion || null,
        };
    }

    // DNI: ApiPeru.dev no devuelve dirección para este endpoint
    const nombreCompleto = [data.nombres, data.apellido_paterno, data.apellido_materno]
        .filter(Boolean)
        .join(' ');

    return {
        nombre_razon_social: nombreCompleto,
        direccion: null,
    };
}

module.exports = {
    id: 'apiperu',
    consultarDocumento,
};