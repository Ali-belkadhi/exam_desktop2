/**
 * View : DesktopView
 */
document.addEventListener('DOMContentLoaded', () => {

    const ideWindow = document.getElementById('ideWindow');
    const btnAppIde = document.getElementById('btnAppIde');
    const btnLogout = document.getElementById('btnLogout');

    // Drag logic for window simulation
    let isDragging = false;
    let offset = { x: 0, y: 0 };

    const header = ideWindow.querySelector('.window-header');
    header.addEventListener('mousedown', (e) => {
        // Prevent click if we target a button
        if (e.target.tagName === 'BUTTON') return;

        isDragging = true;
        offset.x = e.clientX - ideWindow.offsetLeft;
        offset.y = e.clientY - ideWindow.offsetTop;
    });

    document.addEventListener('mouseup', () => isDragging = false);
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        ideWindow.style.left = `${e.clientX - offset.x}px`;
        ideWindow.style.top = `${e.clientY - offset.y}px`;
    });


    // ViewModel init
    const vm = new DesktopVM(render);

    // Initial check désactivé pour mode statique
    // if (!vm.user) {
    //     window.location.href = './login.html';
    // }

    // Events
    btnAppIde.addEventListener('click', () => vm.toggleIde());
    btnLogout.addEventListener('click', () => vm.logout());

    // Render loop
    function render() {
        if (vm.ideOpen) {
            ideWindow.style.display = 'flex';
            btnAppIde.classList.add('dock-item-active');
        } else {
            ideWindow.style.display = 'none';
            btnAppIde.classList.remove('dock-item-active');
        }
    }
});
