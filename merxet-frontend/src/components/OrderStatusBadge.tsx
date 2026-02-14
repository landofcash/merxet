import React from 'react'
import { getOrderStatusText, getOrderStatusColor } from '@/lib/orderStatusUtils'

interface OrderStatusBadgeProps {
  status: string
  className?: string
}

const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status, className = '' }) => {
  const statusText = getOrderStatusText(status)
  const statusColor = getOrderStatusColor(status)

  return (
    <span 
      className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor} ${className}`}
    >
      {statusText}
    </span>
  )
}

export default OrderStatusBadge