// Archivo .ics para que el cliente guarde su cita en el calendario del celular (sin servicios externos)
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')

export interface IcsEvent { id: string; start: string; end: string; title: string; description: string; location?: string | null }

/** Texto del calendario (función pura, para poder probarla) */
export function buildIcs({ id, start, end, title, description, location }: IcsEvent, now = new Date()) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bunny Barber Studio//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${id}@bunny-barber-studio`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadIcs(ev: IcsEvent) {
  const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'mi-cita-bunny.ics'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
