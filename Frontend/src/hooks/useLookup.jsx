import { useEffect, useState } from 'react'

/**
 * Loads options for a <select> from the backend.
 * fetcher   - () => Promise<Array>
 * deps      - re-fetch whenever these change (e.g. [sellerId])
 * skip      - don't fetch yet (e.g. no seller picked, so no requests to show)
 */
export default function useLookup(fetcher, deps = [], { skip = false } = {}) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (skip) {
      setOptions([])
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    fetcher()
      .then((data) => alive && setOptions(data))
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { options, loading, error }
}