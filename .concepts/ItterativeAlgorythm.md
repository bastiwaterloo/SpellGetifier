We want to find Runes from the Alphabet in the canvas image.

The function should return a list of all found elements with the following data:
- Rune name/id
- size in px
- x/y position in the canvas
- rotation

We want to use the following algorithm:

```
for(rune)
    for(size)
        for(stepVertical)
            for(stepHorizontal)
                for(rotation)
                    matchWithPainting = calculateMatch()
                    if(matchWithPainting > threshold)
                        saveFinding(rune, size, position, rotation)
```

We need sensible constants for sizes, steps and rotations.
