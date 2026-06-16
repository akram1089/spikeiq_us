import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useWebSocket — connects to the market WebSocket and manages state.
 * @param {string|null|undefined} url
 *   - undefined  → use default /ws/market URL
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
  const maxReconnectAttempts = 10
  const shouldConnect = url !== null  // null = explicitly disabled

  const onMessageRef = useRef(onMessageCallback)
  useEffect(() => {
    onMessageRef.current = onMessageCallback
  }, [onMessageCallback])

  const connect = useCallback(() => {
    if (!shouldConnect) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = (url == null || url === undefined)
        ? `${protocol}//${window.location.host}/api/ws/ticks?symbols=SPX,AAPL,TSLA,NVDA,/ES`
        : url
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        setIsConnected(true)
        reconnectAttempts.current = 0
      }

      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          setLastMessage(msg)

          if (onMessageRef.current) {
            onMessageRef.current(msg)
          }

          if (msg.type === 'tick') {
            setLatestTicks((prev) => ({
              ...prev,
              [msg.data.instrument_token]: msg.data,
            }))
          } else if (msg.type === 'alert') {
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

      wsRef.current.onclose = () => {
        setIsConnected(false)
        if (shouldConnect && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          reconnectTimeout.current = setTimeout(() => {
            reconnectAttempts.current++
            connect()
          }, delay)
        }
      }

      wsRef.current.onerror = () => {
        wsRef.current?.close()
      }
    } catch (err) {
      console.error('WebSocket connect error:', err)
    }
  }, [url, shouldConnect])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimeout.current)
    reconnectAttempts.current = maxReconnectAttempts  // prevent auto-reconnect
    wsRef.current?.close()
    setIsConnected(false)
  }, [])

  useEffect(() => {
    if (!shouldConnect) {
      disconnect()
      return
    }
    connect()
    return () => disconnect()
  }, [connect, disconnect, shouldConnect])

  return { isConnected, lastMessage, latestTicks, alerts, connect, disconnect }
}
