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