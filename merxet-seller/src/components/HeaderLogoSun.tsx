import React from 'react'

const HeaderLogoSun: React.FC = () => {
  return (
    <>
          {/* Centered logo recolored via CSS mask — colors only changed */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none
      drop-shadow-[0_0_26px_rgba(255,170,210,0.45)]"
        style={{
          width: '200px',
          height: '200px',
          WebkitMaskImage: `url(/aptos-logo.svg)`,
          maskImage: `url(/aptos-logo.svg)`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          // gentle iridescent fill (cool pink → mint → soft cyan → mint → pink)
          background:
            'linear-gradient(90deg, oklch(0.86 0.05 340) 0%, oklch(0.91 0.06 160) 25%, oklch(0.92 0.03 240) 50%, oklch(0.91 0.06 160) 75%, oklch(0.86 0.05 340) 100%)'
        }}
      />
    </>

  )
}

export default HeaderLogoSun
