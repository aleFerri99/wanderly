// Dichiarazioni globali per moduli senza type definitions

// Permette import dinamici di file CSS (es. leaflet/dist/leaflet.css)
declare module '*.css' {
  const content: Record<string, string>
  export default content
}
