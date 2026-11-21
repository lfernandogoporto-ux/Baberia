// Patrón AAA: preparar, actuar, comprobar
import { describe, expect, it } from 'vitest'
import { addDays, dayRange, mins, money, normPhone, time } from './format'

describe('normPhone', () => {
  it('antepone 591 a un celular de 8 dígitos y quita símbolos', () => {
    // Arrange
    const escrito = '700-12 345'
    // Act
    const normal = normPhone(escrito)
    // Assert
    expect(normal).toBe('59170012345')
  })
  it('no duplica el 591 si ya viene', () => {
    expect(normPhone('+591 70012345')).toBe('59170012345')
  })
})

describe('fechas de Bolivia (UTC-4)', () => {
  it('addDays cruza fin de mes y de año', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('dayRange va de medianoche a medianoche en hora boliviana', () => {
    // Act
    const r = dayRange('2026-11-20')
    // Assert: 00:00 en Bolivia son las 04:00 UTC
    expect(new Date(r.from).toISOString()).toBe('2026-11-20T04:00:00.000Z')
    expect(new Date(r.to).toISOString()).toBe('2026-11-21T04:00:00.000Z')
  })
  it('time muestra la hora boliviana', () => {
    expect(time('2026-11-20T13:30:00Z')).toBe('09:30')
  })
})

describe('money y mins', () => {
  it('formatea bolivianos sin decimales innecesarios', () => {
    expect(money(30)).toBe('Bs 30')
    expect(money('45.5')).toMatch(/^Bs 45[.,]5$/)
    expect(money(null)).toBe('Bs 0')
  })
  it('escribe duraciones legibles', () => {
    expect(mins(30)).toBe('30 min')
    expect(mins(60)).toBe('1 h')
    expect(mins(90)).toBe('1 h 30 min')
  })
})
