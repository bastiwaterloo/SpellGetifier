import {RUNE_COUNT} from '../utils/runeRecognition.js';
import './RuneAlphabet.css';

// Alle verfügbaren Runen als "Alphabet" zur Referenz neben der Leinwand.
function RuneAlphabet() {
    const runes = Array.from({length: RUNE_COUNT}, (_, index) => index + 1);

    return (
        <aside className="rune-alphabet" aria-label="Verfügbare Runen">
            <h2 className="rune-alphabet__title">Runen</h2>
            <ul className="rune-alphabet__list">
                {runes.map((id) => {
                    const paddedId = String(id).padStart(2, '0');
                    return (
                        <li key={id} className="rune-alphabet__item">
                            <img
                                className="rune-alphabet__image"
                                src={`/assets/alphabet/rune_${paddedId}.png`}
                                alt={`Rune ${id}`}
                                loading="lazy"
                            />
                            <span className="rune-alphabet__label">{id}</span>
                        </li>
                    );
                })}
            </ul>
        </aside>
    );
}

export default RuneAlphabet;
