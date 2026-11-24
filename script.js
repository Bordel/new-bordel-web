const canvas = document.getElementById('canvas'),
    ctx = canvas.getContext('2d'),
    canvas2 = document.getElementById('canvas2'),
    ctx2 = canvas2.getContext('2d'),
    // charArr = ['BORDEL'],
    charArr = ['B', 'O', 'R', 'D', 'E', 'L'],
    fallingCharArr = [],
    fontSize = 10;

// full screen dimensions, updated on resize
let cw, ch;


function randomInt( min, max ) {
    return Math.floor(Math.random() * ( max - min ) + min);
}

function randomFloat( min, max ) {
    return Math.random() * ( max - min ) + min;
}

function Point(x,y)
{
    this.x = x;
    this.y = y;
}

Point.prototype.draw = function(ctx){

    this.value = charArr[randomInt(0,charArr.length)].toUpperCase();
    this.speed = randomFloat(1,5);


    ctx2.fillStyle = "rgba(255,255,255,0.8)";
    ctx2.font = fontSize+"px sans-serif";
    ctx2.fillText(this.value,this.x,this.y);

    // ctx.fillStyle = "#0F0";
    ctx.fillStyle = "#00a400";
    ctx.font = fontSize+"px sans-serif";
    ctx.fillText(this.value,this.x,this.y);



    this.y += this.speed;
    if(this.y > ch)
    {
        this.y = randomFloat(-100,0);
        this.speed = randomFloat(2,5);
    }
}

function resize() {
    const w = window.innerWidth,
        h = window.innerHeight;
    // On phones the address bar hides/shows while scrolling, which fires 'resize' with a
    // slightly different height. Re-setting canvas.width/height wipes the canvas (the rain
    // flickers and restarts), so only resize when the width changes or the screen grows.
    if (w === cw && h <= ch) return;
    ch = w === cw ? Math.max(h, ch) : h;
    cw = w;
    canvas.width = canvas2.width = cw;
    canvas.height = canvas2.height = ch;
    canvas.style.height = canvas2.style.height = ch + 'px';   // never stretch the drawing

    // add or remove columns so they cover the full width
    const columns = Math.ceil(cw / fontSize);
    while (fallingCharArr.length < columns) {
        fallingCharArr.push(new Point(fallingCharArr.length * fontSize, randomFloat(-500, 0)));
    }
    fallingCharArr.length = columns;
}

resize();
window.addEventListener('resize', resize);


const update = function()
{

    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0,0,cw,ch);

    ctx2.clearRect(0,0,cw,ch);

    let i = fallingCharArr.length;

    while (i--) {
        fallingCharArr[i].draw(ctx);
    }

    requestAnimationFrame(update);
}

update();

// ---------- sticky header height ----------
// Menu jumps (#about, #contact, ...) stop below the sticky header. Its height changes
// when it wraps to two lines (narrow phones, big fonts), so publish the real height
// as --header-h for the CSS scroll-margin.
(function () {
    const header = document.querySelector('header');
    if (!header) return;
    const update = () => {
        // stuck at top:0 its margin takes no space, so only the box height counts
        document.documentElement.style.setProperty('--header-h', Math.ceil(header.offsetHeight) + 'px');
    };
    update();
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(header);
    else window.addEventListener('resize', update);
})();

// ---------- activities slider ----------
// Seamless loop: a copy of the last slide sits before the first one and a copy
// of the first slide after the last one. When the track lands on a copy, it
// jumps instantly (invisibly) to the matching real slide.
(function () {
    const slider = document.getElementById('activities-slider');
    if (!slider) return;

    const track = slider.querySelector('.slider-track'),
        slides = Array.from(slider.querySelectorAll('.slide')),
        n = slides.length,
        dotsWrap = slider.querySelector('.slider-dots'),
        AUTOPLAY_MS = 5000,
        reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // clones are decoration only: hide them from screen readers and keyboard
    function makeClone(slide) {
        const c = slide.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        c.querySelectorAll('a, button').forEach(el => el.setAttribute('tabindex', '-1'));
        return c;
    }
    track.prepend(makeClone(slides[n - 1]));
    track.append(makeClone(slides[0]));

    // "pos" = position in the track including clones (0 .. n+1); real slide i is at pos i+1
    let pos = 1,
        timer = null,
        anim = null;                    // requestAnimationFrame id of the running slide animation

    const SLIDE_MS = reducedMotion ? 0 : 500;

    const width = () => track.clientWidth;
    const realIndex = p => (p - 1 + n) % n;

    function jumpTo(p) {                 // instant, no animation
        track.scrollLeft = p * width();
        pos = p;
    }

    // if we ended up on a clone, swap to the matching real slide (invisible)
    function settle() {
        const p = Math.round(track.scrollLeft / width());
        if (p === 0) jumpTo(n);
        else if (p === n + 1) jumpTo(1);
        else jumpTo(p);
        updateDots();
    }

    // Animate the scroll ourselves instead of relying on native smooth
    // scrolling, which does not play well with scroll-snap in some browsers.
    function scrollToPos(p) {
        cancelAnimationFrame(anim);
        pos = Math.max(0, Math.min(n + 1, p));
        updateDots();

        const from = track.scrollLeft,
            to = pos * width(),
            start = performance.now();
        track.classList.add('animating');   // turn snapping off while we move

        function step() {
            const now = performance.now(),
                t = SLIDE_MS ? Math.min(1, (now - start) / SLIDE_MS) : 1,
                eased = 1 - Math.pow(1 - t, 3);          // ease-out
            track.scrollLeft = from + (to - from) * eased;
            if (t < 1) {
                anim = requestAnimationFrame(step);
            } else {
                anim = null;
                track.classList.remove('animating');
                settle();
            }
        }
        anim = requestAnimationFrame(step);
    }

    // after the user swipes with touch/trackpad, fix up clones once scrolling stops
    function onScrollEnd() {
        if (anim || track.classList.contains('dragging')) return;
        settle();
    }

    if ('onscrollend' in window) {
        track.addEventListener('scrollend', onScrollEnd);
    } else {                             // Safari: approximate with a debounce
        let t;
        track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(onScrollEnd, 120); }, { passive: true });
    }

    // dots follow the slide while it is still moving
    track.addEventListener('scroll', () => {
        if (anim) return;
        const p = Math.round(track.scrollLeft / width());
        if (p !== pos) { pos = p; updateDots(); }
    }, { passive: true });

    const dots = slides.map((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
        dot.addEventListener('click', () => { scrollToPos(i + 1); restart(); });
        dotsWrap.appendChild(dot);
        return dot;
    });

    function updateDots() {
        const current = realIndex(pos);
        dots.forEach((d, i) => d.setAttribute('aria-current', i === current));
    }

    slider.querySelector('.slider-prev').addEventListener('click', () => { scrollToPos(pos - 1); restart(); });
    slider.querySelector('.slider-next').addEventListener('click', () => { scrollToPos(pos + 1); restart(); });

    // autoplay: keeps advancing every few seconds, also while the mouse hovers it.
    // It stops only while keyboard focus is inside the slider, so a focused link
    // is never scrolled out of view.
    // Any manual move (arrow, dot, key, swipe, drag) calls restart(), so the next
    // automatic step waits a full interval instead of jumping right after it.
    let focusPaused = false,             // keyboard focus inside the slider
        inView = !('IntersectionObserver' in window),   // slider well visible on screen (see below)
        touching = false;                // a finger is on the slider

    function restart() {
        clearInterval(timer);
        if (reducedMotion || document.hidden || focusPaused || !inView) return;   // only animate while it can be seen
        timer = setInterval(() => {
            // never move a slide while the visitor is holding/dragging it
            if (!touching && !track.classList.contains('dragging')) scrollToPos(pos + 1);
        }, AUTOPLAY_MS);
    }

    // keyboard focus only (:focus-visible); a mouse click on an arrow/dot also
    // focuses that button, but must not stop the autoplay
    slider.addEventListener('focusin', (e) => {
        if (e.target.matches(':focus-visible')) { focusPaused = true; restart(); }
    });
    slider.addEventListener('focusout', (e) => {
        if (!slider.contains(e.relatedTarget)) { focusPaused = false; restart(); }
    });
    track.addEventListener('touchstart', () => { touching = true; restart(); }, { passive: true });
    const touchEnd = () => { touching = false; restart(); };
    track.addEventListener('touchend', touchEnd, { passive: true });
    track.addEventListener('touchcancel', touchEnd, { passive: true });
    document.addEventListener('visibilitychange', restart);

    // "well visible" = at least half of the slider, or half of the screen height when the
    // slider is taller than that (short landscape phones), is on screen. Autoplay only runs
    // then, so the slider doesn't keep turning while it's scrolled out of view; the arrow
    // keys use the same check.
    if ('IntersectionObserver' in window) {
        const steps = Array.from({ length: 21 }, (_, i) => i / 20);
        new IntersectionObserver(([entry]) => {
            const needed = Math.min(entry.boundingClientRect.height, window.innerHeight) * 0.5;
            const visible = entry.isIntersecting && entry.intersectionRect.height >= needed;
            if (visible !== inView) { inView = visible; restart(); }
        }, { threshold: steps }).observe(slider);
    }

    // mouse drag on desktop (touch swipe already works natively)
    let dragStartX = 0, dragStartPos = 1, dragged = false;

    track.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        if (anim) { cancelAnimationFrame(anim); anim = null; track.classList.remove('animating'); }
        settle();                        // settle any clone first
        dragStartX = e.clientX;
        dragStartPos = pos;
        dragged = false;
        track.classList.add('dragging');
        track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', (e) => {
        if (!track.classList.contains('dragging')) return;
        const dx = e.clientX - dragStartX;
        if (Math.abs(dx) > 5) dragged = true;
        track.scrollLeft = dragStartPos * width() - dx;
    });
    function endDrag(e) {
        if (!track.classList.contains('dragging')) return;
        track.classList.remove('dragging');
        const dx = e.clientX - dragStartX,
            threshold = width() * 0.15;
        // a short drag snaps back, a longer one moves to the neighbouring slide
        scrollToPos(dx < -threshold ? dragStartPos + 1 : dx > threshold ? dragStartPos - 1 : dragStartPos);
        restart();
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    // don't follow a link if the mouse was dragging
    track.addEventListener('click', (e) => {
        if (dragged) { e.preventDefault(); dragged = false; }
    }, true);

    // keyboard ← / → change slides when focus is inside the slider, or when nothing
    // else has focus and the slider is well visible. Any other focused control
    // (link, button, media player, tabs, text field, ...) keeps its own arrow keys.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        if (e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const active = document.activeElement;
        const nothingFocused = !active || active === document.body || active === document.documentElement;
        if (slider.contains(active)) {
            // inside the slider: fine, except not for a focused text field (none today, but be safe)
            if (active.isContentEditable || active.matches('input, textarea, select')) return;
        } else if (!(nothingFocused && inView)) {
            return;
        }
        e.preventDefault();
        scrollToPos(pos + (e.key === 'ArrowRight' ? 1 : -1));
        restart();
    });

    // keep the visible slide aligned after a resize
    window.addEventListener('resize', () => jumpTo(pos));

    jumpTo(1);                           // start on the first real slide, not the clone
    updateDots();
    restart();
})();
