import React, { useCallback } from 'react'
import { Upload } from 'lucide-react'

export function UploadZone({ onFileSelect }) {
    const handleDrop = useCallback((e) => {
        e.preventDefault()
        e.stopPropagation()
        const files = e.dataTransfer.files
        if (files && files[0]) {
            onFileSelect(files[0])
        }
    }, [onFileSelect])

    const handleDragOver = (e) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            onFileSelect(e.target.files[0])
        }
    }

    return (
        <div
            className="glass upload-zone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            style={{
                border: '2px dashed var(--glass-border)',
                borderRadius: '16px',
                padding: '3rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem'
            }}
        >
            <input
                type="file"
                accept="audio/*"
                onChange={handleChange}
                style={{ display: 'none' }}
                id="mr-upload"
            />
            <label htmlFor="mr-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
                <div style={{
                    background: 'var(--glass-bg)',
                    padding: '1.5rem',
                    borderRadius: '50%',
                    color: 'var(--primary-color)'
                }}>
                    <Upload size={32} />
                </div>
                <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Upload Backing Track (MR)</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Drag & drop or click to browse</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Supports MP3, WAV</p>
                </div>
            </label>
        </div>
    )
}
