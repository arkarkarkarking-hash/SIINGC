import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  videoElement?: HTMLVideoElement | null;
  className?: string;
  width?: number;
  height?: number;
}

export const Visualizer: React.FC<VisualizerProps> = ({ 
  videoElement, 
  className,
  width = 640,
  height = 360
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // 1. Draw Video Background
      if (videoElement && (videoElement.readyState >= 2 || videoElement.srcObject)) {
        // Draw the video frame to cover the canvas
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      } else {
        // Clear with background color if no video
        ctx.fillStyle = '#0f172a'; // Slate-900
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Note: Audio waveform bars have been removed as requested.
      // The canvas is now used purely to composite the video frame for the export recorder.

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [videoElement]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className={className}
    />
  );
};