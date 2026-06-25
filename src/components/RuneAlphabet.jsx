import {RUNE_NAMES, RUNES_PATH} from '../config.js';
import './RuneAlphabet.css';

// Eine Referenzliste von Runen/Zeichen neben der Leinwand.
// Wird sowohl für die Modifikatoren (rechts) als auch die Zeichen (links) genutzt.
function RuneAlphabet({
    title = 'Runen',
    names = RUNE_NAMES,
    path = RUNES_PATH,
    side = 'right'
}) {
    return (
        <aside
            className={`rune-alphabet rune-alphabet--${side}`}
            aria-label={title}
        >
            <h2 className="rune-alphabet__title">{title}</h2>
            <ul className="rune-alphabet__list">
                {names.map((name) => {
                    const displayName = name.replace(/_/g, ' ');
                    return (
                        <li key={name} className="rune-alphabet__item">
                            <img
                                className="rune-alphabet__image"
                                src={`${path}/${name}.png`}
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