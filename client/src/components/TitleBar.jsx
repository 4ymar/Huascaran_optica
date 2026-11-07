import { useState, useEffect } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

// Franja de arrastre invisible + controles de ventana que solo aparecen
// al acercar el cursor a la esquina superior derecha. Requiere frame: false
// en main.js (ver electron/main.js) y windowControls expuesto en preload.js.
export default function TitleBar() {
    const [maximized, setMaximized] = useState(false);
    const controls = window.electronAPI?.windowControls;

    useEffect(() => {
        if (!controls) return;
        const unsubscribe = controls.onMaximizedChange(setMaximized);
        return unsubscribe;
    }, [controls]);

    // Si no corre dentro de Electron (o preload no cargó), no renderiza nada
    if (!controls) return null;

    return (
        <>
            <div className="titlebar-drag-region" />
            <div className="titlebar-hotzone">
                <div className="titlebar-pill">
                    <button className="titlebar-btn" onClick={() => controls.minimize()} title="Minimizar">
                        <Minus size={15} />
                    </button>
                    <button className="titlebar-btn" onClick={() => controls.maximizeToggle()} title={maximized ? 'Restaurar' : 'Maximizar'}>
                        {maximized ? <Copy size={13} /> : <Square size={13} />}
                    </button>
                    <button className="titlebar-btn titlebar-btn-close" onClick={() => controls.close()} title="Cerrar">
                        <X size={15} />
                    </button>
                </div>
            </div>
        </>
    );
}
