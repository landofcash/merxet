import {useEffect} from 'react'
import {useNavigate, useLocation} from 'react-router-dom'
import {decodeConcatenatedIDs} from '@/lib/qrCodeUtils'

/**
 * Component that checks for QR code data in URL hash fragments and redirects accordingly.
 * This handles cases where users access the app via URLs with embedded QR data.
 * Uses hash fragments (#) instead of query parameters to avoid routing conflicts.
 */
const UrlParserAndRedirector: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Only process URLs on specific entry points to prevent redirect loops
    const allowedPaths = ['/', '/scan']
    if (!allowedPaths.includes(location.pathname)) {
      return
    }

    const checkUrlForQrData = () => {
      try {
        // Check for hash fragment
        const hash = location.hash
        if (!hash || hash.length <= 1) {
          return
        }

        // Remove the '#' and decode the data
        const hashData = hash.substring(1)

        // Check if the hash data has the expected length for QR codes (44 characters)
        // QR codes use two 22-character base64-encoded UUIDs concatenated together
        if (hashData.length !== 44 && hashData.length !== 45) {
          // Not a valid QR code hash, clear it and return
          window.location.hash = ''
          return
        }

        // Try to decode as base64 QR data
        const [productSeed, itemId, network] = decodeConcatenatedIDs(hashData)
        //console.log('Decoded QR data:', productSeed, itemId)
        // Navigate to the product details page with the decoded data
        navigate('/product-details', {
          state: {productSeed, itemId, network},
          replace: true // Replace the current history entry to avoid back button issues
        })

        // Clear the hash to prevent re-triggering
        window.location.hash = ''
      } catch (error) {
        console.error('Failed to parse URL hash QR data:', error)
        // If parsing fails, we don't redirect and let the user continue normally
        // Clear invalid hash
        window.location.hash = ''
      }
    }

    // Only check when hash exists
    if (location.hash) {
      checkUrlForQrData()
    }
  }, [location.hash, location.pathname, navigate])

  // This component doesn't render anything
  return null
}

export default UrlParserAndRedirector
