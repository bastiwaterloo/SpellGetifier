import './RuneAlphabet.css';

// Eine Referenzliste von Runen/Zeichen neben der Leinwand.
// items: [{ file, label }] – file lädt das Bild, label kommt aus der config.
// onSelect (optional) macht die Einträge anklickbar; selectedFile hebt einen hervor.
function RuneAlphabet({title = 'Runen', items = [], path, side = 'right', onSelect, selectedFile}) {
    // Keine aktivierten Einträge -> Panel ausblenden statt leerer Box.
    if (items.length === 0) return null;

    const selectable = typeof onSelect === 'function';

    return (
        <aside
            className={`rune-alphabet rune-alphabet--${side}`}
            aria-label={title}
        >
            <h2 className="rune-alphabet__title">{title}</h2>
            <ul className="rune-alphabet__list">
                {items.map(({file, label}) => {
                    const isSelected = selectable && file === selectedFile;
                    const content = (
                        <>
                            <img
                                className="rune-alphabet__image"
                                src={`${path}/${file}.png`}
                                alt={label}
                                loading="lazy"
                            />
                            <span className="rune-alphabet__label">{label}</span>
                        </>
                    );
                    return (
                        <li key={file} className="rune-alphabet__item">
                            {selectable ? (
                                <button
                                    type="button"
                                    className={
                                        'rune-alphabet__select' +
                                        (isSelected ? ' rune-alphabet__select--active' : '')
                                    }
                                    onClick={() => onSelect(file)}
                                    aria-pressed={isSelected}
                                >
                                    {content}
                                </button>
                            ) : (
                                content
                            )}
                        </li>
                    );
                })}
            </ul>
        </aside>
    );
}

export default RuneAlphabet;
