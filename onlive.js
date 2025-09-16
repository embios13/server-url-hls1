const express = require('express');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware para procesar JSON
app.use(bodyParser.json());

// Ruta base para los videos
const videosPath = path.join(__dirname, 'videos');

// Ruta base para los videos transmitidos
const outputPath = path.join(__dirname, 'output');

// Crear la carpeta "output" si no existe
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
}

// Ruta para iniciar la transmisión
app.post('/start-stream', (req, res) => {
  const { fileName, youtubeKey, tiktokKey, outputFile } = req.body;

  // Validación de parámetros
  if (!fileName || !youtubeKey || !tiktokKey) {
    return res.status(400).json({
      error: 'Faltan parámetros requeridos: fileName, youtubeKey, tiktokKey',
    });
  }

  // Verificar que el archivo exista en la carpeta "videos"
  const inputFile = path.join(videosPath, fileName);
  if (!fs.existsSync(inputFile)) {
    return res.status(404).json({
      error: `El archivo ${fileName} no se encuentra en la carpeta 'videos'`,
    });
  }

  // Ruta de salida para guardar el archivo de video transmitido
  const savePath =
    outputFile || path.join(outputPath, `${path.parse(fileName).name}_streamed.mp4`);

  // Crear el comando de FFmpeg
  const ffmpegCommand = `
    ffmpeg -re -i "${inputFile}" \
    -c:v libx264 -preset veryfast -maxrate 3000k -bufsize 6000k -pix_fmt yuv420p -g 50 -c:a aac -b:a 128k -ar 44100 \
    -f flv rtmp://a.rtmp.youtube.com/live2/${youtubeKey} \
    -f flv rtmp://live.tiktok.com/${tiktokKey} \
    -c:v copy -c:a copy "${savePath}"
  `;

  


  console.log('Ejecutando comando FFmpeg:', ffmpegCommand);

  // Ejecutar el comando FFmpeg
  const ffmpegProcess = exec(ffmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al ejecutar FFmpeg: ${error.message}`);
      return res.status(500).json({
        error: 'Error al iniciar la transmisión',
        details: error.message,
      });
    }
    console.log('FFmpeg output:', stdout);
    console.error('FFmpeg error:', stderr);
  });

  // Responder al cliente que la transmisión ha comenzado
  res.status(200).json({
    message: 'Transmisión iniciada con éxito',
    inputFile,
    outputFile: savePath,
  });

  // Manejar la salida o cierre del proceso
  ffmpegProcess.on('close', (code) => {
    console.log(`Proceso de FFmpeg cerrado con código: ${code}`);
    if (code === 0) {
      console.log(`El archivo transmitido se guardó en: ${savePath}`);
    } else {
      console.error('Error en la transmisión. Código de salida:', code);
    }
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
