import { describe, expect, it } from 'vitest'
import { formatTenths, hourLabel, hourSpan, shader, weekdayName } from '../app/utils/heatmap'

describe('heatmap display helpers', () => {
  it('names ISO weekdays in the UI language', () => {
    expect(weekdayName(1, 'id')).toBe('Senin')
    expect(weekdayName(7, 'id')).toBe('Minggu')
    expect(weekdayName(6, 'en')).toBe('Saturday')
  })
  it('labels hours, wrapping after 23', () => {
    expect(hourLabel(9, 'id')).toBe('09.00')
    expect(hourLabel(9, 'en')).toBe('09:00')
    expect(hourSpan(23, 'id')).toBe('23.00–00.00')
  })
  it('formats tenths with the local decimal mark', () => {
    expect(formatTenths(25, 'id')).toBe('2,5')
    expect(formatTenths(30, 'en')).toBe('3.0')
    expect(formatTenths(3, 'id')).toBe('0,3')
  })
  it('shades by rank among non-empty cells, 0 for nothing', () => {
    const shade = shader([0, 1, 2, 3, 4, 5, 6, 7, 100])
    expect(shade(0)).toBe(0)
    expect([1, 2, 3, 4, 5, 6, 7, 100].map(shade)).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
    // A single outlier doesn't flatten the rest.
    expect(shade(7)).toBe(4)
  })
  it('gives equal values the same shade, and handles no data', () => {
    const shade = shader([5, 5, 5])
    expect([5, 5, 5].map(shade)).toEqual([4, 4, 4])
    expect(shader([])(3)).toBe(0)
  })
})
