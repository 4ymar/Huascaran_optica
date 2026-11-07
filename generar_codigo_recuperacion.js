// Ubicación: raíz del proyecto (D:\empren\MultiDispo_SisGestion\generar_codigo_recuperacion.js)
// NUNCA mover esto dentro de server/, client/ o electron/ — se empaquetaría en el instalador.
// Uso: node generar_codigo_recuperacion.js

const crypto = require('crypto');
const readline = require('readline');

const PRIVATE_KEY_RECUPERACION = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDq96hv8WSqDjoA
wcTjpN1TM9MJGkiD67gjErXOTCh/6rlwdho7iP/jTcTNdbHvUuYyCBaexl2xCot1
e61266H9ARato9PTZnlOdTHRfvpsCNlzAg0Gle1VVT9+NblzK0FvcCli2qNyc9CK
9i4tF2mC/uKRh/6le0F31ITy6esn19Ggzh5lyFjP92WD9Ruw0PU912Bsjbn0KqtT
/JR3tc9uNrWf/f06MDGMhnzvXOphRmnGJ2CvgDeY1mR56oYKIIPlaUNAKtyUjfW9
C7hu4ziYVRxyNabg2Xdvi6IaHMxcMHJUebA9Seg9xCP2ojrDN6wtFJ9KT/j8Eki4
YKz8QApPAgMBAAECggEAI4tXZafErJz+VUL6v90exgle8U+SjLJJ5rRb4FtQ/RjK
+KJFEaCF5SLMlLArPKLzw7nJgjdL0Q5hTmJpOUYn+RgDED1qO96SlzXPVXu58kHc
czNqOQbRIkmFE1iZNzzh5zO2bwfYFeZDM+JN1fBmu7RHHfDOqsXcf34cpoqQUjRf
gWOKxSM2psqgdmyT/X4iYzfmQ/7H2KFzhGZ0xrc1L5XoqYyd/A12cw1X1aWl6DtS
S9Eg+w4CUK1Kx5azU0R+2O2Z5N7xxf0kqx/h+G9oQ16VwfrsXv/cyyfbrmn8Y6ET
wyG6qjzUUM4DtGqdEtd7f3UKSstU9/Vqh+XYhb4/AQKBgQD5LgfygV9CnPHl37+9
l6nZUs3RbdSbMd2EdFvVbkTXOg1/73HoSDlNUrBXYgw2VNdkNznbe7uHB3ZHjKhA
D1KsbOcP0+iLFP7fBorPqlwDmuXcV43o+SkhN4xpD2CDqkiSDQyfSUNkM6i4Oqjx
/uDNW0X0p7EUTGAN/fmX77iNjwKBgQDxZgrn2/4wVMOEQyRq53fHwT/0A3+/YzDm
EGFzqGcBOJL4dCRkdbkPfYweJC5fGNkjBIlPYmCeoTBN90qQgMYKWuepDlkuGRLD
qYbR7soEN8VCq/baAF5iBNo5WEMN7xDy6soiW7A0QjxbTOEGUKRhJSWkSYtTiG/N
akr6Ge/XQQKBgBBr3yw1KHD8ZNiwYTN+bjwbP+MgaNV9eMrE3FR5euHwOnmG7yvO
rrAQ1fw8Qu/FsZgyJ4b2ZYpljH70nxXxrJIeby/U2EtqK83I4ZcD9CJsr99QidKj
sPk2bvNxhvvGWhf98ioBKwbMfL7/ZqjkEi6WaErSTlI3IlFpvmwr6S6zAoGBALKR
OFoBG0vnN+X7wNGvvaQvKL65Y+NQXZih32St2txFXDqbt1v01VtHFMIrI35HJEBK
F8R4Ul6lf9T8q9Su3VBFpH4i1gdKlt3T5p4elKOAGdRS3ryubyL00fR/fMKu6Iu4
8KNvza0qnfkvqnmAZ8hQsUKRAJZfI80A5suRKiDBAoGAL/NQ/qnjNIBNXjW2tX39
0Uuo84digrrwt8m9pEUqGIFwlClGZ22JqsTOl52iigdkCuUfRBNXJKUwws8sTvIp
C9/Mq4hGQWZ9/Xy6puwINcS+Veh9x9vKG2XFkGjOKAt1Tz7Uy/B2anGcKbjAWAhC
cCruacQ7CFAT8nQkS5xVAQo=
-----END PRIVATE KEY-----`;

const MINUTOS_VALIDEZ = 15;

function generarCodigo(machineId) {
    const payloadObj = {
        machineId: machineId.trim().toUpperCase(),
        exp: Date.now() + MINUTOS_VALIDEZ * 60 * 1000,
    };
    const payload = JSON.stringify(payloadObj);

    const sign = crypto.createSign('SHA256');
    sign.update(payload);
    sign.end();
    const firma = sign.sign(PRIVATE_KEY_RECUPERACION, 'base64');

    const codigo = Buffer.from(JSON.stringify({ payload, firma })).toString('base64');
    return { codigo, expiraEn: new Date(payloadObj.exp).toLocaleString('es-PE') };
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('machineId que te dictó/mandó el cliente: ', (machineId) => {
    if (!machineId || machineId.trim().length < 4) {
        console.log('machineId inválido.');
        rl.close();
        return;
    }
    const { codigo, expiraEn } = generarCodigo(machineId);
    console.log('\n=== CÓDIGO DE RECUPERACIÓN (copia y envíalo por WhatsApp) ===');
    console.log(codigo);
    console.log(`\nVálido hasta: ${expiraEn} (${MINUTOS_VALIDEZ} minutos desde ahora)\n`);
    rl.close();
});