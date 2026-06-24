import DrawingCanvas from './components/DrawingCanvas.jsx'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>SpellGetifier</h1>
        <p>Zeichne etwas auf die Leinwand.</p>
      </header>
      <main className="app__main">
        <DrawingCanvas />
      </main>
    </div>
  )
}

export default App
