// Navigation über den URL-Hash (funktioniert auf GitHub Pages ohne Server-Konfiguration)
export const geheZu = (pfad) => {
  window.location.hash = pfad;
};
