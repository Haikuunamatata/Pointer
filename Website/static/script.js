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

    // Glow effect for cards
    const cards = document.querySelectorAll('.feature-card');
    const glowDistance = 300; // Distance for glow activation

    function handleCardGlow(e) {
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const cardCenterX = rect.left + rect.width / 2;
            const cardCenterY = rect.top + rect.height / 2;
            const distanceX = e.clientX - cardCenterX;
            const distanceY = e.clientY - cardCenterY;
            const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

            if (distance < glowDistance) {
                // Calculate angle between mouse and card center
                const angle = (Math.atan2(distanceY, distanceX) * 180 / Math.PI + 90);
                
                card.style.setProperty('--glow-angle', `${angle}deg`);
                card.classList.add('glow');
            } else {
                card.classList.remove('glow');
            }
        });
    }

    document.addEventListener('mousemove', handleCardGlow);

    // Glow effect for bento grid cards
    const coreCards = document.querySelectorAll('.core-card');
    
    coreCards.forEach(card => {
        // Create and append the cursor backdrop element
        const backdrop = document.createElement('div');
        backdrop.classList.add('cursor-backdrop');
        card.appendChild(backdrop);
        
        card.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Set CSS variables for the glow effect position
            this.style.setProperty('--x', `${x}px`);
            this.style.setProperty('--y', `${y}px`);
        });
        
        // Add mouse enter event to ensure the cursor backdrop is visible immediately
        card.addEventListener('mouseenter', function() {
            this.classList.add('cursor-active');
        });
        
        // Add mouse leave event to reset the cursor position
        card.addEventListener('mouseleave', function() {
            this.classList.remove('cursor-active');
            // Reset cursor position to center when mouse leaves
            this.style.setProperty('--x', '50%');
            this.style.setProperty('--y', '50%');
        });
    });

    // Typing animation
    const text = "# AI suggests optimized solution";
    const typingText = document.querySelector('.typing-text');
    let charIndex = 0;

    function type() {
        if (charIndex < text.length) {
            typingText.textContent += text.charAt(charIndex);
            charIndex++;
            setTimeout(type, Math.random() * 100 + 50); // Random delay between 50-150ms
        } else {
            // Show AI suggestion after typing is complete
            setTimeout(() => {
                const aiSuggestion = document.querySelector('.ai-suggestion');
                if (aiSuggestion) {
                    aiSuggestion.style.display = 'flex';
                    aiSuggestion.style.opacity = '1';
                }
            }, 500);
        }
    }

    // Start typing animation after a short delay
    setTimeout(type, 1000);

    // Hide AI suggestion initially
    const aiSuggestion = document.querySelector('.ai-suggestion');
    if (aiSuggestion) {
        aiSuggestion.style.display = 'none';
        aiSuggestion.style.opacity = '0';
    }
}); 

// Initialize review cards scrolling
document.addEventListener('DOMContentLoaded', function() {
    const reviewTrackTop = document.querySelector('.review-track-top');
    const reviewTrackBottom = document.querySelector('.review-track-bottom');
    
    // Clone cards for top row if needed
    if (reviewTrackTop) {
        const cardsTop = reviewTrackTop.querySelectorAll('.review-card');
        const reviewContainer = document.querySelector('.review-container');
        const containerWidth = reviewContainer.offsetWidth;
        const cardWidth = cardsTop[0].offsetWidth + 40; // card width + margin
        const cardsNeeded = Math.ceil(containerWidth / cardWidth) + 1;
        
        // Clone extra cards if needed
        if (cardsTop.length < cardsNeeded * 2) {
            for (let i = 0; i < cardsNeeded; i++) {
                const clone = cardsTop[i % cardsTop.length].cloneNode(true);
                reviewTrackTop.appendChild(clone);
            }
        }
    }
    
    // Clone cards for bottom row if needed
    if (reviewTrackBottom) {
        const cardsBottom = reviewTrackBottom.querySelectorAll('.review-card');
        const reviewContainer = document.querySelector('.review-container');
        const containerWidth = reviewContainer.offsetWidth;
        const cardWidth = cardsBottom[0].offsetWidth + 40; // card width + margin
        const cardsNeeded = Math.ceil(containerWidth / cardWidth) + 1;
        
        // Clone extra cards if needed
        if (cardsBottom.length < cardsNeeded * 2) {
            for (let i = 0; i < cardsNeeded; i++) {
                const clone = cardsBottom[i % cardsBottom.length].cloneNode(true);
                reviewTrackBottom.appendChild(clone);
            }
        }
    }
});

// Add smooth scrolling behavior
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);
        
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 100,
                behavior: 'smooth'
            });
        }
    });
});

// Intersection Observer for reveal animations
document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('section');
    const featuresCards = document.querySelectorAll('.group');
    
    // Observer for sections
    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('section-visible');
                sectionObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    
    // Observer for cards with staggered animation
    const cardObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Add a slight delay for each card
                setTimeout(() => {
                    entry.target.classList.add('card-visible');
                }, index * 100);
                cardObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    
    // Observe all sections and cards
    sections.forEach(section => {
        section.classList.add('section-animate');
        sectionObserver.observe(section);
    });
    
    featuresCards.forEach(card => {
        card.classList.add('card-animate');
        cardObserver.observe(card);
    });
    
    // Parallax effect for background elements
    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        
        // Move background elements at different speeds
        document.querySelectorAll('.parallax').forEach(element => {
            const speed = element.getAttribute('data-speed') || 0.1;
            element.style.transform = `translateY(${scrollY * speed}px)`;
        });
    });
});

// Mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuButton = document.querySelector('.md\\:hidden');
    const mobileMenu = document.createElement('div');
    
    if (mobileMenuButton) {
        mobileMenu.className = 'fixed top-[90px] left-1/2 transform -translate-x-1/2 w-[90%] bg-background-light/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 z-40 shadow-lg transition-all duration-300 opacity-0 scale-95 pointer-events-none';
        mobileMenu.innerHTML = document.querySelector('.hidden.md\\:flex').innerHTML;
        document.body.appendChild(mobileMenu);
        
        mobileMenuButton.addEventListener('click', () => {
            if (mobileMenu.classList.contains('opacity-0')) {
                mobileMenu.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
                mobileMenu.classList.add('opacity-100', 'scale-100');
            } else {
                mobileMenu.classList.remove('opacity-100', 'scale-100');
                mobileMenu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            }
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileMenu.contains(e.target) && !mobileMenuButton.contains(e.target) && !mobileMenu.classList.contains('opacity-0')) {
                mobileMenu.classList.remove('opacity-100', 'scale-100');
                mobileMenu.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            }
        });
    }
});