// The look plan, in one place. Dusk freight yard: warm sodium accent against cool
// teal-grey steel, with one colour per team so the eye reads friend from foe at a glance.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#171a20',
  surface: '#2b313c',
  hairline: '#3d4552',
  ink: '#ece7db',
  muted: '#9aa3ad',
  accent: '#f0a830',
  ground: '#3a3f4a',
  ember: '#e2603a',
  teal: '#3fa796',
  sable: '#3fa796',
  site: '#f0a830',
};

export function shade(name) {
  return PALETTE[name];
}
