# Bunny Barber Studio

PWA para reservar cortes y administrar la barbería (Cochabamba, Bolivia). React + Vite + Supabase.

## Probar en tu computador

```powershell
npm install
npm run dev
```

Abre http://localhost:5173. Las claves de Supabase están en `.env` (ver `.env.example`).

## Primer uso

1. Antes de nada, desactiva la confirmación por correo en Supabase: **Authentication → Providers → Email → Confirm email** (apagado), o los registros pedirán confirmar el correo.
2. Entra a `/login` → "Primera vez: crear cuenta". **La primera cuenta que se registra es el administrador** (y también corta). Hazlo tú antes que nadie.
3. En **Negocio** ajusta servicios, precios y sube tu QR. En **Equipo** → tu perfil → **Horario** define tus días y horas.
4. En **Equipo** invita a los barberos y a la recepcionista por correo: cuando se registren con ese correo reciben su rol.
5. Los clientes reservan en `/reservar` sin crear cuenta.

## Base de datos

Las migraciones están en `supabase/migrations/` y ya fueron aplicadas al proyecto `barberia-casa` de Supabase.

## Pruebas (patrón AAA: preparar, actuar, comprobar)

```powershell
npm test
```

- **Unitarias** (`src/lib/*.test.ts`, Vitest): validaciones, fechas de Bolivia, dinero, comisiones y archivo de calendario.
- **Base de datos** (`supabase/tests/database.test.sql`): 20 pruebas de reglas de negocio y seguridad (doble reserva, colchón, faltas, comisiones, caja, stock, sellos, fila, asistencia, cuentas, roles y RLS). Se ejecuta en el editor SQL de Supabase; todo se deshace al terminar y el mensaje final dice cuántas pasaron.
- **Carga** (`scripts/load-test.mjs`): cientos de personas pidiendo el mismo horario a la vez (debe ganar 1) y miles de consultas públicas. Necesita un barbero con horario: `node scripts/load-test.mjs <barbero_id> <fecha> <servicio_id>`.

Resultados del 20/11/2026: 300 y 500 intentos simultáneos por el mismo horario → ganó 1 en ambos; 3000 consultas con 150 a la vez → 560 por segundo, 0 errores, p95 de 0,4 s. Con 1500 clientes y ~16 500 citas, cada pantalla responde entre 1 y 250 ms.

## Qué hace

- **Reservas** (`/reservar`): barbero con su calificación y fotos, servicios, día y hora; el horario se retiene unos minutos mientras se confirma. Página de la reserva con cancelación, pago adelantado con QR, recordatorio push y calificación.
- **Agenda**: citas del día en vivo, "Atender ahora" para los sin reserva, fila digital, temporizador, cobro, sello de fidelidad y foto del corte.
- **Clientes**: búsqueda, historial con fotos, faltas (y perdonarlas), tarjeta de sellos, escanear tarjeta con la cámara, invitar a volver por WhatsApp.
- **Caja**: comprobantes por verificar, cierre del día (quién cobró qué), gastos, finanzas del mes con comisiones y simulador.
- **Ingresos**: por día, mes y año, ranking de barberos.
- **Más**: equipo (roles, horarios, precios, velocidad, forma de pago), negocio (servicios, QR, reservas, fila, fidelidad, reactivación, asistencia), inventario, asistencia por ubicación, galería, pantalla del local (`/pantalla`), QR para imprimir.
- **Públicas**: `/fila` para anotarse desde la puerta, `/tarjeta/:codigo` con la tarjeta de sellos, `/pantalla` para una TV.
- **Recordatorios push**: función `send-reminders` (Supabase Edge Function) llamada por `pg_cron` cada 5 minutos. Las claves VAPID privadas y el secreto del cron están en la tabla `app_secrets` (solo accesible con la clave de servicio).
- **Sin internet**: la app abre igual y la agenda muestra lo último que se cargó en ese celular; los cambios necesitan conexión.

- **Cuentas de cliente** (`/cuenta`): reservas próximas, historial, tarjeta de sellos y datos. Las reservas hechas sin cuenta se guardan en la cuenta abriendo su enlace estando dentro ("Guardar esta reserva en mi cuenta").
- **Mi perfil** (`/app/perfil` para el equipo, pestaña "Mis datos" para clientes): nombre, celular, correo y contraseña; el admin también cambia el nombre de la barbería.
- **Validaciones**: cada formulario marca en rojo el campo con problema y explica debajo qué falta o qué está mal.

## Skills de diseño (Claude Code)

Las skills `frontend-design`, `emil-design-eng` e `impeccable` se instalaron en `.claude/skills/` de este equipo y no se suben al repositorio. Para reinstalarlas, copia sus carpetas desde `github.com/anthropics/skills`, `github.com/emilkowalski/skill` y `github.com/pbakaus/impeccable`.

## Pendiente

- **Publicar la app en internet** (Vercel, Netlify u otro). Hoy solo corre en este computador, así que los clientes todavía no pueden reservar ni escanear los QR.
- **Lista de espera** completa: se decidió evaluarla con datos reales más adelante.
