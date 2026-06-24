import { useEffect, useRef, useState, useCallback } from 'react'
import { emitPreSpikeAlert, emitPreSpikeAlertSnapshot, emitAlertWsStatus } from '../utils/preSpikeAlertEvents'

function buildAlertWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws/alerts`
}

/**
 * Dedicated WebSocket for real-time pre-spike alerts (independent of market tick stream).
 * @param {boolean} enabled - connect when true (typically when user is authenticated)
 * @param {(msg: object) => void} [onMessage] - optional extra handler per message
 */
export function useAlertWebSocket(enabled, onMessage) {
  const wsRef = useRef(null)
  const [isConnected, setIsConnected] = useState(false)
  const reconnectTimeout = useRef(null)
  const reconnectAttempts = useRef(0)
  const pingInterval = useRef(null)
  const offlineDebounce = useRef(null)
  const maxReconnectAttempts = 20

  const onMessageRef = useRef(onMessage)
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const connect = useCallback(() => {
    if (!enabled) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return

    clearTimeout(offlineDebounce.current)

    try {
      wsRef.current = new WebSocket(buildAlertWsUrl())

      wsRef.current.onopen = () => {
        clearTimeout(offlineDebounce.current)
        setIsConnected(true)
        emitAlertWsStatus(true)
        reconnectAttempts.current = 0
        clearInterval(pingInterval.current)
        pingInterval.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send('ping')
          }
        }, 25000)
      }

      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (onMessageRef.current) {
            onMessageRef.current(msg)
          }
          if (msg.type === 'pre_spike_alert' && msg.data && !msg.data.test) {
            emitPreSpikeAlert(msg.data)
          } else if (msg.type === 'pre_spike_alert_snapshot' && Array.isArray(msg.data)) {
            emitPreSpikeAlertSnapshot(msg.data)
          }
        } catch (e) {
          console.error('Alert WebSocket parse error:', e)
        }
      }

      wsRef.current.onclose = (event) => {
        clearInterval(pingInterval.current)
        wsRef.current = null
        if (!enabled || reconnectAttempts.current >= maxReconnectAttempts) {
          clearTimeout(offlineDebounce.current)
          setIsConnected(false)
          emitAlertWsStatus(false)
          return
        }
        offlineDebounce.current = setTimeout(() => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setIsConnected(false)
            emitAlertWsStatus(false)
          }
        }, 2500)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectTimeout.current = setTimeout(() => {
          reconnectAttempts.current++
          connect()
        }, delay)
        if (event.code !== 1000) {
          console.warn(`Alert WebSocket closed (${event.code}); retrying in ${delay}ms`)
        }
      }

      wsRef.current.onerror = () => {
        wsRef.current?.close()
      }
    } catch (err) {
      console.error('Alert WebSocket connect error:', err)
      setIsConnected(false)
      emitAlertWsStatus(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      clearTimeout(reconnectTimeout.current)
      clearInterval(pingInterval.current)
      clearTimeout(offlineDebounce.current)
      wsRef.current?.close()
      wsRef.current = null
      setIsConnected(false)
      emitAlertWsStatus(false)
      return
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout.current)
      clearInterval(pingInterval.current)
      clearTimeout(offlineDebounce.current)
      const socket = wsRef.current
      wsRef.current = null
      socket?.close()
      offlineDebounce.current = setTimeout(() => {
        if (!wsRef.current) {
          setIsConnected(false)
          emitAlertWsStatus(false)
        }
      }, 2000)
    }
  }, [enabled, connect])

  return { isConnected }
}
