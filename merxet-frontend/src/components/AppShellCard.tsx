import * as React from 'react'
import {Link} from 'react-router-dom'

import {APP_NAME} from '@/config'
import {cn} from '@/lib/utils'

import {Card} from '@/components/ui/card'

type AppShellCardProps = React.ComponentProps<'div'>

function AppShellCard({className, children, ...props}: AppShellCardProps) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)} {...props}>
      <div className="border-b border-slate-200/80 bg-slate-50/70 px-6 py-4">
        <Link
          to="/"
          aria-label="Go to main screen"
          className="inline-flex items-center gap-3 rounded-xl text-slate-900 transition-colors hover:text-[#0031FF]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_28px_-18px_rgba(0,49,255,0.45)]">
            <img src="/logo.svg" alt="" className="h-6 w-6" />
          </span>
          <span className="text-lg font-semibold tracking-[-0.02em]">{APP_NAME}</span>
        </Link>
      </div>
      <div className="flex flex-col gap-6 py-6">
        {children}
      </div>
    </Card>
  )
}

export default AppShellCard
