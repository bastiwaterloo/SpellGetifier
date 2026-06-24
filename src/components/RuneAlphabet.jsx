import {RUNE_NAMES, RUNES_PATH} from '../config.js';
import './RuneAlphabet.css';

// Alle verfügbaren Runen als "Alphabet" zur Referenz neben der Leinwand.
function RuneAlphabet() {
    return (
        <aside className="rune-alphabet" aria-label="Verfügbare Runen">
            <h2 className="rune-alphabet__title">Runen</h2>
            <ul className="rune-alphabet__list">
                {RUNE_NAMES.map((name, index) => {
                    const displayName = name.replace(/_/g, ' ');
                    return (
                        <li key={name} className="rune-alphabet__item">
                            <img
                                className="rune-alphabet__image"
                                src={`${RUNES_PATH}/${name}.png`}
                                alt={displayName}
                                loading="lazy"
                            />
                            <span className="rune-alphabet__label">{displayName}</span>
                        </li>
                    );
                })}
            </ul>
        </aside>
    );
}

export default RuneAlphabet;
