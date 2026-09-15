if (location.pathname.replace(/\/$/, '') === '/science') {
  void import('./science');
} else {
  void import('./main');
}
