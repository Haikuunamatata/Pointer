document.addEventListener('DOMContentLoaded', () => {
    const hero = document.querySelector('.hero');
    let isMouseMoving = false;
    let mouseTimeout;

    function updateCursorLight(e) {
        const rect = hero.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        hero.style.setProperty('--cursor-x', `${x}px`);
        hero.style.setProperty('--cursor-y', `${y}px`);
        
        hero.classList.add('cursor-active');
        
        clearTimeout(mouseTimeout);
        isMouseMoving = true;
        
        mouseTimeout = setTimeout(() => {
            isMouseMoving = false;
            hero.classList.remove('cursor-active');
        }, 100);
    }

    hero.addEventListener('mousemove', updateCursorLight);
}); 