import './RuneAlphabet.css';

// Eine Referenzliste von Runen/Zeichen neben der Leinwand.
// items: [{ file, label }] – file lädt das Bild, label kommt aus der config.
function RuneAlphabet({title = 'Runen', items = [], path, side = 'right'}) {
    // Keine aktivierten Einträge -> Panel ausblenden statt leerer Box.
    if (items.length === 0) return null;

    return (
        <aside
            className={`rune-alphabet rune-alphabet--${side}`}
            aria-label={title}
        >
            <h2 className="rune-alphabet__title">{title}</h2>
            <ul className="rune-alphabet__list">
                {items.map(({file, label}) => (
                    <li key={file} className="rune-alphabet__item">
                        <img
                            className="rune-alphabet__image"
                            src={`${path}/${file}.png`}
                            alt={label}
                            loading="lazy"
                        />
                        <span className="rune-alphabet__label">{label}</span>
                    </li>
                ))}
            </ul>
        </aside>
    );
}

export default RuneAlphabet;