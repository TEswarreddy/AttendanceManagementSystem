import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import StatusBadge from '@/components/shared/StatusBadge'

describe('StatusBadge', () => {
  it("renders 'Present' text for status 'P'", () => {
    render(<StatusBadge status="P" />)

    expect(screen.getByText('Present')).toBeInTheDocument()
  })

  it("renders 'Absent' text for status 'A'", () => {
    render(<StatusBadge status="A" />)

    expect(screen.getByText('Absent')).toBeInTheDocument()
  })

  it("renders 'Late' text for status 'L'", () => {
    render(<StatusBadge status="L" />)

    expect(screen.getByText('Late')).toBeInTheDocument()
  })

  it("has green color class for 'safe' status", () => {
    render(<StatusBadge status="safe" />)

    expect(screen.getByText('Present')).toHaveClass('text-green-800')
  })

  it("has red color class for 'critical' status", () => {
    render(<StatusBadge status="critical" />)

    expect(screen.getByText('Absent')).toHaveClass('text-red-800')
  })

  it("has amber color class for 'warning' status", () => {
    render(<StatusBadge status="warning" />)

    expect(screen.getByText('Late')).toHaveClass('text-amber-800')
  })
})
