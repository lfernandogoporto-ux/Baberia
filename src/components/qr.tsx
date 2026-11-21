import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { IconCamera, IconX } from './icons'

/** Código QR dibujado en el navegador (no usa servicios externos) */
export function QR({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    void QRCode.toDataURL(value, { width: size * 2, margin: 1, color: { dark: '#172036', light: '#ffffff' } }).then(setSrc)
  }, [value, size])
  if (!src) return <div style={{ width: size, height: size }} />
  return <img src={src} width={size} height={size} alt={label} style={{ display: 'block', borderRadius: 12, background: '#fff', padding: 6 }} />
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
declare global {
  interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
}
export const canScan = () => typeof window !== 'undefined' && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia

/** Lector de QR con la cámara (Chrome en Android). Devuelve el texto leído. */
export function Scanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let stop = false
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!video.current) return
        video.current.srcObject = stream
        await video.current.play()
        const det = new window.BarcodeDetector!({ formats: ['qr_code'] })
        const tick = async () => {
          if (stop || !video.current) return
          try {
            const codes = await det.detect(video.current)
            if (codes[0]?.rawValue) { onResult(codes[0].rawValue); return }
          } catch { /* sigue intentando */ }
          setTimeout(() => void tick(), 250)
        }
        void tick()
      } catch {
        setError('No pudimos abrir la cámara. Revisa el permiso de cámara del navegador.')
      }
    })()
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [onResult])

  return (
    <div className="sheet-back" style={{ alignItems: 'center' }}>
      <div className="sheet stack" style={{ borderRadius: 18 }} role="dialog" aria-modal="true" aria-label="Escanear tarjeta">
        <div className="row between">
          <h2 className="row"><IconCamera />Escanear tarjeta</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Cerrar"><IconX /></button>
        </div>
        {error ? <p className="ink2">{error}</p> : (
          <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '1', objectFit: 'cover' }} />
        )}
        <p className="muted small">Apunta al QR de la tarjeta del cliente.</p>
      </div>
    </div>
  )
}
