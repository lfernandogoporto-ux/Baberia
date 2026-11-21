# DESIGN.md — Barbería Casa

## Escena de uso
- **Equipo** (barberos, recepción, admin): celular en la mano dentro del local, con luz de día o luz fuerte, entre corte y corte. Necesitan leer la agenda de un vistazo y tocar botones grandes.
- **Clientes**: reservan desde su celular, en cualquier lugar, en menos de un minuto.

Modo claro por defecto (local iluminado); modo oscuro automático según el sistema.

## Mundo visual
Barbería de barrio clásica: el **poste** rojo/blanco/azul, azulejo de porcelana, letreros de vidriera con letra condensada. El mundo aporta solo tipografía, paleta, densidad y un gesto firma. Los controles son los estándar de la web.

## Paleta
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| Porcelana `--ground` | `#F1F3EF` | `#0F1628` | Fondo |
| Superficie `--surface` | `#FFFFFF` | `#172038` | Listas y paneles |
| Acero `--surface-2` | `#E6E9E4` | `#1F2A45` | Segunda capa neutra, controles |
| Tinta `--ink` | `#172036` | `#ECEFE8` | Texto, botón principal, barra superior |
| Poste `--pole` | `#B5262B` | `#E0524F` | Firma del poste, acciones destructivas, errores |
| Barbicida `--teal` | `#1F7A86` | `#4FB3BF` | Selección, foco, pestaña activa, "en curso" |

Estados: éxito `#2E7D4F`, aviso `#9A6212`, error = poste.

## Tipografía
Una sola familia: **Archivo** (variable, con ancho 62–125%), servida desde el propio sitio.
- Texto y controles: ancho normal, 16px, escala 1.2.
- Títulos: ancho 75%, peso 750, como letrero.
- Horas de la agenda: ancho 70%, peso 700, números tabulares. Es la columna tipo horario.
- Nombre del local en el inicio: ancho 62%, peso 800, grande, como letrero de vidriera.

## Gesto firma
La **franja del poste** (diagonal roja, blanca y azul):
- 6px bajo la barra superior del equipo y en el inicio.
- Como barra de cuenta regresiva mientras se retiene un horario: la franja gira como el poste y se acorta con el tiempo que queda.

Nada más usa la franja.

## Forma
- Radios: controles 10px, paneles 14px, hojas inferiores 18px.
- Listas en un solo panel con líneas finas entre filas, no tarjetas sueltas iguales.
- Sin barras de color a un costado, sin emojis como íconos (íconos SVG propios, trazo 1.75), sin etiquetas en mayúsculas sobre títulos, sin "·" uniendo datos, sin "→" en botones.

## Movimiento
- Presionar: `scale(0.97)` en 160ms `cubic-bezier(0.23,1,0.32,1)`.
- Hojas inferiores: suben con `cubic-bezier(0.32,0.72,0,1)` en 320ms.
- Hover solo en dispositivos con puntero fino. `prefers-reduced-motion` quita los desplazamientos.
