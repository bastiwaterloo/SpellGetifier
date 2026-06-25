import {PARTICLE_PARAM_CONTROLS} from '../config/elementPresets.js';
import './ElementDebugPanel.css';

const roundToTwoDecimals = (value) => Math.round(Number(value) * 100) / 100;

const formatDebugValue = (value) => roundToTwoDecimals(value).toFixed(2);

// Live-Regler zum Testen der Partikel-Parameter eines Elements.
function ElementDebugPanel({title, params, onChange, onReset, onReplay}) {
    return (
        <div className="element-debug">
            <h3 className="element-debug__title">Debug: {title}</h3>
            {PARTICLE_PARAM_CONTROLS.map(({key, label, min, max, step}) => (
                <label key={key} className="element-debug__row">
                    <span className="element-debug__label">{label}</span>
                    <input
                        className="element-debug__slider"
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={params[key]}
                        onChange={(event) =>
                            onChange(key, roundToTwoDecimals(event.target.value))
                        }
                    />
                    <span className="element-debug__value">
                        {formatDebugValue(params[key])}
                    </span>
                </label>
            ))}
            <div className="element-debug__actions">
                <button
                    type="button"
                    className="element-debug__button"
                    onClick={onReplay}
                >
                    Erneut zünden
                </button>
                <button
                    type="button"
                    className="element-debug__button"
                    onClick={onReset}
                >
                    Zurücksetzen
                </button>
            </div>
        </div>
    );
}

export default ElementDebugPanel;
