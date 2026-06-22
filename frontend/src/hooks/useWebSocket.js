import { useEffect, useRef, useState, useCallback } from 'react'

const DEFAULT_SYMBOLS = 'NDX,SPX,AAPL,TSLA,NVDA'

function buildDefaultWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ symbols: DEFAULT_SYMBOLS })
  return `${protocol}//${window.location.host}/api/ws/ticks?${params.toString()}`
}

function normalizeTickMessage(msg) {
  if (msg?.type === 'tick' && msg.data) {
    return msg
  }
  if (msg?.symbol && (msg.ltp != null || msg.last != null)) {
    return {
      type: 'tick',
      data: {
        instrument_token: msg.instrument_token ?? msg.con_id ?? 0,
        instrument_id: msg.instrument_id,
        symbol: msg.symbol,
        ltp: msg.ltp ?? msg.last,
        close: msg.close ?? 0,
        change: msg.change ?? 0,
        ts: msg.ts ?? msg.timestamp,
      },
    }
  }
  return msg
}

/**
 * useWebSocket — connects to the market WebSocket and manages state.
 * @param {string|null|undefined} url
 *   - undefined  → use default /api/ws/ticks URL
 *   - null       → do NOT connect (user not authenticated)
 *   - string     → use that URL
 */
export function useWebSocket(url, onMessageCallback) {
  const wsRef = useRef(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const [latestTicks, setLatestTicks] = useState({})
  const [alerts, setAlerts] = useState([])
  const reconnectTimeout = useRef(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 20
  const shouldConnect = url !== null

  const onMessageRef = useRef(onMessageCallback)
  useEffect(() => {
    onMessageRef.current = onMessageCallback
  }, [onMessageCallback])

  const connect = useCallback(() => {
    if (!shouldConnect) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return

    try {
      const wsUrl = (url == null || url === undefined) ? buildDefaultWsUrl() : url
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        setIsConnected(true)
        reconnectAttempts.current = 0
      }

      wsRef.current.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data)
          const msg = normalizeTickMessage(raw)
          setLastMessage(msg)

          if (onMessageRef.current) {
            onMessageRef.current(msg)
          }

          if (msg.type === 'connected') {
            setIsConnected(true)
          } else if (msg.type === 'tick') {
            const token = msg.data.instrument_token
            if (token) {
              setLatestTicks((prev) => ({
                ...prev,
                [token]: msg.data,
              }))
            }
          } else if (msg.type === 'alert') {
            setAlerts((prev) => [msg.data, ...prev].slice(0, 100))
          } else if (msg.type === 'pre_spike_alert') {
            setAlerts((prev) => [msg.data, ...prev].slice(0, 100))
          } else if (msg.type === 'snapshot') {
            const snapshot = {}
            for (const tick of msg.data) {
              snapshot[tick.instrument_token] = tick
            }
            setLatestTicks(snapshot)
          }
        } catch (e) {
          console.error('WebSocket parse error:', e)
        }
      }

      wsRef.current.onclose = (event) => {
        setIsConnected(false)
        wsRef.current = null
        if (!shouldConnect || reconnectAttempts.current >= maxReconnectAttempts) return
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectTimeout.current = setTimeout(() => {
          reconnectAttempts.current++
          connect()
        }, delay)
        if (event.code !== 1000) {
          console.warn(`Market WebSocket closed (${event.code}); retrying in ${delay}ms`)
        }
      }

      wsRef.current.onerror = () => {
        wsRef.current?.close()
      }
    } catch (err) {
      console.error('WebSocket connect error:', err)
      setIsConnected(false)
    }
  }, [url, shouldConnect])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimeout.current)
    reconnectAttempts.current = maxReconnectAttempts
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  useEffect(() => {
    if (!shouldConnect) {
      disconnect()
      return undefined
    }
    reconnectAttempts.current = 0
    connect()
    return () => disconnect()
  }, [connect, disconnect, shouldConnect])

  return { isConnected, lastMessage, latestTicks, alerts, connect, disconnect }
}
