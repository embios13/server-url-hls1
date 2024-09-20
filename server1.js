const express = require('express');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const port = 5000;

app.use(cors());

// Directorios de videos y HLS
const videoDir = path.join(__dirname, 'videos');
const hlsDir = path.join(__dirname, 'hls');

// Crea la carpeta HLS si no existe
if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
}

// Función para generar HLS para un archivo de video
const generateHLS = (filename, callback) => {
    const inputFilePath = path.join(videoDir, filename);
    const outputDir = path.join(hlsDir, filename.replace(/\.[^/.]+$/, ""));

    if (!fs.existsSync(inputFilePath)) {
        return callback(`Archivo de video no encontrado: ${filename}`);
    }

    // Crear la carpeta de salida si no existe
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Comando FFmpeg para convertir a HLS
    const command = `ffmpeg -i "${inputFilePath}" -c copy -map 0 -f segment -segment_list "${outputDir}/index.m3u8" -segment_time 10 -segment_format mpegts "${outputDir}/chunk%03d.ts"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error generando HLS para ${filename}: ${error.message}`);
            return callback(`Error al generar HLS para ${filename}`);
        }
        console.log(`HLS generado para: ${filename}`);
        callback(null, `http://localhost:${port}/hls/${filename.replace(/\.[^/.]+$/, "")}/index.m3u8`);
    });
};

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

// Endpoint para generar HLS para todos los videos en el directorio
app.get('/generateHLSAll', (req, res) => {
    fs.readdir(videoDir, (err, files) => {
        if (err) {
            return res.status(500).send('Error al leer los archivos de video.');
        }

        const videoFiles = files.filter(file => /\.(mp4|mkv|avi)$/.test(file));
        const urls = [];

        let processed = 0;

        if (videoFiles.length === 0) {
            return res.status(404).send('No se encontraron archivos de video.');
        }

        // Generar HLS para cada archivo
        videoFiles.forEach((filename) => {
            generateHLS(filename, (err, url) => {
                processed++;
                if (err) {
                    console.error(err);
                } else {
                    urls.push({ filename, url });
                }

                // Cuando todos los archivos estén procesados, devolver las URLs
                if (processed === videoFiles.length) {
                    res.json(urls);
                }
            });
        });
    });
});

// Servir los archivos HLS generados
app.use('/hls', express.static(hlsDir));

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor HLS escuchando en http://localhost:${port}`);
});
