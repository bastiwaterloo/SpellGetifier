# SpellGetifier

Eine Web-App mit React (Plain JS) und Vite, die einen Zeichen-Canvas enthält.

## Funktionen

- Freihandzeichnen mit Maus und Touch
- Farbauswahl und einstellbare Strichstärke
- Leinwand löschen
- Zeichnung als PNG speichern
- Responsives Canvas (passt sich an Fenstergröße an, HiDPI-Unterstützung)

## Voraussetzungen

- [Node.js](https://nodejs.org/) (Version 18 oder höher)

## Installation

```bash
npm install
```

## Entwicklung starten

```bash
npm run dev
```

Die App ist anschließend unter der angezeigten lokalen Adresse erreichbar (Standard: `http://localhost:5173`).

## Produktions-Build

```bash
npm run build
npm run preview
```

## Projektstruktur

```
.
├── index.html
├── vite.config.js
├── package.json
└── src
    ├── main.jsx                  # Einstiegspunkt
    ├── App.jsx                   # Haupt-Komponente
    ├── App.css
    ├── index.css
    └── components
        ├── DrawingCanvas.jsx     # Zeichen-Canvas
        └── DrawingCanvas.css
```

## Dokumentation

- [TensorFlow.js – Referenz](docs/TensorFlowJS.md) — Funktionsweise von TensorFlow.js und mögliche Anbindung an die Runen-/Zauber-Erkennung
