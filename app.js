const form = document.querySelector('#login-form');
const status = document.querySelector('#status');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  status.textContent = 'Tela inicial pronta. A ligação com o login real será a próxima etapa.';
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js');
}
