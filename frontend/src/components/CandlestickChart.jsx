import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Compute Simple Moving Average over `window` periods. */
function computeSMA(candles, window) {
  const result = []
  for (let i = window - 1; i < candles.length; i++) {
    const slice = candles.slice(i - window + 1, i + 1)
    const avg = slice.reduce((s, c) => s + c.close, 0) / window
    result.push({ time: candles[i].time, value: avg })
  }
  return result
}

/** Compute Exponential Moving Average over `period` periods. */
function computeEMA(candles, period) {
  if (candles.length < period) return []
  const result = []
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  result.push({ time: candles[period - 1].time, value: ema })
  
  const k = 2 / (period + 1)
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k)
    result.push({ time: candles[i].time, value: ema })
  }
  return result
}

/** Compute Bollinger Bands (period, stdDev) */
function computeBollingerBands(candles, period = 20, stdDevMultiplier = 2) {
  if (candles.length < period) return { upper: [], middle: [], lower: [] }
  const upper = []
  const middle = []
  const lower = []
  
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const avg = slice.reduce((s, c) => s + c.close, 0) / period
    const variance = slice.reduce((s, c) => s + Math.pow(c.close - avg, 2), 0) / period
    const stdDev = Math.sqrt(variance)
    const time = candles[i].time
    
    middle.push({ time, value: avg })
    upper.push({ time, value: avg + stdDevMultiplier * stdDev })
    lower.push({ time, value: avg - stdDevMultiplier * stdDev })
  }
  return { upper, middle, lower }
}

/** Format volume in US notation. */
function fmtVol(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
  return String(v)
}

/** Format price in USD. */
function fmtPrice(p) {
  return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Convert a UTC unix timestamp to ET display string. */
function toET(ts) {
  const d = new Date(ts * 1000)
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

const EMPTY_ARRAY = []

export default function CandlestickChart({ data = EMPTY_ARRAY, height = 480, symbol, spikes = EMPTY_ARRAY, latestTick }) {
  const containerRef = useRef(null)
  
  // Chart and Series Refs
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const lineSeriesRef = useRef(null)
  const areaSeriesRef = useRef(null)
  const volSeriesRef = useRef(null)
  const smaSeriesRef = useRef(null)
  const emaSeriesRef = useRef(null)
  const bbUpperSeriesRef = useRef(null)
  const bbMiddleSeriesRef = useRef(null)
  const bbLowerSeriesRef = useRef(null)
  
  // Helper Refs to prevent closures
  const priceLineRef = useRef(null)
  const chartTypeRef = useRef('candle')

  // User Toggles & Option States
  const [chartType, setChartType] = useState('candle')
  const [showSMA, setShowSMA] = useState(true)
  const [showEMA, setShowEMA] = useState(false)
  const [showBB, setShowBB] = useState(false)
  
  // Hover Legend OHLC state
  const [ohlcInfo, setOhlcInfo] = useState(null)

  // 1. Reset fit content flag when instrument symbol changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current._hasFitContent = false
    }
  }, [symbol])

  // 2. Sync chartType state to Ref to avoid stale closure in event handlers
  useEffect(() => {
    chartTypeRef.current = chartType
  }, [chartType])

  // 3. Initialize Chart Instance (Once on Mount)
  useEffect(() => {
    if (!containerRef.current) return

    // ── Chart instance ──
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: "'Inter', 'DM Sans', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.06)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(148, 163, 184, 0.06)', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(99, 102, 241, 0.6)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: 'var(--accent-primary)',
        },
        horzLine: {
          color: 'rgba(99, 102, 241, 0.6)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: 'var(--accent-primary)',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.12)',
        scaleMargins: { top: 0.06, bottom: 0.26 },
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.12)',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
        tickMarkFormatter: (time, tickMarkType) => {
          const d = new Date(time * 1000)
          const etStr = d.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit', minute: '2-digit', hour12: false,
            day: 'numeric', month: 'short', year: '2-digit',
          })
          const parts = etStr.split(', ')
          const timePart = parts[parts.length - 1] || ''
          const datePart = parts.slice(0, -1).join(', ')
          const [h, m] = timePart.split(':')
          if (tickMarkType <= 1) return datePart.split(' ').slice(0, 2).join(' ')
          if (tickMarkType === 2) return datePart
          if (h === '09' && m === '30') return `${datePart}\n09:30 ET`
          return `${h}:${m}`
        },
      },
      localization: {
        priceFormatter: fmtPrice,
        timeFormatter: (time) => toET(time) + ' ET',
      },
    })

    // ── Series Initializations ──

    // Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#34d399',
      wickDownColor: '#fb7185',
      priceLineVisible: false,
    })
    candleSeriesRef.current = candleSeries

    // Line Series
    const lineSeries = chart.addLineSeries({
      color: 'var(--accent-primary)',
      lineWidth: 2,
      priceLineVisible: false,
    })
    lineSeriesRef.current = lineSeries

    // Area Series
    const areaSeries = chart.addAreaSeries({
      topColor: 'rgba(59, 130, 246, 0.4)',
      bottomColor: 'rgba(59, 130, 246, 0.0)',
      lineColor: 'var(--accent-primary)',
      lineWidth: 2,
      priceLineVisible: false,
    })
    areaSeriesRef.current = areaSeries

    // Volume histogram (separate price scale)
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol_scale',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('vol_scale').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })
    volSeriesRef.current = volumeSeries

    // SMA 20 line
    const smaSeries = chart.addLineSeries({
      color: 'rgba(251, 191, 36, 0.85)',
      lineWidth: 1.5,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      title: 'SMA20',
    })
    smaSeriesRef.current = smaSeries

    // EMA 9 line
    const emaSeries = chart.addLineSeries({
      color: '#c084fc',
      lineWidth: 1.5,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      title: 'EMA9',
    })
    emaSeriesRef.current = emaSeries

    // Bollinger Bands lines
    const bbColor = 'rgba(6, 182, 212, 0.35)'
    const bbMiddleColor = 'rgba(6, 182, 212, 0.2)'
    const bbUpperSeries = chart.addLineSeries({
      color: bbColor,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
    })
    const bbMiddleSeries = chart.addLineSeries({
      color: bbMiddleColor,
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
    })
    const bbLowerSeries = chart.addLineSeries({
      color: bbColor,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
    })
    bbUpperSeriesRef.current = bbUpperSeries
    bbMiddleSeriesRef.current = bbMiddleSeries
    bbLowerSeriesRef.current = bbLowerSeries

    chartRef.current = chart

    // ── Live OHLC legend subscription ──
    const handleCrosshairMove = (param) => {
      if (!param.time) return
      
      const activeSeries = chartTypeRef.current === 'candle' ? candleSeriesRef.current
                         : chartTypeRef.current === 'line' ? lineSeriesRef.current
                         : areaSeriesRef.current
      if (!activeSeries) return

      const candle = param.seriesData?.get(activeSeries)
      const vol = param.seriesData?.get(volumeSeries)
      if (candle) {
        setOhlcInfo((prev) => ({
          ...prev,
          open: candle.open ?? candle.value,
          high: candle.high ?? candle.value,
          low: candle.low ?? candle.value,
          close: candle.close ?? candle.value,
          volume: vol?.value ?? prev?.volume ?? 0,
          change: prev?.change,
          time: param.time,
        }))
      }
    }
    chart.subscribeCrosshairMove(handleCrosshairMove)

    // ── Prevent wheel propagation to block parent scroll ──
    const handleWheel = (e) => {
      e.stopPropagation()
    }
    const container = containerRef.current
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: true })
    }

    // ── Theme observer ──
    const applyThemeOptions = (themeName) => {
      const isLight = themeName === 'light'
      chart.applyOptions({
        layout: {
          textColor: isLight ? '#475569' : '#94a3b8',
        },
        grid: {
          vertLines: { color: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(148, 163, 184, 0.06)' },
          horzLines: { color: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(148, 163, 184, 0.06)' },
        },
        rightPriceScale: {
          borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(148, 163, 184, 0.12)',
        },
        timeScale: {
          borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(148, 163, 184, 0.12)',
        }
      })
    }

    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'
      applyThemeOptions(currentTheme)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    applyThemeOptions(document.documentElement.getAttribute('data-theme') || 'dark')

    // ── Resize handler ──
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    const ro = new ResizeObserver(handleResize)
    ro.observe(containerRef.current)
    window.addEventListener('resize', handleResize)

    return () => {
      observer.disconnect()
      if (container) {
        container.removeEventListener('wheel', handleWheel)
      }
      window.removeEventListener('resize', handleResize)
      ro.disconnect()
      chart.unsubscribeCrosshairMove(handleCrosshairMove)
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      lineSeriesRef.current = null
      areaSeriesRef.current = null
      volSeriesRef.current = null
      smaSeriesRef.current = null
      emaSeriesRef.current = null
      bbUpperSeriesRef.current = null
      bbMiddleSeriesRef.current = null
      bbLowerSeriesRef.current = null
    }
  }, [height])

  // 4. Update Data and Visibility (Whenever data, spikes, or toggles change)
  useEffect(() => {
    const chart = chartRef.current
    const candleSeries = candleSeriesRef.current
    const lineSeries = lineSeriesRef.current
    const areaSeries = areaSeriesRef.current
    const volumeSeries = volSeriesRef.current
    const smaSeries = smaSeriesRef.current
    const emaSeries = emaSeriesRef.current
    const bbUpper = bbUpperSeriesRef.current
    const bbMiddle = bbMiddleSeriesRef.current
    const bbLower = bbLowerSeriesRef.current

    if (!chart || !candleSeries || !lineSeries || !areaSeries || !volumeSeries) return

    // Apply visibility parameters
    candleSeries.applyOptions({ visible: chartType === 'candle' })
    lineSeries.applyOptions({ visible: chartType === 'line' })
    areaSeries.applyOptions({ visible: chartType === 'area' })
    smaSeries.applyOptions({ visible: showSMA })
    emaSeries.applyOptions({ visible: showEMA })
    bbUpper.applyOptions({ visible: showBB })
    bbMiddle.applyOptions({ visible: showBB })
    bbLower.applyOptions({ visible: showBB })

    if (!data || data.length === 0) return

    // Parse and sort candles
    const candles = data
      .map((d) => ({
        time: typeof d.time === 'string'
          ? Math.floor(new Date(d.time).getTime() / 1000)
          : Number(d.time),
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close),
      }))
      .filter((c) => !isNaN(c.time) && c.time > 0)
      .sort((a, b) => a.time - b.time)
      .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time)

    const volumes = data
      .map((d) => ({
        time: typeof d.time === 'string'
          ? Math.floor(new Date(d.time).getTime() / 1000)
          : Number(d.time),
        value: Number(d.volume) || 0,
        color: Number(d.close) >= Number(d.open)
          ? 'rgba(16, 185, 129, 0.35)'
          : 'rgba(244, 63, 94, 0.35)',
      }))
      .filter((v) => !isNaN(v.time) && v.time > 0)
      .sort((a, b) => a.time - b.time)
      .filter((v, i, arr) => i === 0 || v.time !== arr[i - 1].time)

    // Set chart series data for all representations to keep them in sync
    candleSeries.setData(candles)
    const lineData = candles.map(c => ({ time: c.time, value: c.close }))
    lineSeries.setData(lineData)
    areaSeries.setData(lineData)
    volumeSeries.setData(volumes)

    // Compute and set indicators
    if (showSMA && candles.length >= 20) {
      smaSeries.setData(computeSMA(candles, 20))
    } else {
      smaSeries.setData([])
    }

    if (showEMA && candles.length >= 9) {
      emaSeries.setData(computeEMA(candles, 9))
    } else {
      emaSeries.setData([])
    }

    if (showBB && candles.length >= 20) {
      const { upper, middle, lower } = computeBollingerBands(candles, 20, 2)
      bbUpper.setData(upper)
      bbMiddle.setData(middle)
      bbLower.setData(lower)
    } else {
      bbUpper.setData([])
      bbMiddle.setData([])
      bbLower.setData([])
    }

    // ── LTP dashed price line ──
    const last = candles[candles.length - 1]
    const targetSeries = chartType === 'candle' ? candleSeries : chartType === 'line' ? lineSeries : areaSeries

    // Clean up old LTP lines
    if (priceLineRef.current) {
      try { candleSeries.removePriceLine(priceLineRef.current) } catch (e) {}
      try { lineSeries.removePriceLine(priceLineRef.current) } catch (e) {}
      try { areaSeries.removePriceLine(priceLineRef.current) } catch (e) {}
      priceLineRef.current = null
    }

    const newPriceLine = targetSeries.createPriceLine({
      price: last.close,
      color: last.close >= last.open ? '#10b981' : '#f43f5e',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'LTP',
    })
    priceLineRef.current = newPriceLine

    // ── Spikes/Markers ──
    if (spikes && spikes.length > 0) {
      const markers = []
      spikes.forEach(spike => {
        const spikeDate = new Date(spike.Spike_Time.replace(' ', 'T'))
        const spikeTimeSec = Math.floor(spikeDate.getTime() / 1000)

        const match = candles.find(c => {
          const diff = Math.abs(c.time - spikeTimeSec)
          return diff < 60
        })

        if (match) {
          const pct = parseFloat(spike.pct_change)
          const isUp = pct >= 0
          markers.push({
            time: match.time,
            position: isUp ? 'belowBar' : 'aboveBar',
            color: isUp ? '#22e87a' : '#f56551',
            shape: isUp ? 'arrowUp' : 'arrowDown',
            text: `Spike: ${isUp ? '+' : ''}${pct.toFixed(2)}%`,
          })
        }
      })

      const uniqueMarkers = []
      const markerMap = {}
      markers.forEach(m => {
        const currentPctStr = m.text.replace('Spike: ', '').replace('%', '')
        const currentPctVal = Math.abs(parseFloat(currentPctStr))
        if (!markerMap[m.time]) {
          markerMap[m.time] = m
        } else {
          const existingPctStr = markerMap[m.time].text.replace('Spike: ', '').replace('%', '')
          const existingPctVal = Math.abs(parseFloat(existingPctStr))
          if (currentPctVal > existingPctVal) {
            markerMap[m.time] = m
          }
        }
      })
      for (const time in markerMap) {
        uniqueMarkers.push(markerMap[time])
      }

      uniqueMarkers.sort((a, b) => a.time - b.time)
      targetSeries.setMarkers(uniqueMarkers)
    } else {
      candleSeries.setMarkers([])
      lineSeries.setMarkers([])
      areaSeries.setMarkers([])
    }

    // Set initial legend info
    const totalVol = volumes.reduce((s, v) => s + v.value, 0)
    const changePct = candles.length > 1
      ? ((last.close - candles[0].open) / candles[0].open) * 100
      : 0
    setOhlcInfo({
      open: last.open,
      high: Math.max(...candles.map((c) => c.high)),
      low: Math.min(...candles.map((c) => c.low)),
      close: last.close,
      volume: totalVol,
      change: changePct,
      time: last.time,
    })

    // Fit content once for initial load
    if (!chartRef.current._hasFitContent) {
      chart.timeScale().fitContent()
      chartRef.current._hasFitContent = true
    }
  }, [data, spikes, chartType, showSMA, showEMA, showBB, symbol])

  // Reset lastBarRef when data changes
  const lastBarRef = useRef(null)
  useEffect(() => {
    lastBarRef.current = null
  }, [data])

  // 5. Handle real-time updates from latestTick
  useEffect(() => {
    if (!latestTick) return
    const chart = chartRef.current
    const candleSeries = candleSeriesRef.current
    const lineSeries = lineSeriesRef.current
    const areaSeries = areaSeriesRef.current
    const volumeSeries = volSeriesRef.current
    
    if (!chart || !candleSeries || !lineSeries || !areaSeries || !volumeSeries) return

    // Convert tick time to unix seconds (rounded to start of the minute)
    let tickTime = new Date()
    const tickTimeStr = latestTick.ts || latestTick.last_trade_time
    if (tickTimeStr) {
      // Handle format like '2026-05-27 15:29:59+05:30' or ISO
      tickTime = new Date(tickTimeStr.replace(' ', 'T'))
    }
    
    // Round to minute start
    const timeSec = Math.floor(tickTime.getTime() / 60000) * 60

    const ltp = Number(latestTick.ltp)
    if (isNaN(ltp)) return

    // Find the last bar
    let lastBar = lastBarRef.current
    if (!lastBar && data.length > 0) {
      // Parse last candle from data prop
      const d = data[data.length - 1]
      const lastTime = typeof d.time === 'string'
        ? Math.floor(new Date(d.time).getTime() / 1000)
        : Number(d.time)
      lastBar = {
        time: lastTime,
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close),
        volume: Number(d.volume) || 0,
      }
    }

    if (!lastBar) return

    let updatedBar
    let isNewBar = false
    if (timeSec === lastBar.time) {
      // Update existing candle
      updatedBar = {
        time: timeSec,
        open: lastBar.open,
        high: Math.max(lastBar.high, ltp),
        low: Math.min(lastBar.low, ltp),
        close: ltp,
        volume: latestTick.volume ? Math.max(lastBar.volume, Number(latestTick.volume)) : lastBar.volume
      }
    } else if (timeSec > lastBar.time) {
      // Start a new candle
      updatedBar = {
        time: timeSec,
        open: ltp,
        high: ltp,
        low: ltp,
        close: ltp,
        volume: latestTick.volume ? Number(latestTick.volume) : 0
      }
      isNewBar = true
    } else {
      // Tick is older than the last candle, ignore
      return
    }

    // Update state/ref
    lastBarRef.current = updatedBar

    // Apply updates to series
    candleSeries.update(updatedBar)
    
    const linePoint = { time: updatedBar.time, value: updatedBar.close }
    lineSeries.update(linePoint)
    areaSeries.update(linePoint)
    
    volumeSeries.update({
      time: updatedBar.time,
      value: updatedBar.volume,
      color: updatedBar.close >= updatedBar.open
        ? 'rgba(16, 185, 129, 0.35)'
        : 'rgba(244, 63, 94, 0.35)'
    })

    // Compute updated indicators for the last bar
    let candlesList = data.map((d) => ({
      time: typeof d.time === 'string'
        ? Math.floor(new Date(d.time).getTime() / 1000)
        : Number(d.time),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
    })).filter((c) => !isNaN(c.time) && c.time > 0).sort((a, b) => a.time - b.time)

    if (candlesList.length > 0) {
      if (isNewBar) {
        candlesList.push(updatedBar)
      } else {
        candlesList[candlesList.length - 1] = updatedBar
      }

      // Update SMA
      if (smaSeriesRef.current && showSMA && candlesList.length >= 20) {
        const slice = candlesList.slice(-20)
        const avg = slice.reduce((s, c) => s + c.close, 0) / 20
        smaSeriesRef.current.update({ time: updatedBar.time, value: avg })
      }

      // Update EMA
      if (emaSeriesRef.current && showEMA && candlesList.length >= 9) {
        const emaData = computeEMA(candlesList, 9)
        if (emaData.length > 0) {
          emaSeriesRef.current.update(emaData[emaData.length - 1])
        }
      }

      // Update Bollinger Bands
      if (showBB && candlesList.length >= 20 && bbUpperSeriesRef.current && bbMiddleSeriesRef.current && bbLowerSeriesRef.current) {
        const slice = candlesList.slice(-20)
        const avg = slice.reduce((s, c) => s + c.close, 0) / 20
        const variance = slice.reduce((s, c) => s + Math.pow(c.close - avg, 2), 0) / 20
        const stdDev = Math.sqrt(variance)
        bbMiddleSeriesRef.current.update({ time: updatedBar.time, value: avg })
        bbUpperSeriesRef.current.update({ time: updatedBar.time, value: avg + 2 * stdDev })
        bbLowerSeriesRef.current.update({ time: updatedBar.time, value: avg - 2 * stdDev })
      }
    }

    // Update LTP line
    if (priceLineRef.current) {
      const activeSeries = chartType === 'candle' ? candleSeries : chartType === 'line' ? lineSeries : areaSeries
      try { activeSeries.removePriceLine(priceLineRef.current) } catch (e) {}
      priceLineRef.current = null
    }

    const targetSeries = chartType === 'candle' ? candleSeries : chartType === 'line' ? lineSeries : areaSeries
    const newPriceLine = targetSeries.createPriceLine({
      price: updatedBar.close,
      color: updatedBar.close >= updatedBar.open ? '#10b981' : '#f43f5e',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'LTP',
    })
    priceLineRef.current = newPriceLine

    // Update hover legend with latest tick values
    setOhlcInfo((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        close: updatedBar.close,
        high: Math.max(prev.high, updatedBar.high),
        low: Math.min(prev.low, updatedBar.low),
        volume: updatedBar.volume,
        time: updatedBar.time,
      }
    })

  }, [latestTick, chartType, showSMA, showEMA, showBB, data])

  const isUp = ohlcInfo ? ohlcInfo.close >= ohlcInfo.open : true

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
      
      {/* Sleek Chart Controls Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'var(--bg-glass)',
        borderBottom: '1px solid var(--border-color)',
        borderRadius: '16px 16px 0 0',
        backdropFilter: 'blur(16px)',
        flexWrap: 'wrap',
        gap: '8px 16px',
      }}>
        {/* Chart representation type toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginRight: 4, letterSpacing: '0.05em' }}>STYLE</span>
          {[
            { id: 'candle', label: 'Candles' },
            { id: 'line', label: 'Line' },
            { id: 'area', label: 'Area' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setChartType(t.id)}
              style={{
                background: chartType === t.id ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                color: chartType === t.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                border: chartType === t.id ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Technical Indicators toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginRight: 4, letterSpacing: '0.05em' }}>INDICATORS</span>
          {[
            { id: 'sma', label: 'SMA 20', active: showSMA, setter: setShowSMA, color: '#fbbf24' },
            { id: 'ema', label: 'EMA 9', active: showEMA, setter: setShowEMA, color: '#c084fc' },
            { id: 'bb', label: 'BB (20,2)', active: showBB, setter: setShowBB, color: '#06b6d4' },
          ].map(ind => (
            <button
              key={ind.id}
              onClick={() => ind.setter(!ind.active)}
              style={{
                background: ind.active ? 'rgba(255,255,255,0.03)' : 'transparent',
                color: ind.active ? ind.color : 'var(--text-muted)',
                border: '1px solid',
                borderColor: ind.active ? ind.color + '55' : 'var(--border-color)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                transition: 'var(--transition)',
              }}
            >
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: ind.active ? ind.color : 'transparent',
                border: !ind.active ? '1px solid var(--text-muted)' : 'none',
              }} />
              {ind.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        {/* ── OHLC Legend overlay ── */}
        {ohlcInfo && (
          <div style={{
            position: 'absolute',
            top: 14,
            left: 14,
            zIndex: 10,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 16px',
            fontSize: '11px',
            fontFamily: "var(--font-mono)",
            background: 'var(--bg-glass)',
            padding: '6px 14px',
            borderRadius: 8,
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-color)',
            pointerEvents: 'none',
            userSelect: 'none',
          }}>
            {[
              ['O', ohlcInfo.open],
              ['H', ohlcInfo.high],
              ['L', ohlcInfo.low],
              ['C', ohlcInfo.close],
            ].map(([label, val]) => (
              <span key={label} style={{ whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{label}</span>
                <span style={{ color: isUp ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {fmtPrice(val)}
                </span>
              </span>
            ))}
            {ohlcInfo.change !== undefined && (
              <span style={{
                color: ohlcInfo.change >= 0 ? 'var(--green)' : 'var(--red)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                {ohlcInfo.change >= 0 ? '▲' : '▼'}
                {' '}{Math.abs(ohlcInfo.change).toFixed(2)}%
              </span>
            )}
            <span style={{ whiteSpace: 'nowrap' }}>
               <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Vol</span>
               <span style={{ color: 'var(--text-secondary)' }}>{fmtVol(ohlcInfo.volume)}</span>
            </span>
            {ohlcInfo.time && (
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {toET(ohlcInfo.time)} ET
              </span>
            )}
          </div>
        )}

        <div ref={containerRef} style={{ overflow: 'hidden', width: '100%' }} />
      </div>
    </div>
  )
}
