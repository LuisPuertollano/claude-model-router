import type { ThemeSetArgs } from 'claude-code'
import type { Palette } from '../types'
import { makeColors } from './make-colors.js'

/** Muestra de cada paleta en el botón redondo (un cuarto por paleta). */
export const SWATCH: Record<Palette, string> = {
  light: '#f7f7f5',
  dark: '#1e1e1e',
  cream: '#efe4cc',
  creamDark: '#3b2f22',
}

export const PALETTES: readonly Palette[] = ['light', 'dark', 'cream', 'creamDark']

const ROLES = { accent: '#9a5b2e', danger: '#b3392f', success: '#4e7d3a', warning: '#a86f14', pro: '#6d4f94' }

const creamLight = makeColors({
  label: 'Crema clara',
  id: 'model-router-cream',
  only: 'light',
  roles: ROLES,
  light: {
    gray: {
      anchors: {
        'surface-0': '#efe4cc',
        'surface-1': '#f5ecd9',
        'surface-2': '#faf4e6',
        'surface-3': '#faf4e6',
        'text-primary': '#2b2219',
        'text-secondary': '#54473a',
        'text-muted': '#6b5d4c',
      },
    },
  },
})

const creamDark = makeColors({
  label: 'Crema oscura',
  id: 'model-router-cream-dark',
  only: 'dark',
  roles: ROLES,
  dark: {
    gray: {
      anchors: {
        'surface-0': '#241c14',
        'surface-1': '#2d241a',
        'surface-2': '#362b20',
        'surface-3': '#3b2f22',
        'text-primary': '#f2e6cf',
        'text-secondary': '#d6c7ad',
        'text-muted': '#b3a389',
      },
    },
  },
})

/** Lo que se manda a $.theme.set para cada paleta. */
export const LOOK: Record<Palette, ThemeSetArgs> = {
  light: { overrideColorScheme: 'light' },
  dark: { overrideColorScheme: 'dark' },
  cream: { colors: creamLight.theme, overrideColorScheme: 'light' },
  creamDark: { colors: creamDark.theme, overrideColorScheme: 'dark' },
}

export const PROBLEMS = [...creamLight.problems, ...creamDark.problems]
