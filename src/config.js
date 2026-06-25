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

// Stroke dilation radius (in working-resolution pixels) applied to both the
// drawing and each template before correlation. Thin runes only overlap when
// aligned almost perfectly; thickening the strokes gives tolerance to small
// scale/rotation/position offsets so the correct template still matches.
export const DILATION_RADIUS = 2

// White margin padded around each rasterized template, as a multiple of the
// glyph's rotated bounding box. The scoring penalty spans this padded box, so
// drawn ink that spills into a template's margin (i.e. the template only covers
// a fragment of a larger drawn glyph) is penalized — while genuinely isolated
// runes keep clean margins and still score high. This is what lets multi-rune
// detection reject fragment matches.
export const TEMPLATE_MARGIN_FACTOR = 1.5

// How many rotations to score in a single batched convolution. Each rune size's
// 72 rotations are processed in sequential sub-batches of this many channels,
// so the peak GPU tensor (coverage map: [1, oH, oW, batch]) stays small and
// textures are released between sub-batches.
export const ROTATION_BATCH_SIZE = 24

export const ITERATIVE_SIZES = [16, 24, 32, 48, 64, 96, 128]
export const ITERATIVE_ROTATIONS = Array.from({ length: 72 }, (_, i) => i * 5)
// Minimum IoU (intersection-over-union) for a template to count as a finding.
// IoU runs lower than the old coverage score — a near-perfect match is ~0.8,
// so this is set below that to admit imperfect freehand drawings.
export const MATCH_THRESHOLD = 0.5
export const NMS_RELATIVE = 0.5
