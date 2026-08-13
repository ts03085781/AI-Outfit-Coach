# Weather Bootstrap Icons Design

## Goal

Replace WeatherCard's Unicode weather symbols with Bootstrap-style React icons.

## Design

Install `react-icons` and import icons from `react-icons/bs`. Map each existing
`WeatherSnapshot["condition"]` value to one icon component: clear, partly cloudy,
cloudy, fog, rain, snow, and storm. The icon remains decorative (`aria-hidden`),
because the translated condition text already conveys the weather accessibly.

## Testing

Render a ready weather card using mocked geolocation and weather data, then assert
that the rain icon's accessible SVG label is present. This fails while WeatherCard
still renders a Unicode character and passes once `BsCloudRain` is used.
