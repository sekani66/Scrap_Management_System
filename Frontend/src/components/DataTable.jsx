import { useState } from 'react'

/**
 * columns    - [{ key, label, format?(row) => string, render?(row) => ReactNode }]
 *              format gives the text shown AND searched; render (optional) replaces what is
 *              shown only, e.g. a thumbnail, searching still uses format/the raw value.
 * rows       - array of objects (from the backend)
 * actions    - optional (row) => ReactNode, rendered as a trailing "Actions" column
 * searchable - show a search box that filters across every column's displayed value (default true)
 */
export default function DataTable({ columns, rows, loading, error, emptyLabel = 'Nothing to show yet.', actions, searchable = true }) {
  const [q, setQ] = useState('')

  if (loading) return <p className="dash-status">Loading…</p>
  if (error) return <p className="dash-status error">{error}</p>

  const term = q.trim().toLowerCase()
  const filtered = !term
    ? rows
    : rows.filter((row) =>
        columns.some((c) => {
          const val = c.format ? c.format(row) : row[c.key]
          return String(val ?? '').toLowerCase().includes(term)
        })
      )

  return (
    <div>
      {searchable && rows.length > 0 && (
        <input
          type="search"
          className="dash-search"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}

      {rows.length === 0 ? (
        <p className="dash-status">{emptyLabel}</p>
      ) : filtered.length === 0 ? (
        <p className="dash-status">No rows match your search.</p>
      ) : (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                {actions && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.id ?? i}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render ? c.render(row) : c.format ? c.format(row) : (row[c.key] ?? '—')}</td>
                  ))}
                  {actions && <td className="dash-actions">{actions(row)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}