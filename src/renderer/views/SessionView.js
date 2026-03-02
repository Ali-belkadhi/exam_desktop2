document.addEventListener('DOMContentLoaded', () => {
    const codeInput = document.getElementById('sessionCode');
    const submitBtn = document.getElementById('submitBtn');
    const form = document.getElementById('sessionForm');

    const viewModel = new SessionVM(render);

    codeInput.addEventListener('input', (e) => viewModel.setCode(e.target.value));

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        viewModel.join();
    });

    function render() {
        if (viewModel.isLoading) {
            submitBtn.textContent = 'Connexion en cours...';
            submitBtn.disabled = true;
        } else {
            submitBtn.textContent = 'Rejoindre la session';
            submitBtn.disabled = false;
        }
    }
});
