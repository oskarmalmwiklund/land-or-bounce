if (location.pathname.replace(/\/$/, '') === '/science' || new URLSearchParams(location.search).get('science') === '1') {
  void import('./science');
} else {
  void import('./main');
}
