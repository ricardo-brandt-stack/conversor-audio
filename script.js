let audioFiles = [];

// Elementos DOM
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileList = document.getElementById('file-list');
const formatSelect = document.getElementById('format-select');
const convertBtn = document.getElementById('convert-btn');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

// =========================================================
// 1. EVENTOS DE UPLOAD
// =========================================================
fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    fileInput.value = '';
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
    if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
    }
});

// =========================================================
// 2. GERENCIAMENTO DA LISTA DE ARQUIVOS
// =========================================================
function addFiles(files) {
    const validFiles = Array.from(files).filter(file => 
        file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|aac|flac|wma)$/i)
    );

    if (validFiles.length === 0 && files.length > 0) {
        alert('Por favor, selecione arquivos de áudio válidos.');
        return;
    }

    // Adiciona cada arquivo com status inicial
    validFiles.forEach(file => {
        audioFiles.push({
            file: file,
            status: 'pending' // 'pending', 'converting', 'done', 'error'
        });
    });

    renderFileList();
}

function removeFile(index) {
    audioFiles.splice(index, 1);
    renderFileList();
}

function renderFileList() {
    fileList.innerHTML = '';

    if (audioFiles.length === 0) {
        fileList.innerHTML = '<li class="empty-msg">Nenhum áudio selecionado ainda.</li>';
        convertBtn.disabled = true;
        convertBtn.textContent = 'Converter e Baixar Todos';
        progressContainer.classList.add('hidden');
        return;
    }

    audioFiles.forEach((item, index) => {
        const li = document.createElement('li');
        
        let statusTag = '';
        if (item.status === 'pending') statusTag = '<span style="color: var(--text-muted); font-size: 0.85rem;">Pendente</span>';
        else if (item.status === 'converting') statusTag = '<span style="color: var(--primary-color); font-weight: bold; font-size: 0.85rem;">Convertendo...</span>';
        else if (item.status === 'done') statusTag = '<span style="color: #10b981; font-weight: bold; font-size: 0.85rem;">Concluído ✓</span>';
        else if (item.status === 'error') statusTag = '<span style="color: var(--danger-color); font-weight: bold; font-size: 0.85rem;">Erro ✕</span>';

        li.innerHTML = `
            <div class="file-info">
                <span>🎧</span>
                <span class="file-name" title="${item.file.name}">${item.file.name}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                ${statusTag}
                <button class="btn-remove" onclick="removeFile(${index})" title="Remover">&times;</button>
            </div>
        `;

        fileList.appendChild(li);
    });

    convertBtn.disabled = false;
    convertBtn.textContent = `Converter ${audioFiles.length} ${audioFiles.length === 1 ? 'Áudio' : 'Áudios'} e Baixar`;
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
// 3. CONVERSÃO EM LOTE
// =========================================================
convertBtn.addEventListener('click', async () => {
    if (audioFiles.length === 0) return;

    const targetFormat = formatSelect.value;
    convertBtn.disabled = true;
    progressContainer.classList.remove('hidden');
    updateProgress(0);

    const total = audioFiles.length;

    for (let i = 0; i < total; i++) {
        const item = audioFiles[i];
        item.status = 'converting';
        renderFileList();

        try {
            const arrayBuffer = await item.file.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

            let resultBlob;
            if (targetFormat === 'wav') {
                resultBlob = bufferToWav(audioBuffer);
            } else {
                resultBlob = await bufferToMp3(audioBuffer);
            }

            // Inicia o download do arquivo individual
            const outputName = getOutputName(item.file.name, targetFormat);
            downloadBlob(resultBlob, outputName);

            item.status = 'done';
            audioCtx.close();

        } catch (error) {
            console.error('Erro no arquivo:', item.file.name, error);
            item.status = 'error';
        }

        // Atualiza barra de progresso geral
        const overallProgress = Math.round(((i + 1) / total) * 100);
        updateProgress(overallProgress);
        renderFileList();
    }

    convertBtn.textContent = 'Todas as conversões foram concluídas!';
    setTimeout(() => {
        convertBtn.disabled = false;
        renderFileList();
    }, 3000);
});

function getOutputName(originalFileName, ext) {
    const nameWithoutExt = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || originalFileName;
    return `${nameWithoutExt}_convertido.${ext}`;
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

// =========================================================
// 4. FUNÇÕES DE ENCODING (MP3 & WAV)
// =========================================================
function bufferToMp3(buffer) {
    return new Promise((resolve) => {
        const channels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const kbps = 128;
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
        
        const sampleBlockSize = 1152;
        const left = buffer.getChannelData(0);
        const right = channels > 1 ? buffer.getChannelData(1) : left;
        
        const samplesLen = left.length;
        const mp3Data = [];

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
        }

        const endBuf = mp3encoder.flush();
        if (endBuf.length > 0) mp3Data.push(endBuf);

        resolve(new Blob(mp3Data, { type: 'audio/mp3' }));
    });
}

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
