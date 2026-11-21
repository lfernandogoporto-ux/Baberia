// Pruebas con el patrón AAA: Arrange (preparar), Act (actuar), Assert (comprobar)
import { describe, expect, it } from 'vitest'
import { clean, email, fileImage, isValid, minLen, number, password, personName, phoneBO, required, strongPassword } from './validate'

describe('phoneBO: celular boliviano', () => {
  it.each(['70012345', '6 123 4567', '+591 70012345', '59170012345'])('acepta %s', (input) => {
    // Arrange: un celular válido escrito de distintas formas
    // Act
    const error = phoneBO(input)
    // Assert
    expect(error).toBe('')
  })

  it('pide 8 dígitos cuando falta uno', () => {
    // Arrange
    const input = '7001234'
    // Act
    const error = phoneBO(input)
    // Assert
    expect(error).toMatch(/8 dígitos/)
  })

  it('rechaza números que no empiezan en 6 o 7', () => {
    const error = phoneBO('40012345')
    expect(error).toMatch(/6 o 7/)
  })

  it('vacío es error salvo que sea opcional', () => {
    expect(phoneBO('')).not.toBe('')
    expect(phoneBO('', true)).toBe('')
  })
})

describe('email', () => {
  it('acepta un correo normal', () => {
    expect(email('ana@gmail.com')).toBe('')
  })
  it.each(['', 'ana', 'ana@', 'ana@gmail', 'a b@c.com'])('rechaza "%s"', (input) => {
    expect(email(input)).not.toBe('')
  })
})

describe('personName', () => {
  it('rechaza vacío, muy corto y muy largo', () => {
    // Arrange
    const casos = ['', ' a ', 'x'.repeat(61)]
    // Act
    const errores = casos.map(personName)
    // Assert
    expect(errores.every((e) => e !== '')).toBe(true)
  })
  it('acepta nombres con tildes y espacios', () => {
    expect(personName('  José Ñuflo  ')).toBe('')
  })
})

describe('number', () => {
  it('respeta mínimo, máximo y enteros', () => {
    // Arrange
    const reglas = { min: 5, max: 480, integer: true }
    // Act + Assert
    expect(number('3', reglas)).toMatch(/mínimo es 5/)
    expect(number('500', reglas)).toMatch(/máximo es 480/)
    expect(number('30.5', reglas)).toMatch(/entero/)
    expect(number('abc', reglas)).toMatch(/números/)
    expect(number('30', reglas)).toBe('')
  })
  it('vacío solo pasa si es opcional', () => {
    expect(number('')).not.toBe('')
    expect(number('', { optional: true })).toBe('')
  })
})

describe('password, required y minLen', () => {
  it('exigen lo mínimo', () => {
    expect(password('')).not.toBe('')
    expect(password('x')).toBe('')
    expect(required('  ')).not.toBe('')
    expect(minLen('ab', 3)).toMatch(/al menos 3/)
  })
})

describe('fileImage', () => {
  const file = (type: string, size: number) => ({ type, size }) as File
  it('acepta una foto liviana', () => {
    expect(fileImage(file('image/jpeg', 200_000))).toBe('')
  })
  it('rechaza PDF si no se permite y archivos de más de 5 MB', () => {
    expect(fileImage(file('application/pdf', 1000))).toMatch(/foto/)
    expect(fileImage(file('application/pdf', 1000), { pdf: true })).toBe('')
    expect(fileImage(file('image/png', 6 * 1024 * 1024))).toMatch(/5 MB/)
  })
  it('sin archivo: error salvo que sea opcional', () => {
    expect(fileImage(null)).not.toBe('')
    expect(fileImage(null, { required: false })).toBe('')
  })
})

describe('clean e isValid', () => {
  it('quitan los campos sin error', () => {
    // Arrange
    const errores = { nombre: '', celular: 'Falta', correo: '' }
    // Act
    const limpio = clean(errores)
    // Assert
    expect(limpio).toEqual({ celular: 'Falta' })
    expect(isValid(limpio)).toBe(false)
    expect(isValid(clean({ a: '' }))).toBe(true)
  })
})

describe('strongPassword: contraseña segura al crear o cambiar', () => {
  it.each([
    ['', /Escribe/], ['abc12', /8 caracteres/], ['solamenteletras', /letras y números/],
    ['1234567890', /letras y números/], [' corte2026 ', /espacios/], ['12345678a', /fácil/],
  ])('rechaza "%s"', (input, msg) => {
    // Act
    const error = strongPassword(input)
    // Assert
    expect(error).toMatch(msg)
  })
  it('acepta letras y números con 8 o más caracteres', () => {
    expect(strongPassword('Bunny2026corte')).toBe('')
  })
})
