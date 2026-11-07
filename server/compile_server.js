const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

const filesToCompile = [
    'licencia.js'
];

filesToCompile.forEach(file => {
    const fullPath = path.join(__dirname, file);
    const outPath = fullPath.replace('.js', '.jsc');
    bytenode.compileFile({
        filename: fullPath,
        output: outPath
    });
    console.log(`Compilado: ${file} -> ${path.basename(outPath)}`);
});
