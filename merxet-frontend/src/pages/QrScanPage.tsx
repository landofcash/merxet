import {useEffect, useRef, useState, useCallback} from 'react'
import {BrowserMultiFormatReader} from '@zxing/browser'
import {Button} from '@/components/ui/button'
import {CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {ArrowLeft, Camera} from 'lucide-react'
import {Link, useNavigate} from 'react-router-dom'
import AppShellCard from '@/components/AppShellCard'
import {decodeConcatenatedIDs} from '@/lib/qrCodeUtils'

/**
 * Extracts QR code data from a scanned result.
 * Simple logic: Find the last occurrence of '#' and take everything after it.
 * If no '#' exists, take the whole string.
 */
function extractQrData(scannedText: string): string {
  const trimmedText = scannedText.trim()

  // Find the last occurrence of '#'
  const lastHashIndex = trimmedText.lastIndexOf('#')

  if (lastHashIndex === -1) {
    // No '#' found, return the whole string
    return trimmedText
  }

  // Return everything after the last '#'
  return trimmedText.substring(lastHashIndex + 1)
}

function QrScanPage() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<BrowserMultiFormatReader>(null)
  const controlsRef = useRef<{ stop: () => void }>(null)
  const [error, setError] = useState<string>('')
  const [scanning, setScanning] = useState(false)

  const initializeScanner = useCallback(async () => {
    try {
      // Initialize the code reader if not already initialized
      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader()
      }
      if (!videoRef.current) return
      setError('')
      // Use decodeFromConstraints directly, no need to call getUserMedia or list devices
      const controls = await codeReaderRef.current.decodeFromConstraints(
        {
          video: {facingMode: {ideal: 'environment'}}
        },
        videoRef.current,
        (result, err) => {
          if (result) {
            try {
              const scannedText = result.getText()
              const qrCodeData = extractQrData(scannedText)
              const [productSeed, itemId, network] = decodeConcatenatedIDs(qrCodeData)
              // Clear the URL hash immediately to prevent redirect loops
              window.location.hash = ''
              setScanning(false)
              navigate('/product-details', {state: {productSeed, itemId, network}})
            } catch (e) {
              console.error('QR processing error:', e)
              const errorMessage = e instanceof Error ? e.message : 'Unknown error'
              setError(`Invalid QR code: ${errorMessage}`)
              setScanning(false)
            }
          }
          if (err && !err.name.startsWith('NotFoundException')) {
            console.error('Scanning error:', err)
          }
        }
      )
      controlsRef.current = controls
    } catch (err) {
      console.error('Camera error:', err)
      setError('Failed to access camera. Please ensure camera permissions are granted.')
      setScanning(false)
    }
  }, [navigate, setScanning])

  useEffect(() => {
    if (!scanning) return
    initializeScanner()
    // Cleanup function
    return () => {
      if (controlsRef.current) {
        controlsRef.current.stop()
        controlsRef.current = null
      }
    }
  }, [scanning, initializeScanner])

  const toggleScanning = () => {
    setError('') // Clear error
    setScanning(prev => {
      const next = !prev
      if (next) initializeScanner() // Only initialize on user action
      else {
        if (controlsRef.current) controlsRef.current.stop()
      }
      return next
    })
  }

  return (
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold">Scan QR Code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
            {scanning ? (
              <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay playsInline muted/>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center" onClick={toggleScanning}>
                <Camera className="h-12 w-12 text-muted-foreground"/>
              </div>
            )}
          </div>
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive rounded-md">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}
          <Button className="w-full" size="lg" onClick={toggleScanning}>
            {scanning ? 'Stop Scanning' : 'Start Scanning'}
          </Button>

          {/* Information about supported formats */}
          <div className="text-xs text-muted-foreground text-center space-y-1">
            <p>📱 Supports Merxet QR codes</p>
          </div>
        </CardContent>
      </AppShellCard>
    </div>
  )
}

export default QrScanPage
