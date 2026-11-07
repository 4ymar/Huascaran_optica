const apiperu = require('./providers/apiperu');

const providers = {
    apiperu,
};

function getProvider(id = 'apiperu') {
    const provider = providers[String(id || 'apiperu').toLowerCase()];
    if (!provider) {
        throw new Error(`Proveedor de documentos no soportado: ${id}`);
    }
    return provider;
}

module.exports = { getProvider };