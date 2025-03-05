document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileToggle = document.querySelector('.navbar-mobile-toggle');
    const navLinks = document.querySelector('.navbar-links');
    const navbar = document.querySelector('.floating-navbar');
    
    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
        });
    }
    
    // Scroll effect for navbar
    function updateNavbar() {
        if (window.scrollY > 50) {
            navbar.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
            navbar.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.75)';
        } else {
            navbar.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
            navbar.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.25)';
        }
    }
    
    window.addEventListener('scroll', updateNavbar);
    
    // macOS dock hover effect
    const navItems = document.querySelectorAll('.navbar-links a');
    
    navItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            // Apply scale effect to current item
            this.style.transform = 'scale(1.1)';
            
            // Apply smaller scale effect to adjacent items
            const prev = this.previousElementSibling;
            const next = this.nextElementSibling;
            
            if (prev && prev.tagName === 'A') {
                prev.style.transform = 'scale(1.05)';
            }
            
            if (next && next.tagName === 'A') {
                next.style.transform = 'scale(1.05)';
            }
        });
        
        item.addEventListener('mouseleave', function() {
            // Reset scale for all items
            navItems.forEach(navItem => {
                navItem.style.transform = 'scale(1)';
            });
        });
    });
    
    // Initialize navbar state
    updateNavbar();
}); 