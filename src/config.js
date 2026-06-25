export const CANVAS_WIDTH = 500
export const CANVAS_HEIGHT = 500

export const STROKE_COLOR = '#000000'
export const STROKE_WIDTH = 2
export const ERASER_WIDTH = 20

export const RUNES_PATH = '/assets/alphabet'

export const RUNE_NAMES = [
    'Aeriforms_Defined',
    'Bend',
    'Billowing',
    'Binding',
    'Bolt',
    'Coil_Sign',
    'Collection',
    'Column',
    'Convergence',
    'Cooling',
    'Crosshair',
    'Crush',
    'Dancing_Puppet',
    'Diamond',
    'Direction',
    'Dispersion',
    'Enlarge',
    'Entwine',
    'Float',
    'Gather',
    'Glaives',
    'Levitation',
    'Link_Sign',
    'Orb',
    'Pull',
    'Purify_Sign',
    'Radial',
    'Rain',
    'Repetition',
    'Sign_of_concealment_redraw',
    'Sign_of_projection_redraw',
    'Sign_of_reflection_redraw',
    'Sign_of_Wind',
    'Solidify',
    'Stasis_Sign',
    'Weave',
    'Window'
]

export const RUNE_COUNT = RUNE_NAMES.length

// Working resolution for the iterative scan. The canvas is downscaled to this
// square size before convolution so conv2d intermediate textures stay under the
// WebGL maximum texture size (16384) for the largest templates. Must be <= 350.
export const DETECTION_RESOLUTION = 250

export const ITERATIVE_SIZES = [16, 24, 32, 48, 64, 96, 128]
export const ITERATIVE_ROTATIONS = Array.from({ length: 72 }, (_, i) => i * 5)
export const MATCH_THRESHOLD = 0.6
export const PENALTY_WEIGHT = 1.0
export const NMS_RELATIVE = 0.5
