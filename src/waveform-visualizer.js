export class WaveformVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.mrBuffer = null;
        this.micBuffer = null;
        this.duration = 1; // Default to avoid div/0

        this.resizeObserver = new ResizeObserver(() => this.draw());
        this.resizeObserver.observe(this.canvas);

        // Setup initial dimensions
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
    }

    setBuffers(mrBuffer, micBuffer) {
        this.mrBuffer = mrBuffer;
        this.micBuffer = micBuffer;

        // Determine longest duration
        let d1 = mrBuffer ? mrBuffer.duration : 0;
        let d2 = micBuffer ? micBuffer.duration : 0;
        this.duration = Math.max(d1, d2, 1);

        this.draw();
    }

    draw(start = 0, end = this.duration) { // support zoom later if needed
        const { width, height } = this.canvas;
        // Handle HighDPI
        this.canvas.width = width;
        this.canvas.height = height;

        this.ctx.clearRect(0, 0, width, height);

        // Config
        const midY = height / 2;
        const colorMR = '#0ff'; // Cyan
        const colorMic = '#f0f'; // Magenta

        // Draw Divider
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        this.ctx.moveTo(0, midY);
        this.ctx.lineTo(width, midY);
        this.ctx.stroke();

        if (this.mrBuffer) {
            this.drawChannel(this.mrBuffer, colorMR, 0, midY, false); // Top half
        }

        if (this.micBuffer) {
            this.drawChannel(this.micBuffer, colorMic, midY, height, true); // Bottom half
        }
    }

    drawChannel(buffer, color, topY, bottomY, inverted) {
        const data = buffer.getChannelData(0); // Use first channel
        const step = Math.ceil(data.length / this.canvas.width);
        const amp = (bottomY - topY) / 2;
        const centerY = topY + amp;

        this.ctx.fillStyle = color;
        this.ctx.beginPath();

        for (let i = 0; i < this.canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;

            // Peak sampling for this pixel slice
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }

            // Draw bar
            // Logic: Draw from center outward
            // Simple render: min/max amplitude

            // Normalize Height relative to channel height
            const h = Math.max(max, -min) * amp * 0.9; // 0.9 padding

            if (inverted) {
                // Bottom Half: Grow Down
                this.ctx.fillRect(i, topY, 1, h);
                // Actually better -> Mirror from center
                // Center is topY (if full bottom half?)
                // Let's stick to symmetrical wave centered in the band
            } else {
                // Top Half
            }

            // Re-think: Symmetrical wave around Band Center
            this.ctx.fillRect(i, centerY - h, 1, h * 2);
        }
    }

    drawPlayhead(time) {
        // We redraw the whole thing OR overlay?
        // Overlay is cheaper but clearing canvas clears waveform.
        // Better: static canvas for wave + overlay canvas for head?
        // Or just redraw everything? 
        // For efficiency in JS on Mobile, maybe overlay div is better?
        // But user asked for canvas player. Let's just use overlay line logic or separate layer.
        // For simplicity: Clear and Redraw is fine if optimized, but sampling huge arrays 60fps is bad.
        // OPTIMIZATION:
        // Draw waveform ONCE to an offscreen canvas or use the existing canvas content?
        // Actually, just moving a DIV line over the canvas is the most performant way for the playhead.
        // I will implement the playhead as a DOM overlay in index.html to avoid constant re-rendering of audio data.
    }
}
