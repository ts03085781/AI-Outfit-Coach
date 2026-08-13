# UV Risk Guidance Design

## Goal

Show a localized UV risk level and safety guidance below the UV index in the weather card.

## Design

Classify the existing displayed `WeatherSnapshot.uvIndex` into five inclusive
ranges: 0–2 low, 3–5 moderate, 6–7 high, 8–10 very high, and 11+ extreme.
Render the corresponding localized guidance directly below the index within the
existing UV detail block. Add the same message keys in Traditional Chinese,
English, Japanese, and Korean.

## Testing

Extract the pure range classifier and unit test every boundary. Render a UV 6
weather snapshot and assert its localized high-risk guidance appears below the
UV value.
