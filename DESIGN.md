# DESIGN.md — Bunny Barber Studio

## Escena de uso
- **Equipo** (barberos, recepción, admin): celular en la mano dentro del local, entre corte y corte. Leen la agenda de un vistazo y tocan botones grandes.
- **Clientes**: reservan desde su celular en menos de un minuto; el inicio también es la vitrina del local.

Claro u oscuro según el celular. La portada, la barra del equipo y la pantalla del local son siempre negras, como el logo.

## Mundo visual
El logo: insignia negra y cobre, conejo grabado, letras serif clásicas y el canto acuñado de una moneda. El mundo aporta tipografía, paleta y un gesto firma; los controles son los estándar de la web.

## Paleta (tomada del logo)
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--ground` | `#F2F0EC` | `#0E0B08` | Fondo |
| `--surface` | `#FFFFFF` | `#17130F` | Listas y paneles |
| `--ink` | `#17120D` | `#F3EADC` | Texto, botón principal (claro) |
| `--copper` | `#B9864D` | `#C9955A` | Cobre del logo: firma, sellos, rellenos |
| `--teal` (acento) | `#8A5A24` | `#D6A467` | Enlaces, foco, selección, pestaña activa |
| `--rail` | `#0E0B08` | `#080605` | Portada, barra del equipo, pantalla del local |

Estados: éxito verde, aviso ámbar, error rojo. Nunca cobre para errores.

## Tipografía
- **DM Serif Display** para títulos, el nombre del local y la portada (eco de las letras del logo).
- **Archivo** (ancho variable) para todo lo demás: texto, botones, datos, horas condensadas en la agenda.

## Gesto firma
El **canto acuñado**: muescas cobre entre dos filetes, como el borde de la insignia. Va bajo la barra del equipo, bajo la portada, en la pantalla del local y en la cuenta regresiva de la reserva (las muescas avanzan y la barra se acorta).

## Forma y movimiento
- Radios: controles 10px, paneles 14px, hojas 18px. Listas en un panel con líneas finas.
- Íconos SVG propios de trazo 1.75. Sin emojis, sin etiquetas en mayúsculas sobre títulos.
- Presionar: `scale(0.97)` en 160ms. Hojas suben en 320ms. `prefers-reduced-motion` quita los desplazamientos.
- Errores de formulario: borde rojo y mensaje debajo del campo, con el foco en el primero.
