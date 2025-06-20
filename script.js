// DSAR Analyzer - Main JavaScript File

class DSARAnalyzer {
    constructor() {
        this.files = [];
        this.calls = [];
        this.charts = {};
        this.dataTable = null;
        this.audioAnalysisDataTable = null;
        this.energyData = []; // Initialize energy data array
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // File input handling
        const fileInput = document.getElementById('fileInput');
        const dropZone = document.getElementById('dropZone');
        const processBtn = document.getElementById('processBtn');
        const clearBtn = document.getElementById('clearBtn');

        fileInput.addEventListener('change', (e) => this.handleFileSelection(e.target.files));
        
        // Drag and drop functionality
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            this.handleFileSelection(e.dataTransfer.files);
        });

        processBtn.addEventListener('click', () => this.processFiles());
        clearBtn.addEventListener('click', () => this.clearAll());

        // Botón Exportar PDF
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => this.exportarReportePDF());
        }
    }

    handleFileSelection(fileList) {
        const validFiles = Array.from(fileList).filter(file => 
            file.name.endsWith('.log') || file.name.endsWith('.txt')
        );

        if (validFiles.length === 0) {
            this.showAlert('Por favor selecciona archivos .log o .txt válidos', 'warning');
            return;
        }

        this.files = [...this.files, ...validFiles];
        this.updateFileList();
        this.updateButtons();
    }

    updateFileList() {
        const fileList = document.getElementById('fileList');
        const fileItems = document.getElementById('fileItems');

        if (this.files.length === 0) {
            fileList.style.display = 'none';
            return;
        }

        fileList.style.display = 'block';
        fileItems.innerHTML = '';

        this.files.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'list-group-item file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <i class="fas fa-file-alt text-primary"></i>
                    <div>
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                    </div>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="analyzer.removeFile(${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;
            fileItems.appendChild(fileItem);
        });
    }

    removeFile(index) {
        this.files.splice(index, 1);
        this.updateFileList();
        this.updateButtons();
    }

    updateButtons() {
        const processBtn = document.getElementById('processBtn');
        const clearBtn = document.getElementById('clearBtn');
        
        processBtn.disabled = this.files.length === 0;
        clearBtn.disabled = this.files.length === 0 && this.calls.length === 0;
    }

    async processFiles() {
        this.showLoading(true);
        this.calls = [];
        this.energyData = []; // Reset energy data

        try {
            for (let i = 0; i < this.files.length; i++) {
                const file = this.files[i];
                await this.processFile(file);
                // Update progress
                const progress = ((i + 1) / this.files.length) * 100;
                this.updateProgress(progress);
            }

            this.analyzeResults();
            this.showResults();
            this.showAlert(`Procesamiento completado. ${this.calls.length} llamadas analizadas.`, 'success');
        } catch (error) {
            console.error('Error processing files:', error);
            this.showAlert('Error al procesar los archivos. Revisa la consola para más detalles.', 'danger');
        } finally {
            this.showLoading(false);
        }
    }

    async processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    // Split por \r\n o \n para soportar ambos tipos de salto de línea
                    const lines = content.split(/\r?\n/);
                    // --- CAMBIO: Acumular llamadas en vez de sobrescribir ---
                    const prevCalls = this.calls;
                    this.calls = prevCalls || [];
                    const originalLength = this.calls.length;
                    const completedCalls = this.parseLogLinesReturn(lines, file.name);
                    this.calls.push(...completedCalls);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    // Nueva función: igual a parseLogLines pero retorna el array de llamadas procesadas
    parseLogLinesReturn(lines, fileName) {
        const activeCalls = new Map(); // canal -> llamada activa
        const completedCalls = [];
        const energyData = []; // Array para almacenar datos de energía

        lines.forEach((line, lineIndex) => {
            if (!line.trim()) return;
            const timestampMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3});/);
            if (!timestampMatch) return;
            const timestamp = timestampMatch[1];
            const channelMatch = line.match(/IDLE ;(\d+);/);
            const channel = channelMatch ? channelMatch[1] : null;
            
            // Extract energy data
            if (line.includes('Calculo de energia')) {
                const energyMatch = line.match(/energia = (\d+)/);
                if (energyMatch) {
                    const energyChannelMatch = line.match(/IDLE ;(\d+);/);
                    const energyChannel = energyChannelMatch ? energyChannelMatch[1] : (channel || null);

                    energyData.push({
                        timestamp: timestamp,
                        channel: energyChannel,
                        energy: parseInt(energyMatch[1]),
                        speechBufferIndex: line.match(/SpeechBufferIndex = (\d+)/)?.[1] || null
                    });
                }
            }
            
            if (line.includes('MAKE_CALL')) {
                const audioMatch = line.match(/Llamando a \d*(\d{2})/);
                if (audioMatch && channel) {
                    if (activeCalls.has(channel)) {
                        const prevCall = activeCalls.get(channel);
                        completedCalls.push(prevCall);
                    }
                    activeCalls.set(channel, {
                        startTime: timestamp,
                        channel: channel,
                        expectedAudio: audioMatch[1],
                        fileName: fileName,
                        detections: [],
                        finalDetections: [],
                        hangupTime: null,
                        hangupCause: null,
                        debug: [],
                        energyData: [] // Array para almacenar energía de esta llamada
                    });
                }
            } else if (line.includes('DSAR - AUDIO DETECTADO') && channel) {
                const call = activeCalls.get(channel);
                if (call) {
                    const audioMatch = line.match(/AUDIO DETECTADO (\d{2})/);
                    const probMatch = line.match(/CON\s+(\d+)%/);
                    if (audioMatch && probMatch) {
                        call.finalDetections.push({
                            timestamp: timestamp,
                            detectedAudio: audioMatch[1],
                            probability: parseInt(probMatch[1])
                        });
                    }
                }
            } else if (line.includes('Calculo RED DSAR - POSIBLE AUDIO') && channel) {
                const call = activeCalls.get(channel);
                if (call) {
                    const audioMatch = line.match(/POSIBLE AUDIO\((\d+)\)/);
                    const probMatch = line.match(/Probabilidad=(\d+)/);
                    if (audioMatch && probMatch) {
                        call.detections.push({
                            timestamp: timestamp,
                            detectedAudio: audioMatch[1].padStart(2, '0'),
                            probability: parseInt(probMatch[1])
                        });
                    }
                }
            } else if (line.includes('HANG_UP') && channel) {
                const call = activeCalls.get(channel);
                if (call) {
                    const causeMatch = line.match(/Q850:\s*(\d+)/);
                    call.hangupTime = timestamp;
                    call.hangupCause = causeMatch ? causeMatch[1] : null;
                    if (call.finalDetections.length > 0) {
                        let lastDetection = null;
                        for (const det of call.finalDetections) {
                            if (this.parseTimeToSeconds(det.timestamp) <= this.parseTimeToSeconds(call.hangupTime)) {
                                lastDetection = det;
                            }
                        }
                        if (lastDetection) {
                            call.finalDetection = lastDetection;
                        } else {
                            call.finalDetection = null;
                        }
                    } else {
                        call.finalDetection = null;
                    }
                    completedCalls.push(call);
                    activeCalls.delete(channel);
                }
            }
        });
        
        // Add energy data to calls
        completedCalls.forEach(call => {
            call.energyData = energyData.filter(energy => 
                energy.channel === call.channel &&
                this.parseTimeToSeconds(energy.timestamp) >= this.parseTimeToSeconds(call.startTime) &&
                (call.hangupTime ? this.parseTimeToSeconds(energy.timestamp) <= this.parseTimeToSeconds(call.hangupTime) : true)
            );
        });
        
        // Store global energy data
        this.energyData.push(...energyData);
        
        for (const [channel, call] of activeCalls.entries()) {
            completedCalls.push(call);
        }
        return completedCalls;
    }

    analyzeResults() {
        if (this.calls.length === 0) {
            console.log('No se encontraron llamadas completas para analizar');
            return;
        }

        console.log(`Analizando ${this.calls.length} llamadas...`);

        // Calculate metrics
        const totalCalls = this.calls.length;
        const correctDetections = this.calls.filter(call => 
            call.finalDetection && 
            call.finalDetection.detectedAudio === call.expectedAudio
        ).length;
        const accuracyRate = (correctDetections / totalCalls) * 100;

        // Calculate average detection time
        const detectionTimes = this.calls
            .filter(call => call.finalDetection && call.hangupTime)
            .map(call => this.calculateTimeDifference(call.startTime, call.finalDetection.timestamp));
        
        const avgTime = detectionTimes.length > 0 ? 
            detectionTimes.reduce((a, b) => a + b, 0) / detectionTimes.length : 0;

        // Count unique channels
        const uniqueChannels = new Set(this.calls.map(call => call.channel)).size;

        console.log(`Métricas calculadas - Total: ${totalCalls}, Aciertos: ${correctDetections}, Tasa: ${accuracyRate.toFixed(1)}%`);

        // Update metrics display
        document.getElementById('totalCalls').textContent = totalCalls;
        document.getElementById('accuracyRate').textContent = `${accuracyRate.toFixed(1)}%`;
        document.getElementById('activeChannels').textContent = uniqueChannels;
        document.getElementById('avgTime').textContent = `${avgTime.toFixed(1)}s`;

        // Create charts
        this.createCharts();
        this.populateTable();
        this.populateAudioAnalysisTable();
        
        // Initialize timeline functionality
        this.initializeTimeline();
        
        // Initialize energy analysis
        this.initializeEnergyAnalysis();
    }

    createCharts() {
        // Destroy existing charts first
        if (this.charts.accuracy) {
            this.charts.accuracy.destroy();
        }
        if (this.charts.channel) {
            this.charts.channel.destroy();
        }

        // Accuracy Chart (Pie Chart)
        const accuracyCtx = document.getElementById('accuracyChart').getContext('2d');
        const correctDetections = this.calls.filter(call => 
            call.finalDetection && 
            call.finalDetection.detectedAudio === call.expectedAudio
        ).length;
        const incorrectDetections = this.calls.length - correctDetections;

        this.charts.accuracy = new Chart(accuracyCtx, {
            type: 'doughnut',
            data: {
                labels: ['Aciertos', 'Errores'],
                datasets: [{
                    data: [correctDetections, incorrectDetections],
                    backgroundColor: ['#28a745', '#dc3545'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });

        // Audio Performance Chart (Bar Chart)
        const channelCtx = document.getElementById('channelChart').getContext('2d');
        const channelStats = this.getAudioStatistics();

        this.charts.channel = new Chart(channelCtx, {
            type: 'bar',
            data: {
                labels: channelStats.labels,
                datasets: [{
                    label: 'Aciertos',
                    data: channelStats.correct,
                    backgroundColor: '#28a745'
                }, {
                    label: 'Errores',
                    data: channelStats.incorrect,
                    backgroundColor: '#dc3545'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    getAudioStatistics() {
        const audioMap = new Map();

        this.calls.forEach(call => {
            if (!audioMap.has(call.expectedAudio)) {
                audioMap.set(call.expectedAudio, { correct: 0, incorrect: 0 });
            }

            const isCorrect = call.finalDetection && 
                call.finalDetection.detectedAudio === call.expectedAudio;

            if (isCorrect) {
                audioMap.get(call.expectedAudio).correct++;
            } else {
                audioMap.get(call.expectedAudio).incorrect++;
            }
        });

        const audios = Array.from(audioMap.keys()).sort((a, b) => a - b);
        return {
            labels: audios.map(audio => `Audio ${audio}`),
            correct: audios.map(audio => audioMap.get(audio).correct),
            incorrect: audios.map(audio => audioMap.get(audio).incorrect)
        };
    }

    populateTable() {
        if (this.dataTable) {
            this.dataTable.destroy();
        }

        const tableBody = document.querySelector('#callsTable tbody');
        tableBody.innerHTML = '';

        this.calls.forEach(call => {
            const row = document.createElement('tr');
            const isCorrect = call.finalDetection && 
                call.finalDetection.detectedAudio === call.expectedAudio;
            
            const duration = call.hangupTime ? 
                this.calculateTimeDifference(call.startTime, call.hangupTime) : 0;

            row.innerHTML = `
                <td>${call.startTime}</td>
                <td>${call.channel}</td>
                <td>${call.expectedAudio}</td>
                <td>${call.finalDetection ? call.finalDetection.detectedAudio : 'N/A'}</td>
                <td>${call.finalDetection ? call.finalDetection.probability + '%' : 'N/A'}</td>
                <td>
                    <span class="badge ${isCorrect ? 'badge-success' : 'badge-error'}">
                        ${isCorrect ? 'Acierto' : 'Error'}
                    </span>
                </td>
                <td>${call.hangupCause || 'N/A'}</td>
                <td>${duration.toFixed(1)}s</td>
            `;
            tableBody.appendChild(row);
        });

        this.dataTable = $('#callsTable').DataTable({
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
            },
            pageLength: 25,
            order: [[0, 'desc']],
            responsive: true
        });
    }

    populateAudioAnalysisTable() {
        const audioAnalysisTable = document.getElementById('audioAnalysisTable');
        const tableBody = audioAnalysisTable.querySelector('tbody');
        tableBody.innerHTML = '';

        // Group calls by expected audio
        const audioStats = new Map();

        this.calls.forEach(call => {
            const expectedAudio = call.expectedAudio;
            if (!audioStats.has(expectedAudio)) {
                audioStats.set(expectedAudio, {
                    total: 0,
                    correct: 0,
                    incorrect: 0,
                    details: []
                });
            }

            const stats = audioStats.get(expectedAudio);
            stats.total++;
            
            const isCorrect = call.finalDetection && 
                call.finalDetection.detectedAudio === call.expectedAudio;
            
            if (isCorrect) {
                stats.correct++;
            } else {
                stats.incorrect++;
            }

            stats.details.push({
                channel: call.channel,
                detected: call.finalDetection ? call.finalDetection.detectedAudio : 'N/A',
                probability: call.finalDetection ? call.finalDetection.probability : 'N/A',
                timestamp: call.startTime
            });
        });

        // Create table rows
        const sortedAudios = Array.from(audioStats.keys()).sort();
        
        sortedAudios.forEach(expectedAudio => {
            const stats = audioStats.get(expectedAudio);
            const accuracyRate = (stats.correct / stats.total) * 100;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>Audio ${expectedAudio}</strong></td>
                <td>${stats.total}</td>
                <td><span class="badge badge-success">${stats.correct}</span></td>
                <td><span class="badge badge-error">${stats.incorrect}</span></td>
                <td><strong>${accuracyRate.toFixed(1)}%</strong></td>
                <td>
                    <button class="btn btn-sm btn-outline-info" onclick="analyzer.showAudioDetails('${expectedAudio}')">
                        <i class="fas fa-eye"></i> Ver Detalles
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Initialize DataTable for audio analysis
        if (this.audioAnalysisDataTable) {
            this.audioAnalysisDataTable.destroy();
        }

        this.audioAnalysisDataTable = $('#audioAnalysisTable').DataTable({
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json'
            },
            pageLength: 10,
            order: [[4, 'desc']], // Sort by accuracy rate
            responsive: true
        });
    }

    showAudioDetails(expectedAudio) {
        const callsForAudio = this.calls.filter(call => call.expectedAudio === expectedAudio);
        
        let detailsHtml = `
            <div class="modal fade" id="audioDetailsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Detalles para Audio ${expectedAudio}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Hora</th>
                                        <th>Canal</th>
                                        <th>Detectado</th>
                                        <th>Probabilidad</th>
                                        <th>Estado</th>
                                        <th>Derivada a Agente</th>
                                    </tr>
                                </thead>
                                <tbody>
        `;

        callsForAudio.forEach(call => {
            const isCorrect = call.finalDetection && 
                call.finalDetection.detectedAudio === call.expectedAudio;
            const derivadaAgente = call.finalDetection ? 'No' : 'Sí';
            
            detailsHtml += `
                <tr>
                    <td>${call.startTime}</td>
                    <td>${call.channel}</td>
                    <td>${call.finalDetection ? call.finalDetection.detectedAudio : 'N/A'}</td>
                    <td>${call.finalDetection ? call.finalDetection.probability + '%' : 'N/A'}</td>
                    <td>
                        <span class="badge ${isCorrect ? 'badge-success' : 'badge-error'}">
                            ${isCorrect ? 'Acierto' : 'Error'}
                        </span>
                    </td>
                    <td>${derivadaAgente}</td>
                </tr>
            `;
        });

        detailsHtml += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('audioDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add new modal to body
        document.body.insertAdjacentHTML('beforeend', detailsHtml);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('audioDetailsModal'));
        modal.show();
    }

    calculateTimeDifference(startTime, endTime) {
        if (!startTime || !endTime) return 0;
        return this.parseTimeToSeconds(endTime) - this.parseTimeToSeconds(startTime);
    }

    parseTimeToSeconds(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return null;
        const match = timeStr.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
        if (!match) return null;
        const [, hours, minutes, seconds, ms] = match.map(Number);
        if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(ms)) return null;
        return hours * 3600 + minutes * 60 + seconds + ms / 1000;
    }

    formatSecondsToTime(totalSeconds) {
        if (totalSeconds === null || isNaN(totalSeconds)) return '';
        const sign = totalSeconds < 0 ? "-" : "";
        totalSeconds = Math.abs(totalSeconds);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
        return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showLoading(show) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        const resultsSection = document.getElementById('resultsSection');
        
        if (show) {
            loadingSpinner.style.display = 'block';
            resultsSection.style.display = 'none';
        } else {
            loadingSpinner.style.display = 'none';
        }
    }

    updateProgress(percentage) {
        console.log(`Progress: ${percentage.toFixed(1)}%`);
    }

    showResults() {
        const resultsSection = document.getElementById('resultsSection');
        resultsSection.style.display = 'block';
        resultsSection.classList.add('fade-in-up');
    }

    clearAll() {
        this.files = [];
        this.calls = [];
        
        if (this.dataTable) {
            this.dataTable.destroy();
            this.dataTable = null;
        }

        if (this.audioAnalysisDataTable) {
            this.audioAnalysisDataTable.destroy();
            this.audioAnalysisDataTable = null;
        }

        if (this.charts.accuracy) {
            this.charts.accuracy.destroy();
            this.charts.accuracy = null;
        }
        if (this.charts.channel) {
            this.charts.channel.destroy();
            this.charts.channel = null;
        }

        this.updateFileList();
        this.updateButtons();
        
        document.getElementById('resultsSection').style.display = 'none';
        document.getElementById('fileList').style.display = 'none';
        
        // Reset metrics
        document.getElementById('totalCalls').textContent = '0';
        document.getElementById('accuracyRate').textContent = '0%';
        document.getElementById('activeChannels').textContent = '0';
        document.getElementById('avgTime').textContent = '0s';
        
        // Clear timeline
        this.hideTimeline();
        const callSelector = document.getElementById('callSelector');
        if (callSelector) {
            callSelector.innerHTML = '<option value="">-- Seleccionar una llamada --</option>';
        }
        
        // Clear energy analysis
        if (this.charts.energy) {
            this.charts.energy.destroy();
            this.charts.energy = null;
        }
        document.getElementById('noEnergyMessage').style.display = 'block';
        document.getElementById('energyStats').style.display = 'none';
        document.getElementById('energyChartCard').style.display = 'none';
        document.getElementById('energyEventsCard').style.display = 'none';
    }

    showAlert(message, type) {
        // Create Bootstrap alert
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    // Timeline functionality
    initializeTimeline() {
        this.populateCallSelector();
        this.populateFilters();
        this.setupTimelineEventListeners();
    }

    populateCallSelector() {
        const callSelector = document.getElementById('callSelector');
        callSelector.innerHTML = '<option value="">-- Seleccionar una llamada --</option>';
        
        this.calls.forEach((call, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Canal ${call.channel} - Audio ${call.expectedAudio} - ${call.startTime}`;
            callSelector.appendChild(option);
        });
    }

    populateFilters() {
        // Populate channel filter
        const channelFilter = document.getElementById('channelFilter');
        const channels = [...new Set(this.calls.map(call => call.channel))].sort((a, b) => a - b);
        channelFilter.innerHTML = '<option value="">Todos los canales</option>';
        channels.forEach(channel => {
            const option = document.createElement('option');
            option.value = channel;
            option.textContent = `Canal ${channel}`;
            channelFilter.appendChild(option);
        });

        // Populate audio filter
        const audioFilter = document.getElementById('audioFilter');
        const audios = [...new Set(this.calls.map(call => call.expectedAudio))].sort((a, b) => a - b);
        audioFilter.innerHTML = '<option value="">Todos los audios</option>';
        audios.forEach(audio => {
            const option = document.createElement('option');
            option.value = audio;
            option.textContent = `Audio ${audio}`;
            audioFilter.appendChild(option);
        });
    }

    setupTimelineEventListeners() {
        const callSelector = document.getElementById('callSelector');
        const channelFilter = document.getElementById('channelFilter');
        const audioFilter = document.getElementById('audioFilter');
        const statusFilter = document.getElementById('statusFilter');

        callSelector.addEventListener('change', () => this.onCallSelected());
        channelFilter.addEventListener('change', () => this.filterCalls());
        audioFilter.addEventListener('change', () => this.filterCalls());
        statusFilter.addEventListener('change', () => this.filterCalls());
    }

    filterCalls() {
        const channelFilter = document.getElementById('channelFilter').value;
        const audioFilter = document.getElementById('audioFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const callSelector = document.getElementById('callSelector');

        // Filter calls based on criteria
        const filteredCalls = this.calls.filter(call => {
            const channelMatch = !channelFilter || call.channel === channelFilter;
            const audioMatch = !audioFilter || call.expectedAudio === audioFilter;
            const statusMatch = !statusFilter || 
                (statusFilter === 'correct' && call.finalDetection && call.finalDetection.detectedAudio === call.expectedAudio) ||
                (statusFilter === 'incorrect' && (!call.finalDetection || call.finalDetection.detectedAudio !== call.expectedAudio));
            
            return channelMatch && audioMatch && statusMatch;
        });

        // Update call selector
        callSelector.innerHTML = '<option value="">-- Seleccionar una llamada --</option>';
        filteredCalls.forEach((call, index) => {
            const originalIndex = this.calls.indexOf(call);
            const option = document.createElement('option');
            option.value = originalIndex;
            option.textContent = `Canal ${call.channel} - Audio ${call.expectedAudio} - ${call.startTime}`;
            callSelector.appendChild(option);
        });
    }

    onCallSelected() {
        const callSelector = document.getElementById('callSelector');
        const selectedIndex = callSelector.value;
        
        if (selectedIndex === '') {
            this.hideTimeline();
            return;
        }

        const selectedCall = this.calls[selectedIndex];
        this.showCallTimeline(selectedCall);
    }

    showCallTimeline(call) {
        this.showCallSummary(call);
        this.renderTimeline(call);
        
        document.getElementById('callSummaryCard').style.display = 'block';
        document.getElementById('timelineCard').style.display = 'block';
        document.getElementById('noCallMessage').style.display = 'none';
    }

    hideTimeline() {
        document.getElementById('callSummaryCard').style.display = 'none';
        document.getElementById('timelineCard').style.display = 'none';
        document.getElementById('noCallMessage').style.display = 'block';
    }

    showCallSummary(call) {
        const callSummary = document.getElementById('callSummary');
        const isCorrect = call.finalDetection && call.finalDetection.detectedAudio === call.expectedAudio;
        const duration = call.hangupTime ? this.calculateTimeDifference(call.startTime, call.hangupTime) : 'N/A';
        
        callSummary.innerHTML = `
            <div class="col-md-3">
                <div class="call-summary-item">
                    <div class="call-summary-value">${call.channel}</div>
                    <div class="call-summary-label">Canal</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="call-summary-item">
                    <div class="call-summary-value">${call.expectedAudio}</div>
                    <div class="call-summary-label">Audio Esperado</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="call-summary-item">
                    <div class="call-summary-value">${call.finalDetection ? call.finalDetection.detectedAudio : 'N/A'}</div>
                    <div class="call-summary-label">Audio Detectado</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="call-summary-item">
                    <div class="call-summary-value ${isCorrect ? 'text-success' : 'text-danger'}">
                        ${isCorrect ? '✓ Acierto' : '✗ Error'}
                    </div>
                    <div class="call-summary-label">Resultado</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="call-summary-item">
                    <div class="call-summary-value">${call.detections.length}</div>
                    <div class="call-summary-label">Detecciones Intermedias</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="call-summary-item">
                    <div class="call-summary-value">${call.finalDetection ? call.finalDetection.probability + '%' : 'N/A'}</div>
                    <div class="call-summary-label">Probabilidad Final</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="call-summary-item">
                    <div class="call-summary-value">${duration}</div>
                    <div class="call-summary-label">Duración (seg)</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="call-summary-item">
                    <div class="call-summary-value">${call.hangupCause || 'N/A'}</div>
                    <div class="call-summary-label">Causa de Corte</div>
                </div>
            </div>
        `;
    }

    renderTimeline(call) {
        const timelineContainer = document.getElementById('timelineContainer');
        
        // Create timeline events array
        const events = [];
        
        // Add MAKE_CALL event
        events.push({
            type: 'make-call',
            timestamp: call.startTime,
            title: 'Inicio de Llamada',
            description: `Llamada iniciada al audio ${call.expectedAudio}`,
            probability: null
        });
        
        // Add intermediate detections
        call.detections.forEach(detection => {
            events.push({
                type: 'detection',
                timestamp: detection.timestamp,
                title: `Detección Intermedia`,
                description: `Audio ${detection.detectedAudio} detectado`,
                probability: detection.probability
            });
        });
        
        // Add final detection
        if (call.finalDetection) {
            events.push({
                type: 'final-detection',
                timestamp: call.finalDetection.timestamp,
                title: 'Detección Final',
                description: `Audio ${call.finalDetection.detectedAudio} confirmado`,
                probability: call.finalDetection.probability
            });
        }
        
        // Add HANG_UP event
        if (call.hangupTime) {
            events.push({
                type: 'hangup',
                timestamp: call.hangupTime,
                title: 'Fin de Llamada',
                description: `Llamada terminada${call.hangupCause ? ` - Causa: ${call.hangupCause}` : ''}`,
                probability: null
            });
        }
        
        // Sort events by timestamp
        events.sort((a, b) => this.parseTimeToSeconds(a.timestamp) - this.parseTimeToSeconds(b.timestamp));
        
        // Render timeline
        timelineContainer.innerHTML = `
            <div class="timeline">
                ${events.map((event, index) => this.renderTimelineEvent(event, index)).join('')}
            </div>
        `;
    }

    renderTimelineEvent(event, index) {
        const probabilityClass = event.probability ? 
            (event.probability >= 70 ? 'high' : event.probability >= 40 ? 'medium' : 'low') : '';
        
        const probabilityHtml = event.probability ? 
            `<div class="timeline-probability ${probabilityClass}">${event.probability}%</div>` : '';
        
        return `
            <div class="timeline-item">
                <div class="timeline-marker ${event.type}"></div>
                <div class="timeline-content">
                    <div class="timeline-time">${event.timestamp}</div>
                    <div class="timeline-title">${event.title}</div>
                    <div class="timeline-description">${event.description}</div>
                    ${probabilityHtml}
                </div>
            </div>
        `;
    }

    // Energy Analysis functionality
    initializeEnergyAnalysis() {
        console.log("Initializing energy analysis.");
        this.setupEnergyEventListeners();
        this.populateEnergyFilters();
        if (this.energyData.length > 0) {
            document.getElementById('noEnergyMessage').style.display = 'none';
            document.getElementById('energyChartCard').style.display = 'block';
            document.getElementById('energyStats').style.display = 'flex'; // Use flex to honor row behavior
            document.getElementById('energyEventsCard').style.display = 'block';
            this.updateEnergyChart();
        } else {
            document.getElementById('noEnergyMessage').style.display = 'block';
            document.getElementById('energyChartCard').style.display = 'none';
            document.getElementById('energyStats').style.display = 'none';
            document.getElementById('energyEventsCard').style.display = 'none';
        }
    }

    setupEnergyEventListeners() {
        const updateEnergyChart = document.getElementById('updateEnergyChart');
        const resetEnergyFilters = document.getElementById('resetEnergyFilters');
        const exportEnergyData = document.getElementById('exportEnergyData');

        if (updateEnergyChart) {
            updateEnergyChart.addEventListener('click', () => this.updateEnergyChart());
        }
        if (resetEnergyFilters) {
            resetEnergyFilters.addEventListener('click', () => this.resetEnergyFilters());
        }
        if (exportEnergyData) {
            exportEnergyData.addEventListener('click', () => this.exportEnergyData());
        }
    }

    populateEnergyFilters() {
        const energyChannelFilter = document.getElementById('energyChannelFilter');
        if (!energyChannelFilter) return;

        const channels = [...new Set(this.calls.map(call => call.channel))].sort((a, b) => a - b);
        energyChannelFilter.innerHTML = '<option value="">Todos los canales</option>';
        channels.forEach(channel => {
            const option = document.createElement('option');
            option.value = channel;
            option.textContent = `Canal ${channel}`;
            energyChannelFilter.appendChild(option);
        });

        // Set default time range based on call data
        this.setDefaultTimeRange();
    }

    setDefaultTimeRange() {
        console.log("Setting default time range. Total energy points:", this.energyData.length);
        if (!this.energyData || this.energyData.length === 0) return;

        const energyTimes = this.energyData
            .map(e => this.parseTimeToSeconds(e.timestamp))
            .filter(t => t !== null);

        if (energyTimes.length === 0) {
            console.warn("No valid timestamps found in energy data.");
            return;
        }

        const minTime = Math.min(...energyTimes);
        const maxTime = Math.max(...energyTimes);

        console.log(`Formatted time range: ${this.formatSecondsToTime(minTime)} to ${this.formatSecondsToTime(maxTime)}`);

        const startTimeInput = document.getElementById('energyStartTime');
        const endTimeInput = document.getElementById('energyEndTime');

        if (startTimeInput && endTimeInput && isFinite(minTime) && isFinite(maxTime)) {
            startTimeInput.value = this.formatSecondsToTime(minTime);
            endTimeInput.value = this.formatSecondsToTime(maxTime);
        }
    }

    showEnergyAnalysis() {
        // This method is now effectively replaced by the logic in initializeEnergyAnalysis and updateEnergyChart
        // We keep it for structure but the main logic is triggered by updateEnergyChart
        this.updateEnergyChart();
    }

    updateEnergyStatistics() {
        const energyValues = this.getEnergyValues();
        console.log(`Updating statistics with ${energyValues.length} values.`);

        if (energyValues.length === 0) {
            document.getElementById('energyPeaks').textContent = '0';
            document.getElementById('avgEnergy').textContent = '0';
            document.getElementById('maxEnergy').textContent = '0';
            document.getElementById('activePeriods').textContent = '0';
            return;
        }

        const peaks = this.countEnergyPeaks(energyValues);
        const avg = Math.round(energyValues.reduce((a, b) => a + b, 0) / energyValues.length);
        const max = Math.max(...energyValues);
        const activePeriods = this.countActivePeriods(energyValues);

        document.getElementById('energyPeaks').textContent = peaks;
        document.getElementById('avgEnergy').textContent = isFinite(avg) ? avg : 0;
        document.getElementById('maxEnergy').textContent = isFinite(max) ? max : 0;
        document.getElementById('activePeriods').textContent = activePeriods;
    }

    getEnergyValues() {
        if (!this.energyData || this.energyData.length === 0) return [];
        
        const channelFilter = document.getElementById('energyChannelFilter')?.value;
        const startTimeStr = document.getElementById('energyStartTime')?.value;
        const endTimeStr = document.getElementById('energyEndTime')?.value;

        const startSeconds = this.parseTimeToSeconds(startTimeStr);
        const endSeconds = this.parseTimeToSeconds(endTimeStr);
        
        if (startSeconds === null || endSeconds === null) {
            console.error("Invalid time range for filtering, cannot get values.");
            return [];
        }

        const filtered = this.energyData.filter(e => {
            const eventTime = this.parseTimeToSeconds(e.timestamp);
            if (eventTime === null) return false;
            const channelMatch = !channelFilter || e.channel === channelFilter;
            const timeMatch = eventTime >= startSeconds && eventTime <= endSeconds;
            return channelMatch && timeMatch;
        });
        
        return filtered.map(e => e.energy);
    }

    countEnergyPeaks(energyValues) {
        const threshold = parseInt(document.getElementById('energyThreshold').value) || 100;
        let peaks = 0;
        
        for (let i = 1; i < energyValues.length - 1; i++) {
            if (energyValues[i] > threshold && 
                energyValues[i] > energyValues[i-1] && 
                energyValues[i] > energyValues[i+1]) {
                peaks++;
            }
        }
        
        return peaks;
    }

    countActivePeriods(energyValues) {
        const threshold = parseInt(document.getElementById('energyThreshold').value) || 100;
        let periods = 0;
        let inActivePeriod = false;
        
        energyValues.forEach(value => {
            if (value > threshold && !inActivePeriod) {
                periods++;
                inActivePeriod = true;
            } else if (value <= threshold) {
                inActivePeriod = false;
            }
        });
        
        return periods;
    }

    createEnergyChart() {
        const ctx = document.getElementById('energyChart');
        if (!ctx) return;

        // Destroy existing chart
        if (this.charts.energy) {
            this.charts.energy.destroy();
        }

        const energyData = this.getEnergyChartData();
        
        this.charts.energy = new Chart(ctx, {
            type: 'line',
            data: {
                labels: energyData.labels,
                datasets: [{
                    label: 'Energía Acústica',
                    data: energyData.values,
                    borderColor: '#17a2b8',
                    backgroundColor: 'rgba(23, 162, 184, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Umbral',
                    data: energyData.threshold,
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Tiempo'
                        },
                        ticks: {
                            autoSkip: true,
                            maxRotation: 45,
                            maxTicksLimit: 20 // Limit number of visible ticks for readability
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Energía'
                        },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            }
                        }
                    }
                }
            }
        });
    }

    getEnergyChartData() {
        console.log("Getting energy chart data...");
        if (!this.energyData || this.energyData.length === 0) return this.getSampleEnergyData();
        
        const channelFilter = document.getElementById('energyChannelFilter')?.value;
        const startTimeStr = document.getElementById('energyStartTime')?.value;
        const endTimeStr = document.getElementById('energyEndTime')?.value;
        const threshold = parseInt(document.getElementById('energyThreshold')?.value) || 100;

        const startSeconds = this.parseTimeToSeconds(startTimeStr);
        const endSeconds = this.parseTimeToSeconds(endTimeStr);

        if (startSeconds === null || endSeconds === null) {
            console.error("Invalid time range for filtering, returning sample data.");
            return this.getSampleEnergyData();
        }

        let filteredData = this.energyData.filter(e => {
            const eventTime = this.parseTimeToSeconds(e.timestamp);
            if (eventTime === null) return false;
            const channelMatch = !channelFilter || e.channel === channelFilter;
            const timeMatch = eventTime >= startSeconds && eventTime <= endSeconds;
            return channelMatch && timeMatch;
        });

        filteredData.sort((a, b) => this.parseTimeToSeconds(a.timestamp) - this.parseTimeToSeconds(b.timestamp));
        console.log(`Filtered data for chart: ${filteredData.length} points.`);
        
        const chartData = this.downsample(filteredData);
        console.log(`Downsampled data for chart: ${chartData.length} points.`);

        const labels = chartData.map(energy => energy.timestamp);
        const values = chartData.map(energy => energy.energy);
        const thresholdLine = Array(chartData.length).fill(threshold);
        
        return { labels, values, threshold: thresholdLine };
    }

    getSampleEnergyData() {
        // Generate sample data for demonstration when no real data is available
        const labels = [];
        const values = [];
        const threshold = parseInt(document.getElementById('energyThreshold')?.value) || 100;
        
        // Generate time labels starting from a realistic time
        const baseTime = '12:06:00.000';
        for (let i = 0; i < 100; i++) {
            const baseSeconds = this.parseTimeToSeconds(baseTime);
            // Simulate realistic millisecond increments
            const currentSeconds = baseSeconds + i * 0.123;
            labels.push(this.formatSecondsToTime(currentSeconds));
            
            // Generate sample energy values with some peaks
            let value = Math.random() * 100;
            if (i > 20 && i < 30) value = Math.random() * 3000 + 1000; // Peak 1
            if (i > 50 && i < 60) value = Math.random() * 2500 + 800;  // Peak 2
            if (i > 80 && i < 90) value = Math.random() * 2000 + 500;  // Peak 3
            
            values.push(Math.round(value));
        }
        
        return {
            labels: labels,
            values: values,
            threshold: Array(100).fill(threshold)
        };
    }

    populateEnergyEvents() {
        const container = document.getElementById('energyEventsContainer');
        if (!container) return;

        // Combine energy events with call events
        const events = this.generateEnergyEvents();
        
        container.innerHTML = events.map(event => `
            <div class="energy-event">
                <div class="energy-event-icon ${event.type}">
                    <i class="fas ${event.icon}"></i>
                </div>
                <div class="energy-event-content">
                    <div class="energy-event-time">${event.timestamp}</div>
                    <div class="energy-event-title">${event.title}</div>
                    <div class="energy-event-details">${event.description}</div>
                </div>
                ${event.energyValue ? `<div class="energy-value ${event.energyClass}">${event.energyValue}</div>` : ''}
            </div>
        `).join('');
    }

    generateEnergyEvents() {
        const events = [];
        
        // Add call events
        this.calls.forEach(call => {
            events.push({
                type: 'call',
                icon: 'fa-phone',
                timestamp: call.startTime,
                title: 'Inicio de Llamada',
                description: `Canal ${call.channel} - Audio ${call.expectedAudio}`,
                energyValue: null
            });

            if (call.finalDetection) {
                events.push({
                    type: 'final-detection',
                    icon: 'fa-check-circle',
                    timestamp: call.finalDetection.timestamp,
                    title: 'Detección Final',
                    description: `Audio ${call.finalDetection.detectedAudio} (${call.finalDetection.probability}%)`,
                    energyValue: null
                });
            }

            if (call.hangupTime) {
                events.push({
                    type: 'call',
                    icon: 'fa-phone-slash',
                    timestamp: call.hangupTime,
                    title: 'Fin de Llamada',
                    description: `Causa: ${call.hangupCause || 'N/A'}`,
                    energyValue: null
                });
            }
        });
        
        // Add energy peak events
        if (this.energyData && this.energyData.length > 0) {
            const threshold = parseInt(document.getElementById('energyThreshold')?.value) || 100;
            const energyPeaks = this.findEnergyPeaks(this.energyData, threshold);
            
            energyPeaks.forEach(peak => {
                const energyClass = peak.energy >= 2000 ? 'high' : peak.energy >= 500 ? 'medium' : 'low';
                events.push({
                    type: 'energy',
                    icon: 'fa-wave-square',
                    timestamp: peak.timestamp,
                    title: 'Pico de Energía',
                    description: `Canal ${peak.channel} - Buffer ${peak.speechBufferIndex}`,
                    energyValue: peak.energy.toString(),
                    energyClass: energyClass
                });
            });
        }
        
        // Sort events by timestamp
        events.sort((a, b) => this.parseTimeToSeconds(a.timestamp) - this.parseTimeToSeconds(b.timestamp));
        
        return events;
    }

    findEnergyPeaks(energyData, threshold) {
        const peaks = [];
        
        for (let i = 1; i < energyData.length - 1; i++) {
            const current = energyData[i];
            const prev = energyData[i - 1];
            const next = energyData[i + 1];
            
            if (current.energy > threshold && 
                current.energy > prev.energy && 
                current.energy > next.energy) {
                peaks.push(current);
            }
        }
        
        return peaks;
    }

    updateEnergyChart() {
        this.createEnergyChart();
        this.updateEnergyStatistics();
        this.populateEnergyEvents();
    }

    resetEnergyFilters() {
        console.log("Resetting energy filters.");
        document.getElementById('energyChannelFilter').value = '';
        document.getElementById('energyThreshold').value = '100';
        this.setDefaultTimeRange();
        this.updateEnergyChart();
    }

    exportEnergyData() {
        // Implementation for exporting energy data
        this.showAlert('Funcionalidad de exportación de datos de energía en desarrollo', 'info');
    }

    async exportarReportePDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'pt', 'a4');
        let y = 40;

        // Título
        doc.setFontSize(18);
        doc.text('Reporte de Análisis DSAR', 40, y);
        y += 30;

        // Fecha de generación
        doc.setFontSize(10);
        doc.text('Generado: ' + new Date().toLocaleString('es-ES'), 40, y);
        y += 20;

        // Métricas principales
        doc.setFontSize(12);
        doc.text('Métricas principales:', 40, y);
        y += 18;
        doc.setFontSize(10);
        doc.text(`Total Llamadas: ${document.getElementById('totalCalls').textContent}`, 50, y);
        doc.text(`Tasa de Acierto: ${document.getElementById('accuracyRate').textContent}`, 180, y);
        doc.text(`Canales Activos: ${document.getElementById('activeChannels').textContent}`, 320, y);
        doc.text(`Tiempo Promedio: ${document.getElementById('avgTime').textContent}`, 450, y);
        y += 25;

        // Gráficos (como imágenes)
        const accuracyChart = document.getElementById('accuracyChart');
        const channelChart = document.getElementById('channelChart');
        if (accuracyChart && channelChart) {
            // Accuracy Chart
            const imgAcc = accuracyChart.toDataURL('image/png', 1.0);
            doc.setFontSize(11);
            doc.text('Aciertos vs Errores', 40, y);
            doc.addImage(imgAcc, 'PNG', 40, y + 5, 220, 120);
            // Channel Chart
            const imgChan = channelChart.toDataURL('image/png', 1.0);
            doc.text('Rendimiento por Audio', 300, y);
            doc.addImage(imgChan, 'PNG', 300, y + 5, 220, 120);
            y += 135;
        }

        // Tabla Detalle de Llamadas
        doc.setFontSize(12);
        doc.text('Detalle de Llamadas', 40, y);
        y += 10;
        doc.autoTable({
            html: '#callsTable',
            startY: y + 5,
            theme: 'grid',
            headStyles: { fillColor: [0, 123, 255] },
            styles: { fontSize: 8 },
            margin: { left: 40, right: 40 },
            didDrawPage: (data) => { y = data.cursor.y + 10; }
        });
        y += 20;

        // Tabla Análisis por Audio Esperado
        doc.setFontSize(12);
        doc.text('Análisis por Audio Esperado', 40, y);
        y += 10;
        doc.autoTable({
            html: '#audioAnalysisTable',
            startY: y + 5,
            theme: 'grid',
            headStyles: { fillColor: [40, 167, 69] },
            styles: { fontSize: 8 },
            margin: { left: 40, right: 40 }
        });

        // Guardar PDF
        doc.save('reporte_dsar.pdf');
    }

    downsample(data, maxPoints = 2000) {
        if (data.length <= maxPoints) {
            return data;
        }

        const sampledData = [];
        const bucketSize = Math.ceil(data.length / maxPoints);

        for (let i = 0; i < data.length; i += bucketSize) {
            const bucket = data.slice(i, i + bucketSize);
            
            // Find the point with the highest energy in the bucket (to preserve peaks)
            if (bucket.length > 0) {
                const peakPoint = bucket.reduce((max, p) => p.energy > max.energy ? p : max, bucket[0]);
                sampledData.push(peakPoint);
            }
        }
        
        // Also ensure the last point is included
        if (data.length > 0 && sampledData[sampledData.length - 1] !== data[data.length - 1]) {
             sampledData.push(data[data.length - 1]);
        }

        return sampledData;
    }
}

// Initialize the analyzer when the page loads
let analyzer;
document.addEventListener('DOMContentLoaded', () => {
    analyzer = new DSARAnalyzer();
}); 