import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const QueryClientContext = createContext(null)

const normalizeKey = (queryKey) => {
  if (Array.isArray(queryKey)) {
    return JSON.stringify(queryKey)
  }

  if (queryKey === undefined || queryKey === null) {
    return '[]'
  }

  return JSON.stringify([queryKey])
}

const runWithRetry = async (fn, retry) => {
  const retryCount = Number.isFinite(retry) ? Math.max(0, retry) : 0
  let lastError

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= retryCount) {
        throw lastError
      }
    }
  }

  throw lastError
}

export class QueryClient {
  constructor(config = {}) {
    this.config = config
    this.listeners = new Set()
    this.invalidationVersion = 0
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify() {
    this.invalidationVersion += 1
    this.listeners.forEach((listener) => listener(this.invalidationVersion))
  }

  invalidateQueries() {
    this.notify()
    return Promise.resolve()
  }

  getDefaultOptions() {
    return this.config.defaultOptions || {}
  }
}

export function QueryClientProvider({ client, children }) {
  const fallbackClient = useMemo(() => new QueryClient(), [])

  return <QueryClientContext.Provider value={client || fallbackClient}>{children}</QueryClientContext.Provider>
}

export function useQueryClient() {
  const client = useContext(QueryClientContext)

  if (!client) {
    throw new Error('useQueryClient must be used inside QueryClientProvider')
  }

  return client
}

const readSelect = (select, value) => {
  if (typeof select !== 'function') {
    return value
  }

  return select(value)
}

export function useQuery(options = {}) {
  const client = useQueryClient()
  const {
    queryKey = [],
    queryFn,
    enabled = true,
    retry,
    select,
  } = options

  const clientDefaults = client.getDefaultOptions().queries || {}
  const effectiveRetry = retry ?? clientDefaults.retry ?? 0
  const queryKeyToken = useMemo(() => normalizeKey(queryKey), [queryKey])
  const queryFnRef = useRef(queryFn)
  const selectRef = useRef(select)
  const retryRef = useRef(effectiveRetry)

  useEffect(() => {
    queryFnRef.current = queryFn
  }, [queryFn])

  useEffect(() => {
    retryRef.current = effectiveRetry
  }, [effectiveRetry])

  useEffect(() => {
    selectRef.current = select
  }, [select])

  const [state, setState] = useState({
    data: undefined,
    error: null,
    isLoading: Boolean(enabled),
    isFetching: false,
    isError: false,
    isSuccess: false,
  })

  const refetch = useCallback(async () => {
    const currentQueryFn = queryFnRef.current

    if (typeof currentQueryFn !== 'function') {
      return undefined
    }

    setState((current) => ({
      ...current,
      isLoading: current.data === undefined,
      isFetching: true,
      isError: false,
      error: null,
    }))

    try {
      const rawData = await runWithRetry(() => currentQueryFn(), retryRef.current)
      const data = readSelect(selectRef.current, rawData)
      setState({
        data,
        error: null,
        isLoading: false,
        isFetching: false,
        isError: false,
        isSuccess: true,
      })
      return data
    } catch (error) {
      setState((current) => ({
        ...current,
        error,
        isLoading: false,
        isFetching: false,
        isError: true,
        isSuccess: false,
      }))
      throw error
    }
  }, [])

  useEffect(() => {
    const currentQueryFn = queryFnRef.current

    if (!enabled || typeof currentQueryFn !== 'function') {
      setState((current) => ({
        ...current,
        isLoading: false,
        isFetching: false,
      }))
      return undefined
    }

    let mounted = true

    const execute = async () => {
      try {
        await refetch()
      } catch {
        // Keep query errors in local state for consumer rendering.
      }
    }

    execute()

    const unsubscribe = client.subscribe(() => {
      if (mounted) {
        execute()
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [client, enabled, queryKeyToken, refetch])

  return {
    ...state,
    isIdle: !enabled,
    isRefetching: state.isFetching && state.data !== undefined,
    status: state.isError ? 'error' : state.isSuccess ? 'success' : 'pending',
    refetch,
  }
}

export function useMutation(options = {}) {
  const { mutationFn, onSuccess, onError, onSettled } = options

  const [state, setState] = useState({
    data: undefined,
    error: null,
    isPending: false,
    isLoading: false,
    isError: false,
    isSuccess: false,
  })

  const mutateAsync = useCallback(
    async (variables, callOptions = {}) => {
      if (typeof mutationFn !== 'function') {
        throw new Error('mutationFn is required')
      }

      setState({
        data: undefined,
        error: null,
        isPending: true,
        isLoading: true,
        isError: false,
        isSuccess: false,
      })

      try {
        const data = await mutationFn(variables)
        setState({
          data,
          error: null,
          isPending: false,
          isLoading: false,
          isError: false,
          isSuccess: true,
        })
        if (typeof onSuccess === 'function') {
          onSuccess(data, variables)
        }
        if (typeof callOptions.onSuccess === 'function') {
          callOptions.onSuccess(data, variables)
        }
        if (typeof onSettled === 'function') {
          onSettled(data, null, variables)
        }
        if (typeof callOptions.onSettled === 'function') {
          callOptions.onSettled(data, null, variables)
        }
        return data
      } catch (error) {
        setState({
          data: undefined,
          error,
          isPending: false,
          isLoading: false,
          isError: true,
          isSuccess: false,
        })
        if (typeof onError === 'function') {
          onError(error, variables)
        }
        if (typeof callOptions.onError === 'function') {
          callOptions.onError(error, variables)
        }
        if (typeof onSettled === 'function') {
          onSettled(undefined, error, variables)
        }
        if (typeof callOptions.onSettled === 'function') {
          callOptions.onSettled(undefined, error, variables)
        }
        throw error
      }
    },
    [mutationFn, onError, onSettled, onSuccess]
  )

  const mutate = useCallback(
    (variables, callOptions = {}) => {
      mutateAsync(variables, callOptions).catch(() => {
        // Keep mutation errors in local state for consumer rendering.
      })
    },
    [mutateAsync]
  )

  const reset = useCallback(() => {
    setState({
      data: undefined,
      error: null,
      isPending: false,
      isLoading: false,
      isError: false,
      isSuccess: false,
    })
  }, [])

  return {
    ...state,
    status: state.isError ? 'error' : state.isSuccess ? 'success' : state.isPending ? 'pending' : 'idle',
    mutate,
    mutateAsync,
    reset,
  }
}

export function useQueries({ queries = [] } = {}) {
  const client = useQueryClient()
  const token = useMemo(
    () => JSON.stringify(queries.map((queryOptions) => normalizeKey(queryOptions?.queryKey || []))),
    [queries]
  )

  const [results, setResults] = useState([])

  useEffect(() => {
    let mounted = true

    const initial = queries.map((queryOptions) => ({
      data: undefined,
      error: null,
      isLoading: Boolean(queryOptions?.enabled ?? true),
      isFetching: false,
      isError: false,
      isSuccess: false,
      isIdle: !(queryOptions?.enabled ?? true),
      isRefetching: false,
      status: (queryOptions?.enabled ?? true) ? 'pending' : 'idle',
      refetch: async () => undefined,
    }))

    setResults(initial)

    const runOne = async (index) => {
      const queryOptions = queries[index] || {}
      const enabled = queryOptions.enabled ?? true
      const queryFn = queryOptions.queryFn
      const select = queryOptions.select
      const retry = queryOptions.retry ?? client.getDefaultOptions().queries?.retry ?? 0

      if (!enabled || typeof queryFn !== 'function') {
        if (!mounted) return undefined
        setResults((current) => {
          const next = [...current]
          next[index] = {
            ...(next[index] || {}),
            isLoading: false,
            isFetching: false,
            isIdle: true,
            status: 'idle',
          }
          return next
        })
        return undefined
      }

      if (!mounted) return undefined
      setResults((current) => {
        const next = [...current]
        next[index] = {
          ...(next[index] || {}),
          isLoading: next[index]?.data === undefined,
          isFetching: true,
          isRefetching: next[index]?.data !== undefined,
          isError: false,
          error: null,
          isIdle: false,
          status: 'pending',
        }
        return next
      })

      try {
        const rawData = await runWithRetry(() => queryFn(), retry)
        const data = readSelect(select, rawData)
        if (!mounted) return data
        setResults((current) => {
          const next = [...current]
          next[index] = {
            ...(next[index] || {}),
            data,
            error: null,
            isLoading: false,
            isFetching: false,
            isRefetching: false,
            isError: false,
            isSuccess: true,
            isIdle: false,
            status: 'success',
          }
          return next
        })
        return data
      } catch (error) {
        if (!mounted) throw error
        setResults((current) => {
          const next = [...current]
          next[index] = {
            ...(next[index] || {}),
            error,
            isLoading: false,
            isFetching: false,
            isRefetching: false,
            isError: true,
            isSuccess: false,
            isIdle: false,
            status: 'error',
          }
          return next
        })
        throw error
      }
    }

    const executeAll = () => {
      queries.forEach((_, index) => {
        runOne(index).catch(() => {
          // Keep query errors in local state for consumer rendering.
        })
      })
    }

    executeAll()

    const unsubscribe = client.subscribe(() => {
      if (mounted) {
        executeAll()
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [client, token])

  return useMemo(
    () =>
      queries.map((queryOptions, index) => {
        const result = results[index] || {
          data: undefined,
          error: null,
          isLoading: Boolean(queryOptions?.enabled ?? true),
          isFetching: false,
          isError: false,
          isSuccess: false,
          isIdle: !(queryOptions?.enabled ?? true),
          isRefetching: false,
          status: (queryOptions?.enabled ?? true) ? 'pending' : 'idle',
        }

        return {
          ...result,
          refetch: () => {
            const queryFn = queryOptions?.queryFn
            if (typeof queryFn !== 'function') {
              return Promise.resolve(undefined)
            }
            const retry = queryOptions?.retry ?? client.getDefaultOptions().queries?.retry ?? 0
            const select = queryOptions?.select
            return runWithRetry(() => queryFn(), retry).then((rawData) => readSelect(select, rawData))
          },
        }
      }),
    [client, queries, results]
  )
}

export function ReactQueryDevtools() {
  return null
}
