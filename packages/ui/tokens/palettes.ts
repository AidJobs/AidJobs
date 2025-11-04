export type PaletteKey = 'mint' | 'sand';

export type ColorToken = 
  | 'bg' 
  | 'fg' 
  | 'muted' 
  | 'muted-foreground'
  | 'surface' 
  | 'surface-2'
  | 'accent' 
  | 'accent-foreground'
  | 'primary' 
  | 'primary-foreground'
  | 'warning' 
  | 'danger'
  | 'ring' 
  | 'border' 
  | 'input';

export type ThemeMode = 'light' | 'dark';

export type PaletteColors = {
  light: Record<ColorToken, string>;
  dark: Record<ColorToken, string>;
};

export const palettes: Record<PaletteKey, PaletteColors> = {
  mint: {
    light: {
      'bg': '255 255 254',
      'fg': '19 22 26',
      'muted': '244 246 248',
      'muted-foreground': '98 106 115',
      'surface': '248 249 250',
      'surface-2': '240 242 244',
      'accent': '198 232 216',
      'accent-foreground': '17 68 55',
      'primary': '28 142 121',
      'primary-foreground': '255 255 255',
      'warning': '246 211 101',
      'danger': '224 84 84',
      'ring': '28 142 121',
      'border': '226 230 235',
      'input': '226 230 235',
    },
    dark: {
      'bg': '14 17 20',
      'fg': '231 235 239',
      'muted': '28 32 36',
      'muted-foreground': '156 163 175',
      'surface': '20 24 28',
      'surface-2': '26 31 36',
      'accent': '36 66 58',
      'accent-foreground': '210 240 230',
      'primary': '28 142 121',
      'primary-foreground': '233 251 246',
      'warning': '246 211 101',
      'danger': '224 84 84',
      'ring': '28 142 121',
      'border': '45 51 58',
      'input': '45 51 58',
    },
  },
  sand: {
    light: {
      'bg': '255 254 252',
      'fg': '24 20 16',
      'muted': '248 246 242',
      'muted-foreground': '106 100 92',
      'surface': '250 248 244',
      'surface-2': '244 241 235',
      'accent': '232 220 198',
      'accent-foreground': '68 56 37',
      'primary': '142 112 68',
      'primary-foreground': '255 255 255',
      'warning': '246 211 101',
      'danger': '224 84 84',
      'ring': '142 112 68',
      'border': '230 225 215',
      'input': '230 225 215',
    },
    dark: {
      'bg': '18 16 14',
      'fg': '239 237 233',
      'muted': '32 30 26',
      'muted-foreground': '163 158 150',
      'surface': '24 22 19',
      'surface-2': '31 28 24',
      'accent': '58 50 38',
      'accent-foreground': '232 220 200',
      'primary': '142 112 68',
      'primary-foreground': '251 248 242',
      'warning': '246 211 101',
      'danger': '224 84 84',
      'ring': '142 112 68',
      'border': '48 44 38',
      'input': '48 44 38',
    },
  },
};

export function getPaletteColors(palette: PaletteKey, mode: ThemeMode): Record<ColorToken, string> {
  return palettes[palette][mode];
}
