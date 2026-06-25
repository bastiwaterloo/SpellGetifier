import './SpellResult.css';

// Zeigt den aus den erkannten Runen abgeleiteten Zauber an.
// spell: { name, description, damage } oder null (dann nichts rendern).
function SpellResult({spell}) {
    if (!spell) return null;

    return (
        <section className="spell-result" aria-label="Zauber" aria-live="polite">
            <h2 className="spell-result__name">{spell.name}</h2>
            <p className="spell-result__description">{spell.description}</p>
            <p className="spell-result__damage">
                Schaden: <strong>{spell.damage}</strong>
            </p>
        </section>
    );
}

export default SpellResult;
