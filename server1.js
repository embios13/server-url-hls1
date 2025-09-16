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

// Directorios
const videosDir = path.join(__dirname, 'videos');
const hlsDir = path.join(__dirname, 'hls');


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
app.use(express.json());

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

app.get('/generateHLS-explorer', (req, res) => {
    res.sendFile(path.join(__dirname, 'generateHLS.html'));
});

app.get('/test', (req, res) => {
    res.send('El servidor está funcionando correctamente.');
});

// Servidores HTTP y HTTPS
http.createServer(app).listen(httpPort, () => {
    console.log(`Servidor HTTP escuchando en http://10.0.0.200:${httpPort}`);
});

https.createServer(credentials, app).listen(httpsPort, () => {
    console.log(`Servidor HTTPS escuchando en https://10.0.0.200:${httpsPort}`);
});
