import type { Palette } from '../types'

/** Color de cada rectángulo del selector de paleta.
 *  Se pintan como fondo de una caja: la app no colorea el texto de los botones. */
export const DOT: Record<Palette, string> = { light: '#ffffff', dark: '#6e6e6e', cream: '#e8d3a8', creamDark: '#a5794f' }

/** Ancho, en celdas, de cada rectángulo del selector de paleta. */
export const SWATCH = 6

export const PALETTES: readonly Palette[] = ['light', 'dark', 'cream', 'creamDark']

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
}
