// Patrón AAA: preparar, actuar, comprobar
import { describe, expect, it } from 'vitest'
import { barberShare, shopShare } from './pay'
import { buildIcs } from './calendar'

describe('comisiones', () => {
  it('porcentaje: 50% de Bs 1000 es Bs 500 para cada uno', () => {
    // Arrange
    const ingreso = 1000
    // Act
    const barbero = barberShare('percent', ingreso, 50)
    const local = shopShare('percent', ingreso, 50)
    // Assert
    expect(barbero).toBe(500)
    expect(local).toBe(500)
  })
  it('sueldo fijo no depende de lo que corta', () => {
    expect(barberShare('salary', 0, 0, 2500)).toBe(2500)
    expect(shopShare('salary', 4000, 0, 2500)).toBe(1500)
  })
  it('mixto suma fijo y porcentaje', () => {
    expect(barberShare('mixed', 1000, 20, 1000)).toBe(1200)
    expect(shopShare('mixed', 1000, 20, 1000)).toBe(-200)
  })
  it('alquiler de silla: el local recibe el alquiler y el barbero el resto', () => {
    expect(barberShare('chair_rent', 3000, 0, 0, 800)).toBe(2200)
    expect(shopShare('chair_rent', 3000, 0, 0, 800)).toBe(800)
  })
  it('sin definir no calcula nada', () => {
    expect(barberShare('none', 1000)).toBeNull()
    expect(shopShare('none', 1000)).toBeNull()
  })
  it('redondea a centavos', () => {
    expect(barberShare('percent', 33.33, 33)).toBe(11)
  })
})

describe('archivo de calendario (.ics)', () => {
  it('lleva inicio, fin, alarma y escapa comas', () => {
    // Arrange
    const ev = { id: 'abc', start: '2026-11-21T13:00:00Z', end: '2026-11-21T13:45:00Z', title: 'Corte, barba', description: 'Línea 1\nLínea 2', location: 'Av. X; Cbba' }
    // Act
    const ics = buildIcs(ev, new Date('2026-11-20T00:00:00Z'))
    // Assert
    expect(ics).toContain('DTSTART:20261121T130000Z')
    expect(ics).toContain('DTEND:20261121T134500Z')
    expect(ics).toContain('SUMMARY:Corte\\, barba')
    expect(ics).toContain('DESCRIPTION:Línea 1\\nLínea 2')
    expect(ics).toContain('LOCATION:Av. X\\; Cbba')
    expect(ics).toContain('TRIGGER:-PT30M')
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
  })
})
