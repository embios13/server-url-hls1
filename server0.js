const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const redis = require('redis');
const { exec } = require('child_process');

const app = express();
const httpPort = 5001;
const httpsPort = 5002;

// Certificados SSL
const privateKey = fs.readFileSync('/etc/letsencrypt/live/pixelflux.ddns.net/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/pixelflux.ddns.net/fullchain.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Configuración de Redis
const redisClient = redis.createClient();
redisClient.on('error', (err) => {
    console.error('Error de Redis:', err);
});

// Habilitar CORS
app.use(cors({ origin: 'https://pixelflux.ddns.net' }));

// Directorios
const videosDir = path.join(__dirname, 'videos');
const hlsDir = path.join(__dirname, 'hls');

// Crear carpetas si no existen
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });

// Función para generar HLS para un archivo de video
const generateHLS = (filename, callback) => {
    const inputFilePath = path.join(videosDir, filename);
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
        callback(null, `http://localhost:${httpPort}/hls/${filename.replace(/\.[^/.]+$/, "")}/index.m3u8`);
    });
};

// Función para convertir un archivo de video a HLS con selección de audio
function convertToHLS(videoPath, outputDir, callback, subtitlePath = null, audioLanguage = null) {
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const outputFolder = path.join(outputDir, videoName);

    if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });

    let command = `ffmpeg -i "${videoPath}"`;

    // Selección de pista de audio si se especifica
    if (audioLanguage) {
        command += ` -map 0:v -map 0:a:m:language:${audioLanguage}`;
    }

    // Añadir subtítulos si se proporciona un archivo
    if (subtitlePath && fs.existsSync(subtitlePath)) {
        command += ` -vf subtitles="${subtitlePath}"`;
    }

    command += ` -codec: copy -start_number 0 -hls_time 10 -hls_list_size 0 -f hls "${outputFolder}/index.m3u8"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al convertir ${videoPath}:`, error);
            return callback(error);
        }
        console.log(`Conversión completa: ${videoPath}`);
        callback(null);
    });
}

// Endpoint para procesar videos con subtítulos y selección de audio
app.post('/process-video', (req, res) => {
    const videoPath = req.body.videoPath; // Ruta del video
    const subtitlePath = req.body.subtitlePath || null; // Ruta del subtítulo (opcional)
    const audioLanguage = req.body.audioLanguage || null; // Idioma de audio (opcional: "spa" para español, "eng" para inglés)

    if (!videoPath || !fs.existsSync(videoPath)) {
        return res.status(400).json({ error: 'Ruta de video inválida o no encontrada.' });
    }

    if (subtitlePath && !fs.existsSync(subtitlePath)) {
        return res.status(400).json({ error: 'Ruta de subtítulos inválida o no encontrada.' });
    }

    const outputFolder = path.join(hlsDir, path.basename(videoPath, path.extname(videoPath)));

    if (fs.existsSync(outputFolder)) {
        return res.status(200).json({ message: 'El archivo HLS ya existe.', url: `/hls/${path.basename(videoPath, path.extname(videoPath))}/index.m3u8` });
    }

    convertToHLS(videoPath, hlsDir, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al procesar el video.', details: err.message });
        }
        res.json({ message: 'Conversión completada.', url: `/hls/${path.basename(videoPath, path.extname(videoPath))}/index.m3u8` });
    }, subtitlePath, audioLanguage);
});

// Endpoint para obtener la lista de archivos HLS
app.get('/hls-files', async (req, res) => {
    try {
        const folders = fs.readdirSync(hlsDir).filter(folder =>
            fs.lstatSync(path.join(hlsDir, folder)).isDirectory()
        );

        const hlsFiles = folders.map(folder => {
            const indexPath = path.join(hlsDir, folder, 'index.m3u8');
            if (fs.existsSync(indexPath)) {
                return {
                    name: folder,
                    url: `/hls/${folder}/index.m3u8`,
                };
            }
        }).filter(Boolean);

        if (hlsFiles.length === 0) {
            return res.status(404).send('No se encontraron archivos HLS.');
        }

        res.json(hlsFiles);
    } catch (err) {
        console.error('Error al listar archivos HLS:', err);
        res.status(500).send('Error interno del servidor.');
    }
});

// Servir archivos HLS
app.use('/hls', express.static(hlsDir));

// Página para probar HLS
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'player.html'));
});

// Servidores HTTP y HTTPS
http.createServer(app).listen(httpPort, () => {
    console.log(`Servidor HTTP escuchando en http://10.0.0.200:${httpPort}`);
});

https.createServer(credentials, app).listen(httpsPort, () => {
    console.log(`Servidor HTTPS escuchando en https://10.0.0.200:${httpsPort}`);
});
