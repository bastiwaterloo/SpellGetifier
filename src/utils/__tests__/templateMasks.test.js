import { describe, it, expect } from 'vitest';

import { buildTemplateDescriptors } from '../templateMasks.js';
import {
  ENABLED_RUNES,
  ENABLED_SIGNS,
  RUNES_PATH,
  SIGNS_PATH,
} from '../../config.js';

describe('buildTemplateDescriptors', () => {
  it('includes every enabled rune tagged "sign" and every enabled sigil tagged "sigil"', () => {
    const descriptors = buildTemplateDescriptors();

    const signs = descriptors.filter((d) => d.type === 'sign');
    const sigils = descriptors.filter((d) => d.type === 'sigil');

    expect(signs).toHaveLength(ENABLED_RUNES.length);
    expect(sigils).toHaveLength(ENABLED_SIGNS.length);
    expect(descriptors).toHaveLength(
      ENABLED_RUNES.length + ENABLED_SIGNS.length,
    );
  });

  it('loads sigils from SIGNS_PATH and runes from RUNES_PATH', () => {
    const descriptors = buildTemplateDescriptors();

    const fire = descriptors.find((d) => d.name === 'Fire');
    const light = descriptors.find((d) => d.name === 'Light');

    expect(fire).toMatchObject({
      type: 'sigil',
      imagePath: `${SIGNS_PATH}/Fire_sigil.png`,
    });
    expect(light).toMatchObject({
      type: 'sigil',
      imagePath: `${SIGNS_PATH}/Light.png`,
    });
    expect(descriptors.every((d) =>
      d.type === 'sign'
        ? d.imagePath.startsWith(`${RUNES_PATH}/`)
        : d.imagePath.startsWith(`${SIGNS_PATH}/`),
    )).toBe(true);
  });

  it('assigns unique sequential ids across the combined list', () => {
    const descriptors = buildTemplateDescriptors();

    const ids = descriptors.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(descriptors.map((_, i) => i + 1));
  });
});
