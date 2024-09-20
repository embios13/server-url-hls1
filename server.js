const express = require('express');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const port = 5000;

// Middleware CORS para permitir peticiones desde cualquier origen
app.use(cors());

// Directorio donde estarán los videos y los archivos HLS
const videoDir = path.join(__dirname, 'videos');
const hlsDir = path.join(__dirname, 'hls');

// Crea el directorio HLS si no existe
if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
}

// Endpoint para listar los archivos de video disponibles
app.get('/videos', (req, res) => {
    fs.readdir(videoDir, (err, files) => {
        if (err) {
            return res.status(500).send('Error al leer los videos.');
        }
        const videos = files.filter(file => /\.(mp4|mkv|avi)$/.test(file));
        res.json(videos);
    });
});

// Endpoint para generar HLS desde un archivo de video
app.get('/generateHLS/:filename', (req, res) => {
    const filename = req.params.filename;
    const inputFilePath = path.join(videoDir, filename);
    const outputDir = path.join(hlsDir, filename.replace(/\.[^/.]+$/, ""));

    if (!fs.existsSync(inputFilePath)) {
        return res.status(404).send('Archivo de video no encontrado.');
    }

    // Crear la carpeta de salida si no existe
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Comando ffmpeg para convertir el video a HLS
    const command = `ffmpeg -i "${inputFilePath}" -c copy -map 0 -f segment -segment_list "${outputDir}/index.m3u8" -segment_time 10 -segment_format mpegts "${outputDir}/chunk%03d.ts"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error ejecutando ffmpeg: ${error.message}`);
            return res.status(500).send('Error al generar HLS.');
        }
        console.log(`HLS generado para: ${filename}`);
        res.send(`HLS generado: http://localhost:${port}/hls/${filename.replace(/\.[^/.]+$/, "")}/index.m3u8`);
    });
});

// Servir los archivos HLS generados
app.use('/hls', express.static(hlsDir));

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor HLS escuchando en http://localhost:${port}`);
});
