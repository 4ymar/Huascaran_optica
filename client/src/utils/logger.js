const isDev = import.meta.env.DEV;

function format(tag, args) {
    const text = args.map(a => {
        if (a instanceof Error) return a.message || String(a);
        if (typeof a === 'object') {
            try {
                return JSON.stringify(a);
            } catch (_) {
                return '[Object]';
            }
        }
        return String(a);
    }).join(' ');
    return tag ? `[${tag}] ${text}` : text;
}

function sendToElectron(level, tag, args) {
    if (window.electronAPI?.rendererLog) {
        const msg = format(tag, args);
        try {
            window.electronAPI.rendererLog(`[${level.toUpperCase()}] ${msg}`);
        } catch (_) {}
    }
}

export const logger = {
    debug(tag, ...args) {
        if (!isDev) return;
        console.debug(`%c[DEBUG] [${tag}]`, 'color: #06b6d4;', ...args);
    },

    info(tag, ...args) {
        if (!isDev) return;
        console.info(`%c[INFO] [${tag}]`, 'color: #10b981;', ...args);
    },

    warn(tag, ...args) {
        if (isDev) {
            console.warn(`[WARN] [${tag}]`, ...args);
        }
        sendToElectron('warn', tag, args);
    },

    error(tag, ...args) {
        if (isDev) {
            console.error(`[ERROR] [${tag}]`, ...args);
        }
        sendToElectron('error', tag, args);
    }
};

export default logger;
