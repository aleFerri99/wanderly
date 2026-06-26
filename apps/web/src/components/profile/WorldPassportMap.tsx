'use client'
// WorldPassportMap — caricato solo client-side (niente SSR per Leaflet/SVG)
// react-simple-maps usa topojson world-atlas 110m (50KB) da CDN
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback } from 'react'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — react-simple-maps non ha @types, ignorare è corretto qui
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'

// world-atlas usa ID numerici ISO 3166-1 — mappa verso Alpha-2 per confronto
// con i codici della nostra tabella user_visited_countries
const NUM_TO_A2: Record<string, string> = {
  '4':'AF','8':'AL','12':'DZ','20':'AD','24':'AO','28':'AG','32':'AR','51':'AM',
  '36':'AU','40':'AT','31':'AZ','44':'BS','48':'BH','50':'BD','52':'BB','112':'BY',
  '56':'BE','84':'BZ','204':'BJ','64':'BT','68':'BO','70':'BA','72':'BW','76':'BR',
  '96':'BN','100':'BG','854':'BF','108':'BI','132':'CV','116':'KH','120':'CM',
  '124':'CA','140':'CF','148':'TD','152':'CL','156':'CN','170':'CO','174':'KM',
  '178':'CG','180':'CD','188':'CR','384':'CI','191':'HR','192':'CU','196':'CY',
  '203':'CZ','208':'DK','262':'DJ','212':'DM','214':'DO','218':'EC','818':'EG',
  '222':'SV','226':'GQ','232':'ER','233':'EE','748':'SZ','231':'ET','242':'FJ',
  '246':'FI','250':'FR','266':'GA','270':'GM','268':'GE','276':'DE','288':'GH',
  '300':'GR','308':'GD','320':'GT','324':'GN','624':'GW','328':'GY','332':'HT',
  '340':'HN','348':'HU','352':'IS','356':'IN','360':'ID','364':'IR','368':'IQ',
  '372':'IE','376':'IL','380':'IT','388':'JM','392':'JP','400':'JO','398':'KZ',
  '404':'KE','296':'KI','408':'KP','410':'KR','414':'KW','417':'KG','418':'LA',
  '428':'LV','422':'LB','426':'LS','430':'LR','434':'LY','438':'LI','440':'LT',
  '442':'LU','450':'MG','454':'MW','458':'MY','462':'MV','466':'ML','470':'MT',
  '584':'MH','478':'MR','480':'MU','484':'MX','583':'FM','498':'MD','492':'MC',
  '496':'MN','499':'ME','504':'MA','508':'MZ','104':'MM','516':'NA','520':'NR',
  '524':'NP','528':'NL','554':'NZ','558':'NI','562':'NE','566':'NG','807':'MK',
  '578':'NO','512':'OM','586':'PK','585':'PW','275':'PS','591':'PA','598':'PG',
  '600':'PY','604':'PE','608':'PH','616':'PL','620':'PT','634':'QA','642':'RO',
  '643':'RU','646':'RW','659':'KN','662':'LC','670':'VC','882':'WS','674':'SM',
  '678':'ST','682':'SA','686':'SN','688':'RS','690':'SC','694':'SL','702':'SG',
  '703':'SK','705':'SI','90':'SB','706':'SO','710':'ZA','728':'SS','724':'ES',
  '144':'LK','729':'SD','740':'SR','752':'SE','756':'CH','760':'SY','158':'TW',
  '762':'TJ','834':'TZ','764':'TH','626':'TL','768':'TG','776':'TO','780':'TT',
  '788':'TN','792':'TR','795':'TM','798':'TV','800':'UG','804':'UA','784':'AE',
  '826':'GB','840':'US','858':'UY','860':'UZ','548':'VU','336':'VA','862':'VE',
  '704':'VN','887':'YE','894':'ZM','716':'ZW',
}

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

interface Props {
  visitedCodes: Set<string>
  onCountryClick?: (code: string) => void
}

export function WorldPassportMap({ visitedCodes, onCountryClick }: Props) {
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: [10, 20],
    zoom: 1,
  })

  // setTimeout(0) sposta setPosition dopo il render corrente di D3/react-simple-maps,
  // evitando "Cannot update during render" di React 18 Concurrent Mode
  const handleMoveEnd = useCallback((pos: any) => {
    setTimeout(() => {
      setPosition({ zoom: pos.zoom, coordinates: pos.coordinates })
    }, 0)
  }, [])

  const handleCountryClick = useCallback((code: string) => {
    onCountryClick?.(code)
  }, [onCountryClick])

  return (
    <div className="wpm-wrap">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120, center: [10, 20] }}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup
          zoom={position.zoom}
          center={position.coordinates}
          onMoveEnd={handleMoveEnd}
          minZoom={1}
          maxZoom={8}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }: any) =>
              geographies.map((geo: any) => {
                const alpha2 = NUM_TO_A2[String(geo.id)] ?? null
                const visited = alpha2 ? visitedCodes.has(alpha2) : false
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    tabIndex={-1}
                    onClick={() => alpha2 && handleCountryClick(alpha2)}
                    style={{
                      default: {
                        fill:        visited ? 'var(--md-primary,#7C3AED)' : 'var(--md-surface-container,#EEECF8)',
                        stroke:      'var(--md-surface,#FAFAFA)',
                        strokeWidth: 0.4,
                        outline:     'none',
                        cursor:      alpha2 ? 'pointer' : 'default',
                        transition:  'fill 0.2s',
                      },
                      hover: {
                        fill:        visited ? '#5B21B6' : 'var(--md-primary-container,#EDE9FE)',
                        stroke:      'var(--md-surface,#FAFAFA)',
                        strokeWidth: 0.4,
                        outline:     'none',
                      },
                      pressed: {
                        fill:    'var(--md-primary-container,#EDE9FE)',
                        outline: 'none',
                      },
                    }}
                  />
                )
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      <div className="wpm-hint">Pizzica per zoomare · trascina per spostarti</div>

      <style jsx>{`
        .wpm-wrap {
          width: 100%; height: 240px; position: relative;
          background: var(--md-surface-container-low, #F4F4F5);
          border-radius: var(--md-radius-xl, 24px);
          overflow: hidden;
        }
        .wpm-hint {
          position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
          font-size: 0.65rem; color: var(--md-outline, #A1A1AA);
          background: rgba(255,255,255,0.75); backdrop-filter: blur(4px);
          padding: 2px 10px; border-radius: 99px; white-space: nowrap;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
