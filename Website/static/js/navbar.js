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

    // Mobile menu toggle handling
    const menuButton = document.querySelector('.md\\:hidden');
    const mobileMenu = document.querySelector('.mobile-menu');
    
    // Create mobile menu if it doesn't exist
    if (!mobileMenu) {
        const newMobileMenu = document.createElement('div');
        newMobileMenu.className = 'mobile-menu fixed top-[90px] left-1/2 transform -translate-x-1/2 w-[90%] bg-background-light/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 z-40 shadow-lg transition-all duration-300 opacity-0 scale-95 pointer-events-none flex flex-col gap-4';
        
        // Get the desktop menu items and clone them
        const desktopLinks = document.querySelector('.hidden.md\\:flex');
        if (desktopLinks) {
            newMobileMenu.innerHTML = desktopLinks.innerHTML;
        }
        
        document.body.appendChild(newMobileMenu);
    }
    
    const currentMobileMenu = document.querySelector('.mobile-menu');
    
    // Toggle mobile menu when menu button is clicked
    if (menuButton && currentMobileMenu) {
        menuButton.addEventListener('click', function() {
            if (currentMobileMenu.classList.contains('opacity-0')) {
                // Show menu
                currentMobileMenu.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
                currentMobileMenu.classList.add('opacity-100', 'scale-100');
            } else {
                // Hide menu
                currentMobileMenu.classList.remove('opacity-100', 'scale-100');
                currentMobileMenu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            }
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!currentMobileMenu.contains(e.target) && !menuButton.contains(e.target) && !currentMobileMenu.classList.contains('opacity-0')) {
                currentMobileMenu.classList.remove('opacity-100', 'scale-100');
                currentMobileMenu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            }
        });
        
        // Close menu when clicking a link in mobile menu
        const mobileLinks = currentMobileMenu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', function() {
                currentMobileMenu.classList.remove('opacity-100', 'scale-100');
                currentMobileMenu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            });
        });
    }
    
    // Navbar scroll effect
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('nav');
        if (navbar) {
            if (window.scrollY > 100) {
                navbar.classList.add('bg-background/90');
                navbar.classList.remove('top-5');
                navbar.classList.add('top-0');
                navbar.classList.add('rounded-none');
                navbar.classList.add('w-full');
                navbar.classList.add('max-w-none');
            } else {
                navbar.classList.remove('bg-background/90');
                navbar.classList.add('top-5');
                navbar.classList.remove('top-0');
                navbar.classList.remove('rounded-none');
                navbar.classList.remove('w-full');
                navbar.classList.remove('max-w-none');
            }
        }
    });
}); 