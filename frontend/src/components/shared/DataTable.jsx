import { useEffect, useMemo, useState } from 'react'
import {
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'

export default function DataTable({
  columns = [],
  data = [],
  isLoading = false,
  onRowClick,
  rowClassName = '',
  emptyMessage = 'No data available',
  emptyIcon: EmptyIcon,
}) {
  const [sortBy, setSortBy] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')
  const [filterText, setFilterText] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const sortedAndFiltered = useMemo(() => {
    let result = [...data]

    if (filterText) {
      const text = filterText.toLowerCase()
      result = result.filter((row) =>
        columns.some((col) => {
          const value = col.render ? col.render(row) : row[col.key]
          return String(value ?? '').toLowerCase().includes(text)
        })
      )
    }

    if (sortBy) {
      result.sort((a, b) => {
        const aVal = a[sortBy]
        const bVal = b[sortBy]

        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1

        if (typeof aVal === 'string') {
          return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        }

        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
      })
    }

    return result
  }, [data, filterText, sortBy, sortOrder, columns])

  useEffect(() => {
    setPage(1)
  }, [filterText, data.length])

  const totalPages = Math.max(1, Math.ceil(sortedAndFiltered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedRows = sortedAndFiltered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortBy(columnKey)
    setSortOrder('asc')
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
        <div className="space-y-3">
          {[...Array(5)].map((_, idx) => (
            <div key={`skeleton-${idx}`} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 py-14 text-center shadow-sm backdrop-blur">
        <div>
          {EmptyIcon ? <EmptyIcon className="mx-auto h-12 w-12 text-slate-400" /> : null}
          <p className="mt-4 text-sm text-slate-600">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-2xl border border-white bg-white/80 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full sm:max-w-sm">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search records..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="ui-input w-full py-2 pl-9 pr-3"
          />
        </label>
        <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
          <FunnelIcon className="h-4 w-4" />
          {sortedAndFiltered.length} filtered / {data.length} total
        </div>
      </div>

      <div className="ui-table-shell hidden md:block">
        <table className="w-full min-w-[700px]">
          <thead className="border-b border-slate-200 bg-slate-50/90">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 ${
                    col.sortable ? 'cursor-pointer hover:bg-slate-100' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    {col.sortable ? (
                      <span className="opacity-50">
                        {sortBy === col.key ? (
                          sortOrder === 'asc' ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronUpDownIcon className="h-3.5 w-3.5" />
                        )}
                      </span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {paginatedRows.map((row, idx) => (
              <tr
                key={row.id || row._id || idx}
                className={`transition hover:bg-primary-50/40 ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={`${row.id || idx}-${col.key}`} className="px-5 py-3 text-sm text-slate-700">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {paginatedRows.map((row, idx) => (
          <article
            key={`mobile-${row.id || row._id || idx}`}
            className={`rounded-2xl border border-white bg-white/90 p-4 shadow-sm ${onRowClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
            onClick={() => onRowClick?.(row)}
          >
            <div className="grid grid-cols-1 gap-2">
              {columns.map((col) => (
                <div key={`mobile-cell-${col.key}`} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-24 text-xs font-medium uppercase tracking-wide text-slate-500">{col.label}</span>
                  <span className="text-right text-slate-700">{col.render ? col.render(row) : row[col.key] || '-'}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-col items-start justify-between gap-2 rounded-xl bg-white/80 p-3 text-xs text-slate-600 ring-1 ring-slate-200 sm:flex-row sm:items-center">
        <span>
          Showing {sortedAndFiltered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
          {Math.min(safePage * pageSize, sortedAndFiltered.length)} of {sortedAndFiltered.length}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage <= 1}
            className="ui-btn-secondary rounded-lg px-2.5 py-1.5 text-xs"
          >
            Prev
          </button>
          <span className="font-medium text-slate-700">
            Page {safePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage >= totalPages}
            className="ui-btn-secondary rounded-lg px-2.5 py-1.5 text-xs"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
