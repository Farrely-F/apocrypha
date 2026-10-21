// Shared props for the vendored effects so the landing page and /fx agree.
// Colours stay inside the theme: abyss ground, bile-green signal, nothing pale.

export const ditherDim = {
  waveColor: [0.03, 0.26, 0.17],
  backgroundColor: [0.004, 0.014, 0.012],
  colorNum: 3,
  pixelSize: 3,
  waveAmplitude: 0.3,
  waveSpeed: 0.03,
  brightness: -0.2,
  enableMouseInteraction: false,
  clickRipple: false,
} as const;
