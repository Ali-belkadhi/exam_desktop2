/**
 * View : LoginView
 * Fait le pont entre le DOM HTML et le ViewModel (Binding).
 */
document.addEventListener('DOMContentLoaded', () => {
    // Éléments du DOM
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.getElementById('submitBtn');
    const form = document.getElementById('loginForm');
    const errorMsg = document.getElementById('errorMsg');

    // Instanciation de ViewModel
    const viewModel = new LoginVM(render);

    // Événements (View -> ViewModel)
    emailInput.addEventListener('input', (e) => viewModel.setEmail(e.target.value));
    passwordInput.addEventListener('input', (e) => viewModel.setPassword(e.target.value));

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        viewModel.login();
    });

    // Rendu (ViewModel -> View)
    function render() {
        if (viewModel.isLoading) {
            submitBtn.textContent = 'Connexion en cours...';
            submitBtn.disabled = true;
        } else {
            submitBtn.textContent = 'Se connecter';
            submitBtn.disabled = false;
        }

        if (viewModel.errorMessage) {
            errorMsg.textContent = viewModel.errorMessage;
            errorMsg.style.display = 'block';
        } else {
            errorMsg.style.display = 'none';
        }
    }
});
