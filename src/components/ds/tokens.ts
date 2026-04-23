export type HaloColor = 'cyan' | 'magenta' | 'violet' | 'amber' | 'rose' | 'green'

export const HALOS: Record<HaloColor, string> = {
  cyan:    'radial-gradient(ellipse at 50% 80%, #00C2E8 0%, #0077A8 30%, #001520 70%)',
  magenta: 'radial-gradient(ellipse at 50% 80%, #E8178A 0%, #9C0F5B 30%, #1F0110 70%)',
  violet:  'radial-gradient(ellipse at 50% 80%, #6D28D9 0%, #3D156E 30%, #0C0418 70%)',
  amber:   'radial-gradient(ellipse at 50% 80%, #F5A524 0%, #8C5B0A 30%, #1A1004 70%)',
  rose:    'radial-gradient(ellipse at 50% 80%, #FB4C5C 0%, #8C1A24 30%, #1A0509 70%)',
  green:   'radial-gradient(ellipse at 50% 80%, #78E825 0%, #2E6608 30%, #0A1500 70%)',
}
