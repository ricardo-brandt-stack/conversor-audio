// Instância do FFmpeg
const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

// Estado
let selectedFile = null;

// Elementos DOM
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
// 1. EVENTOS DE SELEÇÃO DE FICHEIRO
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
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) {
        alert('Por favor, seleciona um ficheiro de áudio válido.');
        return;
    }

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

// =========================================================
// 2. LÓGICA DE CONVERSÃO COM FFMPEG.WASM
// =========================================================
convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    const targetFormat = formatSelect.value;
    const inputName = 'input_audio';
    const outputName = `converted_audio.${targetFormat}`;

    try {
        convertBtn.disabled = true;
        convertBtn.textContent = 'A carregar motor de conversão...';
        progressContainer.classList.remove('hidden');
        updateProgress(0);

        // Carrega o motor FFmpeg caso ainda não esteja carregado
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }

        // Atualiza percentagem com os logs do FFmpeg
        ffmpeg.setProgress(({ ratio }) => {
            const percentage = Math.round(ratio * 100);
            if (percentage >= 0 && percentage <= 100) {
                updateProgress(percentage);
            }
        });

        convertBtn.textContent = 'A converter áudio...';

        // Escreve o ficheiro na memória virtual do FFmpeg
        ffmpeg.FS('writeFile', inputName, await fetchFile(selectedFile));

        // Executa o comando de conversão
        await ffmpeg.run('-i', inputName, outputName);

        // Lê o ficheiro convertido
        const data = ffmpeg.FS('readFile', outputName);

        // Descarrega o ficheiro final
        downloadAudio(data, outputName, targetFormat);

        // Limpa a memória virtual
        ffmpeg.FS('unlink', inputName);
        ffmpeg.FS('unlink', outputName);

        convertBtn.textContent = 'Conversão Concluída!';
        setTimeout(() => {
            convertBtn.textContent = 'Converter e Descarregar';
            convertBtn.disabled = false;
        }, 3000);

    } catch (error) {
        console.error('Erro ao converter:', error);
        alert('Ocorreu um erro ao converter o ficheiro de áudio.');
        convertBtn.textContent = 'Converter e Descarregar';
        convertBtn.disabled = false;
    }
});

function updateProgress(percent) {
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
}

function downloadAudio(data, filename, format) {
    const blob = new Blob([data.buffer], { type: `audio/${format}` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}