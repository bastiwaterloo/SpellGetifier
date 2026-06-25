import {RUNES_PATH} from '../config.js';
import type {RuneTemplate} from './unistrokeRecognizer.ts';

export const RUNE_TEMPLATES: RuneTemplate[] = [
    {
        name: 'Feuer',
        id: 'fire',
        points: [
            {x: 0, y: 90},
            {x: 25, y: 45},
            {x: 45, y: 70},
            {x: 65, y: 25},
            {x: 85, y: 55},
            {x: 100, y: 10}
        ]
    },
    {
        name: 'Wind',
        id: 'wind',
        imagePath: `${RUNES_PATH}/Sign_of_Wind.png`,
        points: [
            {x: 0, y: 60},
            {x: 25, y: 40},
            {x: 50, y: 50},
            {x: 75, y: 30},
            {x: 100, y: 40},
            {x: 80, y: 65},
            {x: 55, y: 70},
            {x: 35, y: 60}
        ]
    }
];
