// Preserve previously shared /?room=CODE and /index.html?room=CODE entry links.
const currentUrl = new URL(window.location.href);
if (currentUrl.searchParams.get('room')?.trim()) {
  const entryUrl = new URL('./lucky-draw.html', currentUrl);
  entryUrl.search = currentUrl.search;
  entryUrl.hash = currentUrl.hash;
  window.location.replace(entryUrl.href);
}
