const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Directorios
const videosDir = path.join(__dirname, 'videos');
const hlsDir = path.join(__dirname, 'hls');

// Crear carpetas si no existen
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });

// Endpoint para servir el archivo HTML
app.get('/generateHLS-explorer', (req, res) => {
    res.sendFile(path.join(__dirname, 'generateHLS.html'));
});

// Función para convertir video a HLS con opciones avanzadas
const generateHLS = (videoPath, options = {}, callback) => {
    const { subtitlePath = null } = options;
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const outputFolder = path.join(hlsDir, videoName);

    // Verificar si el archivo de video existe
    if (!fs.existsSync(videoPath)) {
        return callback(`Archivo de video no encontrado: ${videoPath}`);
    }

    // Si ya existe un HLS generado, retornamos la URL
    if (fs.existsSync(path.join(outputFolder, 'index.m3u8'))) {
        console.log(`HLS ya existe para: ${videoName}`);
        return callback(null, `/hls/${videoName}/index.m3u8`);
    }

    // Crear la carpeta de salida si no existe
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    // Generar el comando para ffmpeg
    let hlsCommand = `ffmpeg -i "${videoPath}" -map 0:v -map 0:a -codec copy -start_number 0 -hls_time 10 -hls_list_size 0 -f hls "${outputFolder}/index.m3u8"`;

    // Si se pasan subtítulos, agregar la opción a ffmpeg
    if (subtitlePath && fs.existsSync(subtitlePath)) {
        hlsCommand += ` -vf subtitles="${subtitlePath}"`;
    }

    // Ejecutar el comando ffmpeg
    exec(hlsCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error generando HLS para ${videoPath}:`, error);
            return callback(`Error al generar HLS para ${videoName}`);
        }

        console.log(`HLS generado para: ${videoName}`);
        callback(null, `/hls/${videoName}/index.m3u8`);
    });
};

// Función para procesar todos los archivos de video en la carpeta `videos`
const processAllVideos = () => {
    fs.readdir(videosDir, (err, files) => {
        if (err) {
            console.error('Error al leer la carpeta de videos:', err);
            return;
        }

        // Filtra solo los archivos de video (por ejemplo, .mp4, .mkv, etc.)
        const videoFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ext === '.mp4' || ext === '.mkv' || ext === '.avi'; // Agrega más extensiones si es necesario
        });

        if (videoFiles.length === 0) {
            console.log('No se encontraron archivos de video en la carpeta "videos".');
            return;
        }

        // Procesa cada archivo de video encontrado
        videoFiles.forEach((file) => {
            const videoPath = path.join(videosDir, file);
            const options = { subtitlePath: path.join(videosDir, 'subtitles.srt') }; // Opcionales: subtítulos

            generateHLS(videoPath, options, (err, hlsUrl) => {
                if (err) {
                    console.error('Error al generar HLS para el video', videoPath);
                } else {
                    console.log('HLS generado para el video:', hlsUrl);
                }
            });
        });
    });
};

// Llamada para procesar videos al iniciar el servidor
processAllVideos();

// Ejecutar servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
