import {useState} from 'react'
import DrawingCanvas from './components/DrawingCanvas.jsx'
import SpellResult from './components/SpellResult.jsx'
import './App.css'

function App() {
  const [spell, setSpell] = useState(null)

  return (
    <div className="app">
      <header className="app__header">
        <h1>SpellGetifier</h1>
        <p>Zeichne etwas auf die Leinwand.</p>
      </header>
      <SpellResult spell={spell} />
      <main className="app__main">
        <DrawingCanvas onSpellCast={setSpell} />
      </main>
    </div>
  )
}

export default App
