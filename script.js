// Estado da aplicação
let selectedFile = null;
let audioBuffer = null;

// Referências aos elementos do DOM
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileCard = document.getElementById('file-card');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const removeBtn = document.getElementById('remove-btn');
const formatSelect = document.getElementById('format-select');
const convertBtn = document.getElementById('convert-btn');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

// =========================================================
// 1. GESTÃO DE FICHEIROS E INTERFACE
// =========================================================
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
});

['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
});

dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

removeBtn.addEventListener('click', clearFile);

function handleFileSelect(file) {
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);

    dropZone.classList.add('hidden');
    fileCard.classList.remove('hidden');
    convertBtn.disabled = false;
}

function clearFile() {
    selectedFile = null;
    audioBuffer = null;
    fileInput.value = '';
    dropZone.classList.remove('hidden');
    fileCard.classList.add('hidden');
    convertBtn.disabled = true;
    progressContainer.classList.add('hidden');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateProgress(percent) {
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
}

// =========================================================
// 2. CONVERSÃO DE ÁUDIO VIA WEB AUDIO API (NATIVA E SEGURA)
// =========================================================
convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    const targetFormat = formatSelect.value;

    try {
        convertBtn.disabled = true;
        convertBtn.textContent = 'A descodificar áudio...';
        progressContainer.classList.remove('hidden');
        updateProgress(20);

        // Ler ficheiro e descodificar
        const arrayBuffer = await selectedFile.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        updateProgress(50);
        convertBtn.textContent = 'A converter áudio...';

        if (targetFormat === 'wav') {
            const wavBlob = bufferToWav(audioBuffer);
            updateProgress(100);
            downloadBlob(wavBlob, getOutputName('wav'));
            finishConversion();
        } else {
            // Conversão usando MediaRecorder
            const destination = audioCtx.createMediaStreamDestination();
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(destination);

            let mimeType = getSupportedMimeType(targetFormat);
            const mediaRecorder = new MediaRecorder(destination.stream, { mimeType });
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const finalBlob = new Blob(chunks, { type: mimeType });
                updateProgress(100);
                downloadBlob(finalBlob, getOutputName(targetFormat));
                audioCtx.close();
                finishConversion();
            };

            mediaRecorder.start();
            source.start(0);

            // Simular progresso durante a gravação
            let progress = 50;
            const interval = setInterval(() => {
                progress += 5;
                if (progress < 95) updateProgress(progress);
            }, 100);

            source.onended = () => {
                clearInterval(interval);
                mediaRecorder.stop();
            };
        }

    } catch (error) {
        console.error('Erro ao converter:', error);
        alert('Não foi possível converter este ficheiro de áudio. Certifique-se de que o formato original é válido.');
        finishConversion();
    }
});

function finishConversion() {
    convertBtn.textContent = 'Conversão Concluída!';
    setTimeout(() => {
        convertBtn.textContent = 'Converter e Descarregar';
        convertBtn.disabled = false;
    }, 2500);
}

function getOutputName(ext) {
    const originalName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'));
    return `${originalName}_convertido.${ext}`;
}

function getSupportedMimeType(format) {
    const types = {
        mp3: ['audio/mp3', 'audio/mpeg', 'audio/webm;codecs=opus'],
        ogg: ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus'],
        m4a: ['audio/mp4', 'audio/aac', 'audio/webm'],
        aac: ['audio/aac', 'audio/webm'],
        flac: ['audio/flac', 'audio/webm']
    };

    const targetTypes = types[format] || ['audio/webm'];
    for (const type of targetTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return '';
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Converte AudioBuffer para ficheiro WAV puro
function bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    let channels = [], sampleRate = buffer.sampleRate, offset = 0, pos = 0;

    function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while (offset < buffer.length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            out.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }
    return new Blob([out], { type: 'audio/wav' });
}
