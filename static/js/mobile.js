// mobile.js - улучшенная версия
class MobileUX {
    constructor() {
        this.initialHeight = window.innerHeight;
        this.init();
    }
    
    init() {
        this.preventZoom();
        this.setupTouchEvents();
        this.setupKeyboard();
        this.setupViewport();
    }
    
    setupViewport() {
        // Динамическое управление viewport
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', 
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        }
    }
    
    preventZoom() {
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
        
        // Дополнительная защита от масштабирования
        document.addEventListener('touchmove', (event) => {
            if (event.scale !== 1) {
                event.preventDefault();
            }
        }, { passive: false });
    }
    
    setupTouchEvents() {
        // Улучшенная обработка касаний для полей ввода
        document.addEventListener('touchstart', (e) => {
            if (e.target.classList.contains('student-field')) {
                e.stopPropagation();
                setTimeout(() => {
                    this.scrollToInput(e.target);
                }, 200);
            }
        }, { passive: true });
    }
    
    setupKeyboard() {
        window.addEventListener('resize', () => {
            const isKeyboardOpen = window.innerHeight < this.initialHeight * 0.7;
            if (isKeyboardOpen) {
                document.body.classList.add('keyboard-open');
            } else {
                document.body.classList.remove('keyboard-open');
            }
        });
    }
    
    scrollToInput(input) {
        if (!this.isElementInViewport(input)) {
            input.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
        }
    }
    
    isElementInViewport(el) {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth
        );
    }
}

// Автоматическая инициализация при загрузке
if (window.innerWidth <= 768 || 
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    document.addEventListener('DOMContentLoaded', () => {
        window.mobileUX = new MobileUX();
    });
}