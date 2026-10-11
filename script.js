let selectedFile = null;

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

// Eventos de Seleção
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
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
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
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

// Lógica Principal de Conversão
convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    const targetFormat = formatSelect.value;

    try {
        convertBtn.disabled = true;
        convertBtn.textContent = 'A processar ficheiro de áudio...';
        progressContainer.classList.remove('hidden');
        updateProgress(10);

        const arrayBuffer = await selectedFile.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Descodifica o áudio do ficheiro
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        updateProgress(40);

        if (targetFormat === 'wav') {
            convertBtn.textContent = 'A gerar WAV...';
            const wavBlob = bufferToWav(audioBuffer);
            updateProgress(100);
            downloadBlob(wavBlob, getOutputName('wav'));
            finishConversion();
        } else {
            convertBtn.textContent = 'A converter para MP3...';
            setTimeout(() => {
                const mp3Blob = bufferToMp3(audioBuffer, (p) => updateProgress(40 + Math.round(p * 0.6)));
                downloadBlob(mp3Blob, getOutputName('mp3'));
                finishConversion();
            }, 100);
        }

    } catch (error) {
        console.error('Erro na conversão:', error);
        alert('Não foi possível ler este ficheiro de áudio. Verifique se o ficheiro não está corrompido.');
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
    const originalName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
    return `${originalName}_convertido.${ext}`;
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

// Converte AudioBuffer em MP3 usando lamejs
function bufferToMp3(buffer, onProgress) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const kbps = 128;
    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
    
    const sampleBlockSize = 1152;
    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;
    
    const samplesLen = left.length;
    const mp3Data = [];

    // Converter Float32 para Int16
    const leftInt16 = new Int16Array(samplesLen);
    const rightInt16 = new Int16Array(samplesLen);

    for (let i = 0; i < samplesLen; i++) {
        let sL = Math.max(-1, Math.min(1, left[i]));
        leftInt16[i] = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;

        let sR = Math.max(-1, Math.min(1, right[i]));
        rightInt16[i] = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
    }

    for (let i = 0; i < samplesLen; i += sampleBlockSize) {
        const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
        const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
        
        let mp3buf;
        if (channels === 1) {
            mp3buf = mp3encoder.encodeBuffer(leftChunk);
        } else {
            mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        }

        if (mp3buf.length > 0) mp3Data.push(mp3buf);
        if (onProgress && i % (sampleBlockSize * 10) === 0) {
            onProgress(i / samplesLen);
        }
    }

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    return new Blob(mp3Data, { type: 'audio/mp3' });
}

// Converte AudioBuffer em WAV
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
