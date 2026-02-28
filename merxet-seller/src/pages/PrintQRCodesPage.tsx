import React, {useState, useEffect} from 'react'
import {useSearchParams} from 'react-router-dom'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {QRCodeSVG} from 'qrcode.react'
import {ProductCatalogueSchema, type Product} from '@/lib/productSchemas'
import CopyableField from '@/components/CopyableField'
import ProductQRCodeCard from '@/components/ProductQRCodeCard'
import {Printer, ArrowLeft, ExternalLink, Eye} from 'lucide-react'
import {Link} from 'react-router-dom'

const PrintQRCodesPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const catalogueUrl = searchParams.get('url')
  const seed = searchParams.get('seed') // Now using seed instead of boxName
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCatalogue = async () => {
      if (!catalogueUrl) {
        setError('No catalogue URL provided')
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch(catalogueUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch catalogue: ${response.status}`)
        }

        const data = await response.json()
        const parsedProducts = ProductCatalogueSchema.parse(data)
        setProducts(parsedProducts)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load catalogue')
      } finally {
        setIsLoading(false)
      }
    }

    loadCatalogue()
  }, [catalogueUrl])

  const handlePrint = () => {
    window.print()
  }

  if (isLoading) {
    return (
      <div className="px-4 py-8">
        <Card className="w-full max-w-7xl mx-auto">
          <CardContent className="flex items-center justify-center py-16">
            <div className="text-muted-foreground">Loading catalogue...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-8">
        <Card className="w-full max-w-7xl mx-auto">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
            <Link to="/" className="inline-block mt-4">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2"/>
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="px-4 py-8">
      {/* Header - Hidden when printing */}
      <div className="print:hidden mb-6">
        <Card className="w-full max-w-7xl mx-auto">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <QRCodeSVG value="test" size={24}/>
                Print QR Code Stickers ({products.length} products)
              </CardTitle>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                <Link to="/" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto">
                    <ArrowLeft className="h-4 w-4 mr-2"/>
                    Back
                  </Button>
                </Link>
                <Button onClick={handlePrint} className="w-full sm:w-auto">
                  <Printer className="h-4 w-4 mr-2"/>
                  Print
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Seed:</span>
              <CopyableField value={seed || ''} length={12}/>
              <span className="text-sm text-muted-foreground">
                ({products.length} products)
              </span>
            </div>

            {/* Product Demo Catalogue Link */}
            {seed && (
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 p-4 rounded-lg">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 mb-1">
                      🛍️ Product Demo Catalogue
                    </h3>
                    <p className="text-sm text-blue-700">
                      Preview how your products look to customers in the interactive shopping experience
                    </p>
                  </div>
                  <a
                    href={`https://promo.aptoosh.com/${seed}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 w-full sm:w-auto justify-center"
                  >
                    <Eye className="h-4 w-4" />
                    View Demo Store
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* QR Code Grid - Optimized for printing */}
      <div className="w-full max-w-7xl mx-auto">
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 print:grid-cols-6 print:gap-x-2 print:gap-y-4">
          {products.map((product) => (
            <ProductQRCodeCard key={product.ProductId} product={product} productCatalogueSeed={seed || ''}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default PrintQRCodesPage
