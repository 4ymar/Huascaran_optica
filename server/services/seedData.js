/**
 * services/seedData.js
 * Generador de datos de demostración (autocontenido, sin dependencias externas).
 * Extraído de config.js para separar la responsabilidad de "generar datos de prueba"
 * de la de "configuración del sistema".
 */
const { randomUUID } = require('crypto');

function generateSeedData(serieBoleta = 'B001', serieFactura = 'F001') {
    const now = new Date().toISOString();

    function hace(dias, horaBase = 9) {
        const d = new Date();
        d.setDate(d.getDate() - dias);
        d.setHours(horaBase + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
        return d.toISOString();
    }

    // Reparte el stock_actual de un producto entre Tienda y Almacén (depósito)
    // con un porcentaje aleatorio para Tienda entre 40% y 85%. El resto va al depósito.
    function splitStockAlmacenes(stockTotal) {
        const pctTienda     = 0.40 + Math.random() * 0.45; // 40%–85%
        const stockTienda   = Math.round(stockTotal * pctTienda);
        const stockDeposito = stockTotal - stockTienda;
        return { stock_tienda: stockTienda, stock_deposito: stockDeposito };
    }

    const productosRaw = [
        { sku: 'FERR-001', nombre: 'Martillo de Carpintero 16oz Stanley',          categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 25.00,  precio_venta: 42.00,  stock_actual: 28, stock_minimo: 5  },
        { sku: 'FERR-002', nombre: 'Destornillador Phillips #2 mango ergonómico',  categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 8.00,   precio_venta: 15.00,  stock_actual: 45, stock_minimo: 10 },
        { sku: 'FERR-003', nombre: 'Alicate Universal 8" Stanley',                 categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 18.00,  precio_venta: 32.00,  stock_actual: 22, stock_minimo: 5  },
        { sku: 'FERR-004', nombre: 'Llave Francesa Ajustable 10"',                 categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 22.00,  precio_venta: 38.00,  stock_actual: 14, stock_minimo: 3  },
        { sku: 'FERR-005', nombre: 'Sierra Manual para Madera 20" 8 TPI',          categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 28.00,  precio_venta: 48.00,  stock_actual: 10, stock_minimo: 3  },
        { sku: 'FERR-006', nombre: 'Juego de Llaves Allen 9 piezas',               categoria: 'Herramientas',               unidad_medida: 'juego',   precio_compra: 12.00,  precio_venta: 22.00,  stock_actual: 18, stock_minimo: 4  },
        { sku: 'FERR-007', nombre: 'Taladro Percutor 750W BOSCH GSB 13 RE',        categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 180.00, precio_venta: 299.00, stock_actual: 7,  stock_minimo: 2  },
        { sku: 'FERR-008', nombre: 'Amoladora Angular 4.5" 850W BOSCH',            categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 150.00, precio_venta: 249.00, stock_actual: 5,  stock_minimo: 2  },
        { sku: 'FERR-009', nombre: 'Nivel de Burbuja 24" aluminio',                categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 15.00,  precio_venta: 28.00,  stock_actual: 16, stock_minimo: 4  },
        { sku: 'FERR-010', nombre: 'Cinta Métrica 5m Stanley FatMax',              categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 10.00,  precio_venta: 18.00,  stock_actual: 38, stock_minimo: 8  },
        { sku: 'FERR-011', nombre: 'Combo / Macho 5 lb mango fibra de vidrio',     categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 22.00,  precio_venta: 38.00,  stock_actual: 12, stock_minimo: 3  },
        { sku: 'FERR-012', nombre: 'Pico Minero 3.5 kg mango eucalipto',           categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 32.00,  precio_venta: 55.00,  stock_actual: 10, stock_minimo: 3  },
        { sku: 'FERR-013', nombre: 'Palana Recta Hoja Acero mango madera',         categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 26.00,  precio_venta: 45.00,  stock_actual: 12, stock_minimo: 3  },
        { sku: 'FERR-014', nombre: 'Barreta Hexagonal 1m x 1" acero',              categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 38.00,  precio_venta: 65.00,  stock_actual: 8,  stock_minimo: 2  },
        { sku: 'FERR-015', nombre: 'Escuadra Metálica 30cm para carpintería',      categoria: 'Herramientas',               unidad_medida: 'unidad',  precio_compra: 8.00,   precio_venta: 14.00,  stock_actual: 20, stock_minimo: 5  },
        { sku: 'CONS-001', nombre: 'Cemento Portland Tipo I Sol 42.5 kg',          categoria: 'Materiales de Construccion', unidad_medida: 'bolsa',   precio_compra: 22.50,  precio_venta: 32.00,  stock_actual: 95, stock_minimo: 20 },
        { sku: 'CONS-002', nombre: 'Fierro Corrugado 1/2" x 9m (12mm)',            categoria: 'Materiales de Construccion', unidad_medida: 'varilla', precio_compra: 28.00,  precio_venta: 42.00,  stock_actual: 75, stock_minimo: 15 },
        { sku: 'CONS-003', nombre: 'Fierro Corrugado 3/8" x 9m (9.5mm)',           categoria: 'Materiales de Construccion', unidad_medida: 'varilla', precio_compra: 18.00,  precio_venta: 28.00,  stock_actual: 90, stock_minimo: 20 },
        { sku: 'CONS-004', nombre: 'Fierro Corrugado 1/4" x 9m (6mm)',             categoria: 'Materiales de Construccion', unidad_medida: 'varilla', precio_compra: 10.00,  precio_venta: 16.00,  stock_actual: 80, stock_minimo: 15 },
        { sku: 'CONS-005', nombre: 'Ladrillo King Kong 18 huecos',                 categoria: 'Materiales de Construccion', unidad_medida: 'millar',  precio_compra: 450.00, precio_venta: 650.00, stock_actual: 6,  stock_minimo: 2  },
        { sku: 'CONS-006', nombre: 'Arena Gruesa Hormigon (m3)',                   categoria: 'Materiales de Construccion', unidad_medida: 'm3',      precio_compra: 45.00,  precio_venta: 70.00,  stock_actual: 8,  stock_minimo: 2  },
        { sku: 'CONS-007', nombre: 'Piedra Chancada 1/2" (m3)',                    categoria: 'Materiales de Construccion', unidad_medida: 'm3',      precio_compra: 55.00,  precio_venta: 85.00,  stock_actual: 6,  stock_minimo: 2  },
        { sku: 'CONS-008', nombre: 'Alambre Negro #16 recocido (kg)',              categoria: 'Materiales de Construccion', unidad_medida: 'kg',      precio_compra: 5.00,   precio_venta: 8.50,   stock_actual: 48, stock_minimo: 10 },
        { sku: 'CONS-009', nombre: 'Clavo 3" con cabeza (kg)',                     categoria: 'Materiales de Construccion', unidad_medida: 'kg',      precio_compra: 4.50,   precio_venta: 7.50,   stock_actual: 42, stock_minimo: 10 },
        { sku: 'CONS-010', nombre: 'Clavo 2.5" con cabeza (kg)',                   categoria: 'Materiales de Construccion', unidad_medida: 'kg',      precio_compra: 4.50,   precio_venta: 7.50,   stock_actual: 38, stock_minimo: 10 },
        { sku: 'CONS-011', nombre: 'Cal Hidratada Bolsa 25 kg',                    categoria: 'Materiales de Construccion', unidad_medida: 'bolsa',   precio_compra: 9.00,   precio_venta: 15.00,  stock_actual: 35, stock_minimo: 8  },
        { sku: 'CONS-012', nombre: 'Yeso Industrial Bolsa 20 kg',                  categoria: 'Materiales de Construccion', unidad_medida: 'bolsa',   precio_compra: 8.00,   precio_venta: 13.00,  stock_actual: 25, stock_minimo: 6  },
        { sku: 'CONS-013', nombre: 'Triplay Lupuna 4x8 pies e=9mm',                categoria: 'Materiales de Construccion', unidad_medida: 'plancha', precio_compra: 38.00,  precio_venta: 58.00,  stock_actual: 20, stock_minimo: 5  },
        { sku: 'CONS-014', nombre: 'Liston Pino Cepillado 2x3" x 3m',             categoria: 'Materiales de Construccion', unidad_medida: 'unidad',  precio_compra: 8.00,   precio_venta: 13.00,  stock_actual: 30, stock_minimo: 8  },
        { sku: 'ELEC-001', nombre: 'Cable TW 14 AWG Indeco (rollo 100m)',          categoria: 'Electricidad',               unidad_medida: 'rollo',   precio_compra: 85.00,  precio_venta: 135.00, stock_actual: 14, stock_minimo: 3  },
        { sku: 'ELEC-002', nombre: 'Cable TW 12 AWG Indeco (rollo 100m)',          categoria: 'Electricidad',               unidad_medida: 'rollo',   precio_compra: 120.00, precio_venta: 189.00, stock_actual: 10, stock_minimo: 3  },
        { sku: 'ELEC-003', nombre: 'Cable NYY 2x2.5mm Indeco (metro)',             categoria: 'Electricidad',               unidad_medida: 'metro',   precio_compra: 3.50,   precio_venta: 5.50,   stock_actual: 150,stock_minimo: 30 },
        { sku: 'ELEC-004', nombre: 'Interruptor Simple BTICINO Magic',             categoria: 'Electricidad',               unidad_medida: 'unidad',  precio_compra: 4.50,   precio_venta: 8.00,   stock_actual: 55, stock_minimo: 12 },
        { sku: 'ELEC-005', nombre: 'Tomacorriente Doble BTICINO Magic',            categoria: 'Electricidad',               unidad_medida: 'unidad',  precio_compra: 5.00,   precio_venta: 9.00,   stock_actual: 50, stock_minimo: 12 },
        { sku: 'ELEC-006', nombre: 'Foco LED 12W E27 Luz Blanca 6500K',            categoria: 'Electricidad',               unidad_medida: 'unidad',  precio_compra: 5.50,   precio_venta: 10.00,  stock_actual: 75, stock_minimo: 20 },
        { sku: 'ELEC-007', nombre: 'Foco LED 9W E27 Luz Calida 3000K',             categoria: 'Electricidad',               unidad_medida: 'unidad',  precio_compra: 4.50,   precio_venta: 8.50,   stock_actual: 70, stock_minimo: 15 },
        { sku: 'ELEC-008', nombre: 'Cinta Aislante 3M Super 33 (20m)',             categoria: 'Electricidad',               unidad_medida: 'unidad',  precio_compra: 3.50,   precio_venta: 6.50,   stock_actual: 65, stock_minimo: 15 },
        { sku: 'ELEC-009', nombre: 'Tablero Electrico 6 polos empotrar',           categoria: 'Electricidad',               unidad_medida: 'unidad',  precio_compra: 35.00,  precio_venta: 58.00,  stock_actual: 8,  stock_minimo: 2  },
        { sku: 'ELEC-010', nombre: 'Llave Termica Breaker 20A SCHNEIDER',          categoria: 'Electricidad',               unidad_medida: 'unidad',  precio_compra: 18.00,  precio_venta: 32.00,  stock_actual: 18, stock_minimo: 4  },
        { sku: 'ELEC-011', nombre: 'Llave Termica Breaker 32A SCHNEIDER',          categoria: 'Electricidad',               unidad_medida: 'unidad',  precio_compra: 22.00,  precio_venta: 38.00,  stock_actual: 12, stock_minimo: 3  },
        { sku: 'ELEC-012', nombre: 'Conduit PVC 3/4" x 3m tubo luz',              categoria: 'Electricidad',               unidad_medida: 'unidad',  precio_compra: 3.00,   precio_venta: 5.00,   stock_actual: 60, stock_minimo: 15 },
        { sku: 'PLOM-001', nombre: 'Tubo PVC SAP 1/2" x 5m Presion',              categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 8.00,   precio_venta: 14.00,  stock_actual: 38, stock_minimo: 10 },
        { sku: 'PLOM-002', nombre: 'Tubo PVC SAP 3/4" x 5m Presion',              categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 12.00,  precio_venta: 20.00,  stock_actual: 30, stock_minimo: 8  },
        { sku: 'PLOM-003', nombre: 'Tubo PVC SEL 1" x 3m Desague',                categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 9.00,   precio_venta: 15.00,  stock_actual: 25, stock_minimo: 6  },
        { sku: 'PLOM-004', nombre: 'Tubo PVC Desague 4" x 3m',                    categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 18.00,  precio_venta: 28.00,  stock_actual: 20, stock_minimo: 5  },
        { sku: 'PLOM-005', nombre: 'Codo PVC 1/2" x 90 grados',                   categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 0.80,   precio_venta: 1.50,   stock_actual: 190,stock_minimo: 50 },
        { sku: 'PLOM-006', nombre: 'Codo PVC 3/4" x 90 grados',                   categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 1.00,   precio_venta: 2.00,   stock_actual: 140,stock_minimo: 40 },
        { sku: 'PLOM-007', nombre: 'Tee PVC 1/2"',                                categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 1.00,   precio_venta: 2.00,   stock_actual: 145,stock_minimo: 40 },
        { sku: 'PLOM-008', nombre: 'Union PVC 1/2" simple presion',               categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 0.60,   precio_venta: 1.20,   stock_actual: 200,stock_minimo: 50 },
        { sku: 'PLOM-009', nombre: 'Pegamento PVC Oatey (120ml)',                  categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 12.00,  precio_venta: 20.00,  stock_actual: 22, stock_minimo: 5  },
        { sku: 'PLOM-010', nombre: 'Llave de Paso 1/2" Bronce',                   categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 15.00,  precio_venta: 28.00,  stock_actual: 16, stock_minimo: 4  },
        { sku: 'PLOM-011', nombre: 'Llave de Paso 3/4" Bronce',                   categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 18.00,  precio_venta: 32.00,  stock_actual: 12, stock_minimo: 3  },
        { sku: 'PLOM-012', nombre: 'Cinta Teflon 3/4" x 10m',                     categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 1.50,   precio_venta: 3.00,   stock_actual: 95, stock_minimo: 25 },
        { sku: 'PLOM-013', nombre: 'Grifo Canon Cromado Lavatorio',                categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 35.00,  precio_venta: 58.00,  stock_actual: 5,  stock_minimo: 2  },
        { sku: 'PLOM-014', nombre: 'Trampa PVC 2" para lavatorio',                 categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 6.00,   precio_venta: 11.00,  stock_actual: 20, stock_minimo: 5  },
        { sku: 'PLOM-015', nombre: 'Flotador 1/2" boya tanque agua',               categoria: 'Plomeria',                   unidad_medida: 'unidad',  precio_compra: 7.00,   precio_venta: 13.00,  stock_actual: 18, stock_minimo: 4  },
        { sku: 'PINT-001', nombre: 'Pintura Latex Blanco Humo CPP (4L)',           categoria: 'Pintura',                    unidad_medida: 'galon',   precio_compra: 32.00,  precio_venta: 52.00,  stock_actual: 18, stock_minimo: 4  },
        { sku: 'PINT-002', nombre: 'Pintura Latex Color Viva (4L)',                categoria: 'Pintura',                    unidad_medida: 'galon',   precio_compra: 38.00,  precio_venta: 62.00,  stock_actual: 14, stock_minimo: 4  },
        { sku: 'PINT-003', nombre: 'Pintura Esmalte Sintetico Blanco (1L)',        categoria: 'Pintura',                    unidad_medida: 'litro',   precio_compra: 18.00,  precio_venta: 30.00,  stock_actual: 22, stock_minimo: 5  },
        { sku: 'PINT-004', nombre: 'Pintura Anticorrosiva Gris 1L TEKNO',         categoria: 'Pintura',                    unidad_medida: 'litro',   precio_compra: 22.00,  precio_venta: 36.00,  stock_actual: 16, stock_minimo: 4  },
        { sku: 'PINT-005', nombre: 'Thinner Acrilico 1 litro',                    categoria: 'Pintura',                    unidad_medida: 'litro',   precio_compra: 8.00,   precio_venta: 14.00,  stock_actual: 28, stock_minimo: 8  },
        { sku: 'PINT-006', nombre: 'Rodillo de Pintura 9" con mango',             categoria: 'Pintura',                    unidad_medida: 'unidad',  precio_compra: 8.00,   precio_venta: 15.00,  stock_actual: 18, stock_minimo: 4  },
        { sku: 'PINT-007', nombre: 'Brocha 4" cerda natural profesional',         categoria: 'Pintura',                    unidad_medida: 'unidad',  precio_compra: 6.00,   precio_venta: 12.00,  stock_actual: 22, stock_minimo: 5  },
        { sku: 'PINT-008', nombre: 'Brocha 2" cerda natural',                     categoria: 'Pintura',                    unidad_medida: 'unidad',  precio_compra: 3.50,   precio_venta: 7.00,   stock_actual: 28, stock_minimo: 6  },
        { sku: 'PINT-009', nombre: 'Masilla para Pared blanca (1kg)',              categoria: 'Pintura',                    unidad_medida: 'kg',      precio_compra: 5.00,   precio_venta: 9.00,   stock_actual: 32, stock_minimo: 8  },
        { sku: 'PINT-010', nombre: 'Lija al Agua #150 (hoja)',                    categoria: 'Pintura',                    unidad_medida: 'unidad',  precio_compra: 1.50,   precio_venta: 3.00,   stock_actual: 3,  stock_minimo: 20 },
        { sku: 'PINT-011', nombre: 'Lija al Agua #80 (hoja)',                     categoria: 'Pintura',                    unidad_medida: 'unidad',  precio_compra: 1.50,   precio_venta: 3.00,   stock_actual: 5,  stock_minimo: 20 },
        { sku: 'PINT-012', nombre: 'Imprimante Blanco TEKNO (4L)',                categoria: 'Pintura',                    unidad_medida: 'galon',   precio_compra: 22.00,  precio_venta: 35.00,  stock_actual: 14, stock_minimo: 4  },
        { sku: 'GRAL-001', nombre: 'Candado 40mm Forte acero inoxidable',         categoria: 'Ferreteria General',         unidad_medida: 'unidad',  precio_compra: 12.00,  precio_venta: 22.00,  stock_actual: 28, stock_minimo: 6  },
        { sku: 'GRAL-002', nombre: 'Bisagra 3" x 3" cromada (par)',               categoria: 'Ferreteria General',         unidad_medida: 'par',     precio_compra: 4.00,   precio_venta: 7.50,   stock_actual: 38, stock_minimo: 10 },
        { sku: 'GRAL-003', nombre: 'Tornillo Drywall 6x1" caja x100',             categoria: 'Ferreteria General',         unidad_medida: 'caja',    precio_compra: 5.00,   precio_venta: 9.00,   stock_actual: 45, stock_minimo: 10 },
        { sku: 'GRAL-004', nombre: 'Tarugo Plastico 1/4" bolsa x100',             categoria: 'Ferreteria General',         unidad_medida: 'bolsa',   precio_compra: 3.00,   precio_venta: 6.00,   stock_actual: 42, stock_minimo: 10 },
        { sku: 'GRAL-005', nombre: 'Cerradura Sobreponer 3 golpes FORTE',         categoria: 'Ferreteria General',         unidad_medida: 'unidad',  precio_compra: 28.00,  precio_venta: 48.00,  stock_actual: 9,  stock_minimo: 3  },
        { sku: 'GRAL-006', nombre: 'Disco de Corte Metal 4.5" NORTON',            categoria: 'Ferreteria General',         unidad_medida: 'unidad',  precio_compra: 3.50,   precio_venta: 6.50,   stock_actual: 58, stock_minimo: 15 },
        { sku: 'GRAL-007', nombre: 'Disco Desbaste Metal 4.5" NORTON',            categoria: 'Ferreteria General',         unidad_medida: 'unidad',  precio_compra: 4.50,   precio_venta: 8.00,   stock_actual: 40, stock_minimo: 10 },
        { sku: 'GRAL-008', nombre: 'Broca para Concreto 3/8" SDS',                categoria: 'Ferreteria General',         unidad_medida: 'unidad',  precio_compra: 4.00,   precio_venta: 7.50,   stock_actual: 32, stock_minimo: 8  },
        { sku: 'GRAL-009', nombre: 'Broca Metal HSS 6mm BOSCH',                  categoria: 'Ferreteria General',         unidad_medida: 'unidad',  precio_compra: 3.50,   precio_venta: 6.50,   stock_actual: 28, stock_minimo: 8  },
        { sku: 'GRAL-010', nombre: 'Silicona Transparente SIKA (300ml)',          categoria: 'Ferreteria General',         unidad_medida: 'unidad',  precio_compra: 8.00,   precio_venta: 15.00,  stock_actual: 4,  stock_minimo: 6  },
        { sku: 'GRAL-011', nombre: 'Espuma Expansiva SIKA 300ml',                 categoria: 'Ferreteria General',         unidad_medida: 'unidad',  precio_compra: 20.00,  precio_venta: 34.00,  stock_actual: 14, stock_minimo: 4  },
        { sku: 'GRAL-012', nombre: 'Cadena Galvanizada 6mm (metro)',              categoria: 'Ferreteria General',         unidad_medida: 'metro',   precio_compra: 4.00,   precio_venta: 7.00,   stock_actual: 50, stock_minimo: 10 },
        { sku: 'SEGR-001', nombre: 'Guantes de Cuero Reforzados par',             categoria: 'Seguridad',                  unidad_medida: 'par',     precio_compra: 12.00,  precio_venta: 22.00,  stock_actual: 18, stock_minimo: 4  },
        { sku: 'SEGR-002', nombre: 'Lentes de Seguridad Transparentes 3M',       categoria: 'Seguridad',                  unidad_medida: 'unidad',  precio_compra: 5.00,   precio_venta: 10.00,  stock_actual: 28, stock_minimo: 6  },
        { sku: 'SEGR-003', nombre: 'Casco de Seguridad Blanco MSA',              categoria: 'Seguridad',                  unidad_medida: 'unidad',  precio_compra: 15.00,  precio_venta: 28.00,  stock_actual: 12, stock_minimo: 3  },
        { sku: 'SEGR-004', nombre: 'Mascarilla con Filtro P100 3M',              categoria: 'Seguridad',                  unidad_medida: 'unidad',  precio_compra: 25.00,  precio_venta: 42.00,  stock_actual: 8,  stock_minimo: 2  },
        { sku: 'SEGR-005', nombre: 'Chaleco Reflectivo Naranja Talla L',         categoria: 'Seguridad',                  unidad_medida: 'unidad',  precio_compra: 15.00,  precio_venta: 26.00,  stock_actual: 12, stock_minimo: 3  },
        { sku: 'SEGR-006', nombre: 'Botas PVC Jebe Punta Acero Talla 42',        categoria: 'Seguridad',                  unidad_medida: 'par',     precio_compra: 38.00,  precio_venta: 62.00,  stock_actual: 8,  stock_minimo: 2  },
        { sku: 'JARD-001', nombre: 'Manguera de Riego PVC 1/2" x 25m',           categoria: 'Jardineria',                 unidad_medida: 'unidad',  precio_compra: 35.00,  precio_venta: 58.00,  stock_actual: 7,  stock_minimo: 2  },
        { sku: 'JARD-002', nombre: 'Pala Punta Cuadrada mango madera',           categoria: 'Jardineria',                 unidad_medida: 'unidad',  precio_compra: 20.00,  precio_venta: 35.00,  stock_actual: 9,  stock_minimo: 2  },
        { sku: 'JARD-003', nombre: 'Rastrillo de Jardin 14 dientes acero',       categoria: 'Jardineria',                 unidad_medida: 'unidad',  precio_compra: 15.00,  precio_venta: 28.00,  stock_actual: 1,  stock_minimo: 3  },
        { sku: 'JARD-004', nombre: 'Conectores Manguera 1/2" Kit x4',            categoria: 'Jardineria',                 unidad_medida: 'kit',     precio_compra: 5.00,   precio_venta: 10.00,  stock_actual: 20, stock_minimo: 5  },
    ];

    const productos = productosRaw.map(p => ({
        id_producto:         randomUUID(),
        ...p,
        ...splitStockAlmacenes(p.stock_actual),
        codigo_barras:       '',
        descripcion:         '',
        imagen_url:          '',
        estado:              1,
        fecha_creacion:      hace(Math.floor(Math.random() * 90) + 30),
        fecha_actualizacion: now,
    }));

    // ── CLIENTES ──────────────────────────────────────────────────────────────
    const clientes = [
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Juan Carlos Perez Lopez',          tipo_documento: 'DNI', numero_documento: '45678912',   direccion: 'Av. Los Olivos 245, Yungay',     telefono: '943567812', email: 'jcperez@gmail.com',          estado: 1, fecha_registro: hace(120) },
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Maria Elena Rodriguez Soto',       tipo_documento: 'DNI', numero_documento: '71234567',   direccion: 'Jr. Comercio 112, Yungay',       telefono: '976543210', email: 'mrodriguez@hotmail.com',     estado: 1, fecha_registro: hace(110) },
        { id_cliente: randomUUID(), tipo_cliente: 'EMPRESA',         nombre_razon_social: 'Constructora Andes S.A.C.',        tipo_documento: 'RUC', numero_documento: '20456789012', direccion: 'Av. Centenario 1500, Huaraz',    telefono: '043-421234', email: 'ventas@constructoraandes.pe', estado: 1, fecha_registro: hace(100) },
        { id_cliente: randomUUID(), tipo_cliente: 'EMPRESA',         nombre_razon_social: 'Inmobiliaria Cordillera E.I.R.L.', tipo_documento: 'RUC', numero_documento: '20567891234', direccion: 'Jr. Bolivar 890, Huaraz',        telefono: '043-425678', email: 'info@cordillera.pe',         estado: 1, fecha_registro: hace(95)  },
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Roberto Sanchez Mendoza',          tipo_documento: 'DNI', numero_documento: '43210987',   direccion: 'Psje. Las Flores 56, Yungay',    telefono: '952345678', email: '',                           estado: 1, fecha_registro: hace(88)  },
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Carmen Rosa Alva Torres',          tipo_documento: 'DNI', numero_documento: '44123456',   direccion: 'Jr. 28 de Julio 140, Yungay',    telefono: '957112233', email: '',                           estado: 1, fecha_registro: hace(80)  },
        { id_cliente: randomUUID(), tipo_cliente: 'EMPRESA',         nombre_razon_social: 'Multiservicios Ancash S.R.L.',     tipo_documento: 'RUC', numero_documento: '20345678901', direccion: 'Av. Luzuriaga 300, Huaraz',      telefono: '943001122', email: 'multiserv@gmail.com',        estado: 1, fecha_registro: hace(70)  },
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Hipolito Quispe Leon',             tipo_documento: 'DNI', numero_documento: '31789012',   direccion: 'Barrio Chinchay, Yungay',        telefono: '953114455', email: '',                           estado: 1, fecha_registro: hace(60)  },
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Lucia Morales Palacios',           tipo_documento: 'DNI', numero_documento: '70123890',   direccion: 'Jr. Libertad 78, Mancos',        telefono: '945009988', email: '',                           estado: 1, fecha_registro: hace(50)  },
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Pedro Huanca Flores',              tipo_documento: 'DNI', numero_documento: '42345671',   direccion: 'Calle Real 33, Yungay',          telefono: '962334455', email: '',                           estado: 1, fecha_registro: hace(45)  },
        { id_cliente: randomUUID(), tipo_cliente: 'EMPRESA',         nombre_razon_social: 'Ferreteria El Maestro E.I.R.L.',   tipo_documento: 'RUC', numero_documento: '20112345678', direccion: 'Av. Fitzcarrald 450, Huaraz',    telefono: '043-429900', email: 'ferreteria.maestro@pe',      estado: 1, fecha_registro: hace(40)  },
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Ana Lucia Torres Vidal',           tipo_documento: 'DNI', numero_documento: '47890123',   direccion: 'Jr. Progreso 22, Caraz',         telefono: '958223344', email: 'anatorres@gmail.com',        estado: 1, fecha_registro: hace(35)  },
        { id_cliente: randomUUID(), tipo_cliente: 'EMPRESA',         nombre_razon_social: 'Constructores Unidos S.A.C.',      tipo_documento: 'RUC', numero_documento: '20987654321', direccion: 'Av. Universitaria 1200, Huaraz', telefono: '043-431122', email: 'cunidos@gmail.com',          estado: 1, fecha_registro: hace(30)  },
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Jorge Luis Meza Vargas',           tipo_documento: 'DNI', numero_documento: '40123456',   direccion: 'Calle Lima 89, Yungay',          telefono: '941556677', email: '',                           estado: 1, fecha_registro: hace(25)  },
        { id_cliente: randomUUID(), tipo_cliente: 'PERSONA_NATURAL', nombre_razon_social: 'Rosa Elvira Castillo Ruiz',        tipo_documento: 'DNI', numero_documento: '48901234',   direccion: 'Jr. Huaraz 156, Yungay',         telefono: '967889900', email: '',                           estado: 1, fecha_registro: hace(20)  },
    ];

    // ── VENTAS ────────────────────────────────────────────────────────────────
    const ventas         = [];
    const detalleVentas  = [];
    const movimientos    = [];
    let   boletaCounter  = 1;
    let   facturaCounter = 1;
    let   ventaCounter   = 1;

    const sampleVentas = [
        { dias: 1,  cliIdx: 0,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:0,q:2},{p:8,q:1}]           },
        { dias: 1,  cliIdx: 1,  tipo: 'BOLETA',  pago: 'YAPE',          items: [{p:30,q:3},{p:33,q:5}]         },
        { dias: 2,  cliIdx: 2,  tipo: 'FACTURA', pago: 'CREDITO',       items: [{p:15,q:10},{p:16,q:5},{p:21,q:20}] },
        { dias: 2,  cliIdx: 3,  tipo: 'FACTURA', pago: 'TRANSFERENCIA', items: [{p:29,q:6},{p:34,q:4}]         },
        { dias: 3,  cliIdx: 4,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:1,q:3},{p:2,q:2},{p:9,q:1}] },
        { dias: 3,  cliIdx: 5,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:58,q:4},{p:57,q:2}]         },
        { dias: 4,  cliIdx: 6,  tipo: 'FACTURA', pago: 'TARJETA',       items: [{p:6,q:1},{p:7,q:1}]           },
        { dias: 5,  cliIdx: 7,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:40,q:2},{p:41,q:5}]         },
        { dias: 5,  cliIdx: 9,  tipo: 'BOLETA',  pago: 'YAPE',          items: [{p:42,q:5},{p:43,q:3}]         },
        { dias: 6,  cliIdx: 0,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:3,q:1},{p:5,q:2}]           },
        { dias: 7,  cliIdx: 10, tipo: 'FACTURA', pago: 'TRANSFERENCIA', items: [{p:15,q:20},{p:22,q:30}]       },
        { dias: 8,  cliIdx: 3,  tipo: 'FACTURA', pago: 'CREDITO',       items: [{p:6,q:1},{p:38,q:2}]         },
        { dias: 9,  cliIdx: 8,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:59,q:2},{p:60,q:1}]         },
        { dias: 10, cliIdx: 13, tipo: 'BOLETA',  pago: 'PLIN',          items: [{p:63,q:3},{p:64,q:5}]         },
        { dias: 10, cliIdx: 12, tipo: 'FACTURA', pago: 'CREDITO',       items: [{p:15,q:30},{p:16,q:10}]       },
        { dias: 12, cliIdx: 4,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:44,q:10},{p:45,q:8}]        },
        { dias: 14, cliIdx: 1,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:0,q:1},{p:9,q:1},{p:8,q:1}] },
        { dias: 15, cliIdx: 11, tipo: 'BOLETA',  pago: 'YAPE',          items: [{p:30,q:1},{p:36,q:4}]         },
        { dias: 18, cliIdx: 5,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:62,q:2},{p:61,q:3}]         },
        { dias: 20, cliIdx: 6,  tipo: 'FACTURA', pago: 'CREDITO',       items: [{p:69,q:5},{p:70,q:3}]         },
        { dias: 22, cliIdx: 2,  tipo: 'FACTURA', pago: 'TRANSFERENCIA', items: [{p:15,q:15},{p:17,q:10}]       },
        { dias: 25, cliIdx: 14, tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:56,q:1},{p:55,q:2}]         },
        { dias: 28, cliIdx: 7,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:47,q:20},{p:48,q:15}]       },
        { dias: 30, cliIdx: 0,  tipo: 'BOLETA',  pago: 'EFECTIVO',      items: [{p:10,q:2},{p:1,q:1}]          },
        { dias: 35, cliIdx: 12, tipo: 'FACTURA', pago: 'TRANSFERENCIA', items: [{p:29,q:3},{p:28,q:2}]         },
    ];

    sampleVentas.forEach((sale) => {
        const fechaVenta = new Date();
        fechaVenta.setDate(fechaVenta.getDate() - sale.dias);
        fechaVenta.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);

        const idVenta = randomUUID();
        const mesAnio = `${fechaVenta.getFullYear()}${String(fechaVenta.getMonth()+1).padStart(2,'0')}`;
        let numComprobante;
        if (sale.tipo === 'BOLETA') {
            numComprobante = `${serieBoleta}-${String(boletaCounter++).padStart(6,'0')}`;
        } else {
            numComprobante = `${serieFactura}-${String(facturaCounter++).padStart(6,'0')}`;
        }
        const numeroVenta = `V-${mesAnio}-${String(ventaCounter++).padStart(4,'0')}`;

        let subtotal = 0;
        const detalles = [];

        sale.items.forEach((item) => {
            const prod = productos[item.p];
            if (!prod) return;
            const subtotalLinea = Math.round(prod.precio_venta * item.q * 100) / 100;
            subtotal += subtotalLinea;
            detalles.push({
                id_detalle:      randomUUID(),
                id_venta:        idVenta,
                id_producto:     prod.id_producto,
                nombre_producto: prod.nombre,
                cantidad:        item.q,
                precio_unitario: prod.precio_venta,
                descuento_linea: 0,
                subtotal_linea:  subtotalLinea,
                costo_unitario:  prod.precio_compra,
            });
            movimientos.push({
                id_movimiento:   randomUUID(),
                fecha_hora:      fechaVenta.toISOString(),
                id_producto:     prod.id_producto,
                nombre_producto: prod.nombre,
                tipo_movimiento: 'SALIDA',
                cantidad:        item.q,
                stock_anterior:  prod.stock_actual + item.q,
                stock_nuevo:     prod.stock_actual,
                referencia:      numeroVenta,
                motivo:          '',
                usuario:         'admin',
            });
        });

        const subtotalSinIgv = Math.round(subtotal / 1.18 * 100) / 100;
        const igv             = Math.round((subtotal - subtotalSinIgv) * 100) / 100;

        ventas.push({
            id_venta:           idVenta,
            numero_venta:       numeroVenta,
            fecha_hora:         fechaVenta.toISOString(),
            id_cliente:         clientes[sale.cliIdx]?.id_cliente || null,
            tipo_comprobante:   sale.tipo,
            numero_comprobante: numComprobante,
            subtotal:           subtotalSinIgv,
            igv,
            descuento:          0,
            total:              subtotal,
            forma_pago:         sale.pago,
            estado:             'ACTIVA',
            usuario:            'admin',
            notas:              '',
            id_sesion_caja:     null,
        });

        detalleVentas.push(...detalles);
    });

    // ── COMPRAS ───────────────────────────────────────────────────────────────
    const compras        = [];
    const detalleCompras = [];
    let   compraCounter  = 1;

    const sampleCompras = [
        { dias: 3,  proveedor: 'Distribuidora Aceros del Norte S.A.C.', ruc: '20345678901', items: [{p:16,q:100},{p:17,q:50},{p:18,q:60},{p:22,q:80}]          },
        { dias: 8,  proveedor: 'Comercial Electrica Lima E.I.R.L.',     ruc: '20567890123', items: [{p:29,q:10},{p:30,q:8},{p:31,q:200},{p:34,q:100},{p:35,q:100}] },
        { dias: 15, proveedor: 'Pinturas Nacional S.A.',                ruc: '20123456789', items: [{p:56,q:20},{p:57,q:12},{p:58,q:10},{p:59,q:15},{p:63,q:40}]  },
        { dias: 22, proveedor: 'Ferromax Peru S.A.C.',                  ruc: '20234567890', items: [{p:15,q:150},{p:19,q:60},{p:20,q:40},{p:21,q:50}]            },
        { dias: 32, proveedor: 'Tubosistemas Andinos E.I.R.L.',         ruc: '20678901234', items: [{p:41,q:50},{p:42,q:40},{p:43,q:300},{p:44,q:200},{p:46,q:200}] },
        { dias: 45, proveedor: 'Distribuidora Aceros del Norte S.A.C.', ruc: '20345678901', items: [{p:68,q:80},{p:69,q:60},{p:70,q:100}]                        },
        { dias: 55, proveedor: 'Proveedora Seguridad Industrial S.A.C.',ruc: '20789012345', items: [{p:80,q:30},{p:81,q:40},{p:82,q:20}]                         },
        { dias: 68, proveedor: 'Cementos Pacasmayo S.A.A.',             ruc: '20100140799', items: [{p:15,q:200},{p:24,q:60}]                                    },
    ];

    sampleCompras.forEach((compra) => {
        const fechaCompra = new Date();
        fechaCompra.setDate(fechaCompra.getDate() - compra.dias);
        fechaCompra.setHours(8 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);

        const idCompra = randomUUID();
        const mesAnio  = `${fechaCompra.getFullYear()}${String(fechaCompra.getMonth()+1).padStart(2,'0')}`;
        const numOC    = `OC-${mesAnio}-${String(compraCounter++).padStart(3,'0')}`;
        let subtotalCompra = 0;

        compra.items.forEach(({p: prodIdx, q: cant}) => {
            const prod = productos[prodIdx];
            if (!prod) return;
            const subtotalLinea = prod.precio_compra * cant;
            subtotalCompra += subtotalLinea;
            detalleCompras.push({
                id_detalle:      randomUUID(),
                id_compra:       idCompra,
                id_producto:     prod.id_producto,
                nombre_producto: prod.nombre,
                cantidad:        cant,
                precio_unitario: prod.precio_compra,
                subtotal_linea:  subtotalLinea,
            });
            movimientos.push({
                id_movimiento:   randomUUID(),
                fecha_hora:      fechaCompra.toISOString(),
                id_producto:     prod.id_producto,
                nombre_producto: prod.nombre,
                tipo_movimiento: 'ENTRADA',
                cantidad:        cant,
                stock_anterior:  Math.max(0, prod.stock_actual - cant),
                stock_nuevo:     prod.stock_actual,
                referencia:      numOC,
                motivo:          '',
                usuario:         'admin',
            });
        });

        const igv = Math.round(subtotalCompra * 0.18 * 100) / 100;
        compras.push({
            id_compra:     idCompra,
            numero_oc:     numOC,
            fecha_hora:    fechaCompra.toISOString(),
            proveedor:     compra.proveedor,
            ruc_proveedor: compra.ruc,
            doc_proveedor: '',
            subtotal:      subtotalCompra,
            igv,
            total:         subtotalCompra + igv,
            estado:        'ACTIVA',
            usuario:       'admin',
            notas:         '',
        });
    });

    // ── CRÉDITOS Y ABONOS ─────────────────────────────────────────────────────
    const creditos = [];
    const abonos   = [];

    const creditosData = [
        { cliIdx: 2,  ventaIdx: 2,  monto: 1092.00, diasCreacion: 15, diasVence: 30,  estado: 'PENDIENTE', abonos: [{ monto: 500.00, dias: 10, medio: 'TRANSFERENCIA' }] },
        { cliIdx: 3,  ventaIdx: 11, monto: 874.50,  diasCreacion: 12, diasVence: -5,  estado: 'PENDIENTE', abonos: [{ monto: 300.00, dias: 12, medio: 'EFECTIVO'      }] },
        { cliIdx: 9,  ventaIdx: 8,  monto: 426.00,  diasCreacion: 8,  diasVence: 15,  estado: 'PENDIENTE', abonos: [] },
        { cliIdx: 6,  ventaIdx: 19, monto: 315.00,  diasCreacion: 25, diasVence: -20, estado: 'VENCIDO',   abonos: [{ monto: 100.00, dias: 20, medio: 'EFECTIVO' }, { monto: 100.00, dias: 10, medio: 'YAPE' }] },
        { cliIdx: 12, ventaIdx: 14, monto: 1258.00, diasCreacion: 5,  diasVence: 45,  estado: 'PENDIENTE', abonos: [{ monto: 630.00, dias: 3,  medio: 'TRANSFERENCIA' }] },
    ];

    creditosData.forEach((cd) => {
        const ventaRef   = ventas[cd.ventaIdx];
        const idCredito  = randomUUID();
        const fechaVence = new Date();
        fechaVence.setDate(fechaVence.getDate() + cd.diasVence);

        creditos.push({
            id_credito:        idCredito,
            id_cliente:        clientes[cd.cliIdx].id_cliente,
            id_venta:          ventaRef ? ventaRef.id_venta : null,
            monto_total:       cd.monto,
            estado:            cd.estado,
            fecha_vencimiento: fechaVence.toISOString().slice(0, 10),
            notas:             '',
            fecha_creacion:    hace(cd.diasCreacion),
        });

        cd.abonos.forEach((ab) => {
            abonos.push({
                id_abono:       randomUUID(),
                id_credito:     idCredito,
                monto_abonado:  ab.monto,
                fecha_abono:    hace(ab.dias),
                medio_pago:     ab.medio,
                notas:          '',
                fecha_creacion: hace(ab.dias),
            });
        });
    });

    return { productos, clientes, ventas, detalle_ventas: detalleVentas,
             compras, detalle_compras: detalleCompras, movimientos, creditos, abonos,
             config: { boleta_counter: boletaCounter, factura_counter: facturaCounter } };
}

module.exports = { generateSeedData };
