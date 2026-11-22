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
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = canvas2.width = cw;
    canvas.height = canvas2.height = ch;

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
        paused = false,
        anim = null;                     // requestAnimationFrame id of the running slide animation

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

    // autoplay: advance every few seconds, pause while the user is interacting
    function restart() {
        clearInterval(timer);
        if (reducedMotion || paused || document.hidden) return;
        timer = setInterval(() => scrollToPos(pos + 1), AUTOPLAY_MS);
    }
    function pause() { paused = true; clearInterval(timer); }
    function resume() { paused = false; restart(); }

    slider.addEventListener('mouseenter', pause);
    slider.addEventListener('mouseleave', resume);
    // pause for keyboard users only; a mouse click on an arrow/dot also gives
    // the button focus, which would otherwise keep the slider paused forever
    slider.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) pause(); });
    slider.addEventListener('focusout', (e) => {
        if (!slider.contains(e.relatedTarget) && !slider.matches(':hover')) resume();
    });
    track.addEventListener('touchstart', restart, { passive: true });
    document.addEventListener('visibilitychange', restart);

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
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    // don't follow a link if the mouse was dragging
    track.addEventListener('click', (e) => {
        if (dragged) { e.preventDefault(); dragged = false; }
    }, true);

    // keyboard ← / → change slides while the slider is mostly on screen (or focused)
    let inView = false;
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; }, { threshold: 0.5 }).observe(slider);
    }
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        if (e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const t = e.target;
        if (t.isContentEditable || (t.closest && t.closest('input, textarea, select'))) return;  // typing
        if (!inView && !slider.contains(document.activeElement)) return;
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
