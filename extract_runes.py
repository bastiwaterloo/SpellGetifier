import cv2
import numpy as np
from pathlib import Path

# Pfade
source_image = r"C:\Users\basst\.cursor\projects\c-Users-basst-Desktop-Arbeit-SpellGetifier\assets\c__Users_basst_AppData_Roaming_Cursor_User_workspaceStorage_ebff20155e14bef364b098a7aa9ce200_images_Sign_Compilation-1f504c16-c816-4588-a4e0-1b046ca10cb9.png"
output_dir = Path("assets")
output_dir.mkdir(exist_ok=True)

# Einheitliche Größe für alle Runen
TARGET_SIZE = 128

# Bild laden
img = cv2.imread(source_image)
if img is None:
    raise FileNotFoundError(f"Bild nicht gefunden: {source_image}")

print(f"Bildgröße: {img.shape[1]}x{img.shape[0]}")

# In Graustufen konvertieren
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Raster-basierter Ansatz: Das Bild hat 4 Reihen mit 10, 10, 10, 4 Symbolen
# Wir teilen das Bild in ein Raster auf

height, width = gray.shape

# Rasterstruktur basierend auf dem Bild
# 4 Reihen, maximal 10 Spalten
ROWS = 4
COLS = 10

# Berechne Zellengröße
cell_width = width // COLS
cell_height = height // ROWS

print(f"Zellengröße: {cell_width}x{cell_height}")

# Symbole pro Reihe (basierend auf dem Originalbild)
symbols_per_row = [10, 10, 10, 4]

rune_count = 0

for row_idx, num_symbols in enumerate(symbols_per_row):
    for col_idx in range(num_symbols):
        # Berechne Zellenposition
        x1 = col_idx * cell_width
        y1 = row_idx * cell_height
        x2 = x1 + cell_width
        y2 = y1 + cell_height
        
        # Region extrahieren
        roi = gray[y1:y2, x1:x2]
        
        # In Schwarz-Weiß konvertieren
        _, bw = cv2.threshold(roi, 180, 255, cv2.THRESH_BINARY)
        
        # Finde die tatsächlichen Grenzen des Symbols in der Zelle
        # (um leeren Rand zu entfernen)
        _, binary_inv = cv2.threshold(roi, 180, 255, cv2.THRESH_BINARY_INV)
        
        # Finde Bounding Box des Inhalts
        coords = cv2.findNonZero(binary_inv)
        if coords is not None:
            x, y, w, h = cv2.boundingRect(coords)
            
            # Padding hinzufügen
            padding = 3
            x = max(0, x - padding)
            y = max(0, y - padding)
            w = min(roi.shape[1] - x, w + 2 * padding)
            h = min(roi.shape[0] - y, h + 2 * padding)
            
            # Symbol ausschneiden
            symbol = bw[y:y+h, x:x+w]
        else:
            # Keine Pixel gefunden, überspringe
            continue
        
        # Auf einheitliche Größe skalieren mit Seitenverhältnis
        h_sym, w_sym = symbol.shape
        
        if w_sym < 5 or h_sym < 5:
            continue
        
        # Berechne Skalierungsfaktor um ins Zielquadrat zu passen
        scale = min((TARGET_SIZE - 20) / w_sym, (TARGET_SIZE - 20) / h_sym)
        new_w = int(w_sym * scale)
        new_h = int(h_sym * scale)
        
        # Skalieren
        resized = cv2.resize(symbol, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        # In ein quadratisches Bild zentrieren
        final = np.ones((TARGET_SIZE, TARGET_SIZE), dtype=np.uint8) * 255
        x_offset = (TARGET_SIZE - new_w) // 2
        y_offset = (TARGET_SIZE - new_h) // 2
        final[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = resized
        
        # Speichern
        rune_count += 1
        filename = output_dir / f"rune_{rune_count:02d}.png"
        cv2.imwrite(str(filename), final)
        print(f"Gespeichert: {filename}")

print(f"\nFertig! {rune_count} Runen wurden nach '{output_dir}' extrahiert.")
print(f"Alle Bilder haben die Größe {TARGET_SIZE}x{TARGET_SIZE} Pixel.")
