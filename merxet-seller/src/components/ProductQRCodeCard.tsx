import React from 'react'
import {QRCodeSVG} from 'qrcode.react'
import {type Product} from '@/lib/productSchemas'
import {priceToDisplayString} from '@/lib/tokenUtils'
import {concatenateIDs} from '@/lib/qrCodeUtils'
import TokenIcon from '@/components/TokenIcon'
import CopyableField from '@/components/CopyableField'
import {BASE_URL, getCurrentConfig} from "@/config.ts";

interface ProductQRCodeCardProps {
  product: Product
  productCatalogueSeed: string
}

const ProductQRCodeCard: React.FC<ProductQRCodeCardProps> = ({product, productCatalogueSeed}) => {
  const config = getCurrentConfig();
  const generateQRData = (product: Product): string => {
    const itemUuid = product.ProductId
    return `${BASE_URL}/#${concatenateIDs(productCatalogueSeed, itemUuid, config.name)}`
  }

  return (
    <div
      className="w-full h-full flex flex-col justify-between max-w-[160px] mx-auto bg-white border-2 border-gray-300 rounded-lg p-3 print:p-2 print:break-inside-avoid print:border-black">
      {/* Product Name */}
      <h3 className="font-bold text-xs mb-2 print:text-[11px] print:mb-1 line-clamp-2 text-center leading-tight">
        {product.Name}
      </h3>

      {/* Price */}
      <div className="flex items-center justify-center gap-1 mb-3 print:mb-2">
        <TokenIcon assetId={product.PriceToken} size={18}/>
        <span className="font-semibold text-sm print:text-[10px] text-green-600">
          {priceToDisplayString(product.PriceToken, product.Price)}
        </span>
      </div>

      {/* QR Code */}
      <div className="flex justify-center mb-2 print:mb-1">
        <div className="bg-white p-1 rounded border print:p-0 print:border-none">
          <QRCodeSVG value={generateQRData(product)} level="L" includeMargin={false} className="print:w-20 print:h-20"/>
        </div>
      </div>

      {/* Product ID using CopyableField - Hidden on print */}
      <div className="flex justify-center print:hidden">
        <CopyableField value={product.ProductId} length={18} mdLength={18} small={true}/>

      </div>
      <div className="flex justify-center print:hidden">
        <CopyableField value={generateQRData(product)} length={18} mdLength={18} small={true}/>
      </div>
      {/* Simplified IDs for print only */}
      <div className="hidden print:block text-[9px] text-gray-500 text-center font-mono space-y-0.5">
        <div>Scan with APTOOSH</div>
        <div>Order Anytime</div>
        {(config.name !== "mainnet") && (
          <div>[{config.name.toUpperCase()}]</div>
        )}
      </div>
    </div>
  )
}

export default ProductQRCodeCard
