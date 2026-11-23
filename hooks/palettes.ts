import type { Palette } from '../types'

/** Muestra de cada paleta en el botón redondo (un cuarto por paleta). */
export const SWATCH: Record<Palette, string> = {
  light: '#f7f7f5',
  dark: '#1e1e1e',
  cream: '#efe4cc',
  creamDark: '#3b2f22',
}

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

export const MENU: Record<Palette, MenuColors> = {
  light: {
    bg: '#ffffff', border: '#d9d6cf', text: '#2b2a27', dim: '#77746c',
    chip: '#efede8', chipText: '#2b2a27', on: '#2b2a27', onText: '#ffffff',
  },
  dark: {
    bg: '#1e1e1e', border: '#3a3a3a', text: '#f0efe9', dim: '#a3a19a',
    chip: '#2e2e2e', chipText: '#f0efe9', on: '#f0efe9', onText: '#1e1e1e',
  },
  cream: {
    bg: '#f5ecd9', border: '#d9c9a8', text: '#2b2219', dim: '#6b5d4c',
    chip: '#ebdfc4', chipText: '#2b2219', on: '#9a5b2e', onText: '#fff8ea',
  },
  creamDark: {
    bg: '#2d241a', border: '#4a3b2b', text: '#f2e6cf', dim: '#b3a389',
    chip: '#3b2f22', chipText: '#f2e6cf', on: '#e0b878', onText: '#2d241a',
  },
}
