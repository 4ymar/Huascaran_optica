const nubefact = require('./providers/nubefact');

const providers = {
    nubefact,
};

function getProvider(id = 'nubefact') {
    const provider = providers[String(id || 'nubefact').toLowerCase()];
    if (!provider) {
        throw new Error(`Proveedor CPE no soportado: ${id}`);
    }
    return provider;
}

module.exports = { getProvider };
