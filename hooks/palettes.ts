import type { Palette } from '../types'

/** Color de cada rectángulo del selector de paleta.
 *  Se pintan como fondo de una caja: la app no colorea el texto de los botones. */
export const DOT: Record<Palette, string> = { light: '#ffffff', dark: '#6e6e6e', cream: '#e8d3a8', creamDark: '#a5794f', sage: '#a8c8a0', night: '#2f4b78' }

/** Ancho, en celdas, de cada rectángulo del selector de paleta. */
export const SWATCH = 5

/** De más clara a más oscura (luminancia del color de cada rectángulo). */
export const PALETTES: readonly Palette[] = ['light', 'cream', 'sage', 'creamDark', 'dark', 'night']

/** Colores del menú del enrutador. Solo pintan el menú; el resto de la app no cambia. */
export type MenuColors = {
  bg: string
  border: string
  text: string
  dim: string
  chip: string
  chipText: string
  on: string
  onText: string
}

// Las pastillas (chip / on) son claras en todas las paletas: la app pinta el texto de
// sus botones oscuro y no deja cambiarlo.
export const MENU: Record<Palette, MenuColors> = {
  light: { bg: '#ffffff', border: '#d9d6cf', text: '#2b2a27', dim: '#77746c', chip: '#efede8', chipText: '#2b2a27', on: '#d8d2c4', onText: '#2b2a27' },
  dark: { bg: '#1e1e1e', border: '#3a3a3a', text: '#f0efe9', dim: '#b5b3ac', chip: '#e4e2dc', chipText: '#1e1e1e', on: '#a9c4ee', onText: '#1e1e1e' },
  cream: { bg: '#f5ecd9', border: '#d9c9a8', text: '#2b2219', dim: '#6b5d4c', chip: '#ebdfc4', chipText: '#2b2219', on: '#e0b878', onText: '#2b2219' },
  creamDark: { bg: '#2d241a', border: '#4a3b2b', text: '#f2e6cf', dim: '#c4b498', chip: '#efe0c2', chipText: '#2d241a', on: '#e0b878', onText: '#2d241a' },
  // verde salvia (claro) y azul noche (oscuro): los tonos fríos que faltaban
  sage: { bg: '#e6efe4', border: '#bcd0b8', text: '#1f2b1e', dim: '#55684f', chip: '#d6e5d2', chipText: '#1f2b1e', on: '#9cc493', onText: '#1f2b1e' },
  night: { bg: '#16202e', border: '#2c3c55', text: '#e6eef9', dim: '#a9b9d0', chip: '#dde7f5', chipText: '#16202e', on: '#8fb8f0', onText: '#16202e' },
}
