const Database = require('better-sqlite3');
const db = new Database('data/inventario.db');
const tables = db.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all();
console.log(tables.map(t => t.sql).join(';\n') + ';');
