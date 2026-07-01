document.addEventListener('DOMContentLoaded', () => {
    const { Engine, Render, Runner, World, Bodies, Body, Mouse, MouseConstraint, Events } = Matter;

    const engine = Engine.create();
    engine.gravity.y = 0;
    engine.gravity.x = 0;

    const render = Render.create({
        canvas: document.getElementById('world'),
        engine: engine,
        options: {
            width: window.innerWidth,
            height: window.innerHeight,
            background: '#ffffff',
            wireframes: false
        }
    });

    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    let MAX_SPEED = 30;
    let selectedBody = null;
    let allowRotation = true;

    // Toggle whether a word body can rotate. Locking rotation sets inertia to
    // Infinity (Matter.js convention); unlocking restores the body's original
    // inertia stored at creation time.
    const applyRotation = (body) => {
        if (body.isStatic) return;
        if (allowRotation) {
            if (body.defaultInertia !== undefined) {
                Body.setInertia(body, body.defaultInertia);
            }
        } else {
            Body.setInertia(body, Infinity);
            Body.setAngularVelocity(body, 0);
        }
    };

    let walls = [];

    const createWalls = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const thickness = 100;
        walls = [
            Bodies.rectangle(w / 2, -thickness / 2, w, thickness, { isStatic: true }),
            Bodies.rectangle(w / 2, h + thickness / 2, w, thickness, { isStatic: true }),
            Bodies.rectangle(-thickness / 2, h / 2, thickness, h, { isStatic: true }),
            Bodies.rectangle(w + thickness / 2, h / 2, thickness, h, { isStatic: true })
        ];
        World.add(engine.world, walls);
    };

    createWalls();

    // Pin the Articles section to the exact bottom of the canvas. The canvas
    // height is `window.innerHeight` (JS px), which does NOT equal CSS `100vh`
    // on mobile (browser chrome makes them differ), so a static `top: 100vh`
    // leaves the articles overlapping or gapped away from the canvas. Driving
    // the offset from the same value the canvas uses keeps them aligned.
    const syncContentTop = (h) => {
        const content = document.querySelector('.content');
        if (content) content.style.top = `${h}px`;
    };

    // Keep the canvas buffer, render bounds and walls in sync with the window
    // size. Without this, resizing leaves the old canvas dimensions and wall
    // positions, so the visible area and collision boundaries desync.
    const handleResize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;

        render.canvas.width = w;
        render.canvas.height = h;
        render.options.width = w;
        render.options.height = h;
        render.bounds.max.x = w;
        render.bounds.max.y = h;

        syncContentTop(h);

        World.remove(engine.world, walls);
        createWalls();

        // Pull any word bodies that fell outside the new bounds back into view.
        const margin = 50;
        engine.world.bodies.forEach(body => {
            if (body.isStatic) return;
            const x = Math.min(Math.max(body.position.x, margin), w - margin);
            const y = Math.min(Math.max(body.position.y, margin), h - margin);
            if (x !== body.position.x || y !== body.position.y) {
                Body.setPosition(body, { x, y });
            }
        });
    };

    let resizeScheduled = false;
    window.addEventListener('resize', () => {
        if (resizeScheduled) return;
        resizeScheduled = true;
        requestAnimationFrame(() => {
            resizeScheduled = false;
            handleResize();
        });
    });

    syncContentTop(window.innerHeight);

    const createWordTexture = (word, size, color = '#161616') => {
        const canvasText = document.createElement('canvas');
        const ctx = canvasText.getContext('2d');
        ctx.font = `600 ${size}px 'IBM Plex Sans'`;
        const width = ctx.measureText(word).width;
        canvasText.width = width;
        canvasText.height = size * 1.25;
        ctx.font = `600 ${size}px 'IBM Plex Sans'`;
        ctx.fillStyle = color;
        ctx.fillText(word, 0, size);
        return canvasText.toDataURL();
    };

    // Adapt the v2 /api/news payload to the shape the renderer expects:
    // map count -> freq, link -> url, summary -> description, placeholder image,
    // and rebuild per-word article_ids from each article's matched_words.
    const adaptResponse = (data) => {
        const articles = (data.articles || []).map((a, i) => ({
            id: i,
            title: a.title,
            description: a.summary || '',
            url: a.link,
            matched_words: a.matched_words || []
        }));
        const words = (data.words || []).map(w => ({
            word: w.word,
            freq: w.count,
            article_ids: articles
                .filter(a => a.matched_words.includes(w.word))
                .map(a => a.id)
        }));
        return { words, articles };
    };

    const loadWords = (topic = 'TOP', edition = 'JP', count = 50, frictionAir = 0.001, restitution = 1, excluded_words = default_excluded_words) => {
        const excludedList = Array.isArray(excluded_words) ? excluded_words : String(excluded_words).split(',');
        const excludedSet = new Set(excludedList.map(s => s.trim().toLowerCase()).filter(Boolean));

        fetch(`/api/news?topic=${encodeURIComponent(topic)}&edition=${encodeURIComponent(edition)}&limit=${count}`)
            .then(res => res.json())
            .then(raw => {
                const { words: allWords, articles } = adaptResponse(raw);
                const words = allWords.filter(w => !excludedSet.has(w.word.toLowerCase()));

                const maxFreq = words.length ? Math.max(...words.map(w => w.freq)) : 0;
                const minFreq = words.length ? Math.min(...words.map(w => w.freq)) : 0;
                const freqRange = (maxFreq - minFreq) || 1;

                words.forEach(w => {
                    const size = 16 + ((w.freq - minFreq) / freqRange) * 64;
                    const texture = createWordTexture(w.word, size);
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    ctx.font = `600 ${size}px 'IBM Plex Sans'`;
                    const width = ctx.measureText(w.word).width;

                    const body = Bodies.rectangle(
                        Math.random() * (window.innerWidth - 100) + 50,
                        Math.random() * (window.innerHeight - 100) + 50,
                        width,
                        size,
                        {
                            render: {
                                sprite: {
                                    texture: texture,
                                    xScale: 1,
                                    yScale: 1
                                }
                            },
                            restitution: restitution,
                            frictionAir: frictionAir
                        }
                    );

                    body.article_ids = w.article_ids;
                    body.originalTexture = texture;
                    body.word = w.word;
                    body.size = size;
                    body.defaultInertia = body.inertia;
                    applyRotation(body);

                    Body.setVelocity(body, {
                        x: (Math.random() - 0.5) * 2,
                        y: (Math.random() - 0.5) * 2
                    });

                    World.add(engine.world, body);
                });

                const newsContainer = document.getElementById('news-container');
                newsContainer.innerHTML = '';
                articles.forEach(article => {
                    const cardWrapper = document.createElement('div');
                    cardWrapper.className = 'card__wrapper';
                    cardWrapper.dataset.articleId = article.id;
                    cardWrapper.addEventListener('click', () => {
                        window.open(article.url, '_blank');
                    });

                    const card = document.createElement('article');
                    card.className = 'card';
                    card.innerHTML = `
                        <div class="card__header">
                            <p class="card__title">${article.title}</p>
                        </div>
                        <div class="card__body">
                            <p class="card__text">${article.description}</p>
                        </div>
                    `;
                    cardWrapper.appendChild(card);
                    newsContainer.appendChild(cardWrapper);
                });
            });
    };

    const mouse = Mouse.create(render.canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: {
            stiffness: 0.2,
            render: { visible: false }
        }
    });

    World.add(engine.world, mouseConstraint);
    render.mouse = mouse;

    // Matter.Mouse binds wheel listeners (mousewheel + Firefox's legacy
    // DOMMouseScroll) that call preventDefault, which hijacks page scrolling.
    // Chromium/WebKit fire the legacy `mousewheel` (separate from the `wheel`
    // event that drives their scrolling) so they're unaffected, but Firefox's
    // DOMMouseScroll cancellation makes scrolling slow/janky. Detach them so
    // the page scrolls natively in every browser.
    mouse.element.removeEventListener('mousewheel', mouse.mousewheel);
    mouse.element.removeEventListener('DOMMouseScroll', mouse.mousewheel);

    // Matter binds its own (non-passive) touch listeners that call preventDefault
    // on every touchmove, which forces slow main-thread scrolling and makes the
    // page stutter on phones. Detach them so the page scrolls smoothly/natively.
    // Word dragging stays a desktop (mouse) interaction; on touch we support
    // tap-to-select instead (see below). Matter reuses the mouse-event handlers
    // for touch, so these are exactly the references it registered.
    mouse.element.removeEventListener('touchstart', mouse.mousedown);
    mouse.element.removeEventListener('touchmove', mouse.mousemove);
    mouse.element.removeEventListener('touchend', mouse.mouseup);

    // Highlight the word under `point` (canvas coordinates) and its articles,
    // clearing any previous selection. Shared by mouse clicks and touch taps.
    const selectAtPoint = (point) => {
        const bodies = Matter.Query.point(engine.world.bodies, point);

        if (selectedBody) {
            selectedBody.render.sprite.texture = selectedBody.originalTexture;
            selectedBody = null;
        }

        document.querySelectorAll('.card__wrapper').forEach(card => {
            card.classList.remove('highlight');
        });

        if (bodies.length > 0) {
            const clickedBody = bodies[0];
            if (!clickedBody.isStatic && clickedBody.article_ids) {
                selectedBody = clickedBody;
                const highlightTexture = createWordTexture(selectedBody.word, selectedBody.size, '#0f62fe');
                selectedBody.render.sprite.texture = highlightTexture;

                clickedBody.article_ids.forEach(id => {
                    const card = document.querySelector(`.card__wrapper[data-article-id='${id}']`);
                    if (card) {
                        card.classList.add('highlight');
                    }
                });
            }
        }
    };

    Events.on(mouseConstraint, 'mousedown', (event) => {
        selectAtPoint(event.mouse.position);
    });

    // Touch tap = select. Listeners are passive so scrolling stays on the fast
    // (compositor) path. A gesture only counts as a tap when the finger barely
    // moved and lifted quickly; longer gestures are scrolls, left to the browser.
    let touchStart = null;
    render.canvas.addEventListener('touchstart', (event) => {
        touchStart = event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() }
            : null;
    }, { passive: true });

    render.canvas.addEventListener('touchend', (event) => {
        if (!touchStart) return;
        const touch = event.changedTouches[0];
        const moved = Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y);
        const elapsed = Date.now() - touchStart.time;
        touchStart = null;
        if (moved < 10 && elapsed < 400) {
            const rect = render.canvas.getBoundingClientRect();
            selectAtPoint({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
        }
    }, { passive: true });

    // Pause physics + rendering while the canvas is scrolled out of view, so
    // reading the Articles section stays smooth and doesn't burn battery.
    if ('IntersectionObserver' in window) {
        let simRunning = true;
        const observer = new IntersectionObserver((entries) => {
            const visible = entries.some(entry => entry.isIntersecting);
            if (visible && !simRunning) {
                Runner.run(runner, engine);
                Render.run(render);
                simRunning = true;
            } else if (!visible && simRunning) {
                Runner.stop(runner);
                Render.stop(render);
                simRunning = false;
            }
        });
        observer.observe(render.canvas);
    }

    Events.on(engine, 'beforeUpdate', () => {
        engine.world.bodies.forEach(body => {
            const vx = body.velocity.x;
            const vy = body.velocity.y;
            const speed = Math.sqrt(vx * vx + vy * vy);
            if (speed > MAX_SPEED) {
                const ratio = MAX_SPEED / speed;
                Body.setVelocity(body, { x: vx * ratio, y: vy * ratio });
            }
        });
    });

    const toggleMenu = (button) => {
        const nav = document.getElementById('nav-menu');
        const overlay = document.getElementById('nav-overlay');
        const isOpen = nav.classList.toggle('active');
        button.classList.toggle('active');
        overlay.classList.toggle('active', isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
        nav.setAttribute('aria-hidden', String(!isOpen));
    };

    const reloadWords = () => {
        const topic = document.getElementById('category-select').value;
        const edition = document.getElementById('edition-select').value;
        const count = parseInt(document.getElementById('word-count').value);
        const frictionAir = parseFloat(document.getElementById('friction-air').value);
        const restitution = parseFloat(document.getElementById('restitution').value);
        const maxSpeed = parseFloat(document.getElementById('max-speed').value);
        const excluded_words = Array.from(document.querySelectorAll('.excluded-words-text')).map(element => element.innerText).join(',');

        MAX_SPEED = maxSpeed;
        // Rotation is applied only on reload (each body picks up allowRotation in
        // loadWords), so read the toggle here alongside the other settings.
        allowRotation = document.getElementById('rotation-toggle').checked;
        selectedBody = null;

        saveSettings();

        World.clear(engine.world, false);
        createWalls();
        loadWords(topic, edition, count, frictionAir, restitution, excluded_words);
        World.add(engine.world, mouseConstraint);
    };

    document.querySelector('.hamburger').addEventListener('click', function() {
        toggleMenu(this);
    });

    // Tapping the backdrop (mobile) closes the sidebar.
    document.getElementById('nav-overlay').addEventListener('click', () => {
        toggleMenu(document.querySelector('.hamburger'));
    });

    document.getElementById('reload-button').addEventListener('click', reloadWords);

    const input = document.getElementById('excluded-words-input');
    const container = document.getElementById('excluded-words-container');

    const createLable = (text) => {
        const label = document.createElement('div');
        label.className = 'excluded-words-label';

        const span = document.createElement('span');
        span.className = 'excluded-words-text';
        span.textContent = text;

        const removeBtn = document.createElement('div');
        removeBtn.className = 'excluded-words-remove';

        label.appendChild(span);
        label.appendChild(removeBtn);

        label.addEventListener('click', () => label.remove());

        container.insertBefore(label, input);
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim() !== '') {
            createLable(input.value.trim());
            input.value = '';
        }
    });

    container.addEventListener('click', (e) => {
        if (e.target === container) {
            input.style.opacity = '1';
            input.style.pointerEvents = 'auto';
            input.style.position = 'static';
            input.style.width = '200px';
            input.style.height = 'auto';
            input.style.border = 'none';
            input.style.outline = 'none';
            input.style.boxShadow = 'none';
            input.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            input.style.opacity = '0';
            input.style.pointerEvents = 'none';
            input.style.position = 'absolute';
            input.style.width = '0';
            input.style.height = '0';
            input.style.border = 'none';
            input.style.outline = 'none';
            input.style.boxShadow = 'none';
        }
    });

    // Stopwords / particles are now removed server-side, so there are no
    // default excluded words; users can still add their own.
    const default_excluded_words = [];

    // Persist the settings panel to localStorage on every Reload and restore it
    // on the next visit, so a user's configuration survives closing the page.
    const SETTINGS_KEY = 'word-float-settings';

    function saveSettings() {
        const data = {
            edition: document.getElementById('edition-select').value,
            category: document.getElementById('category-select').value,
            wordCount: document.getElementById('word-count').value,
            frictionAir: document.getElementById('friction-air').value,
            restitution: document.getElementById('restitution').value,
            maxSpeed: document.getElementById('max-speed').value,
            rotation: document.getElementById('rotation-toggle').checked,
            excludedWords: Array.from(document.querySelectorAll('.excluded-words-text'))
                .map(el => el.innerText)
        };
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
        } catch (e) {
            /* storage unavailable (e.g. private mode) — settings just won't persist */
        }
    }

    function restoreSettings() {
        let data;
        try {
            data = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        } catch (e) {
            return;
        }
        if (!data) return;

        const setValue = (id, value) => {
            if (value !== undefined && value !== null) {
                document.getElementById(id).value = value;
            }
        };
        setValue('edition-select', data.edition);
        setValue('category-select', data.category);
        setValue('word-count', data.wordCount);
        setValue('friction-air', data.frictionAir);
        setValue('restitution', data.restitution);
        setValue('max-speed', data.maxSpeed);
        document.getElementById('rotation-toggle').checked = !!data.rotation;
        (data.excludedWords || []).forEach(word => {
            if (word && word.trim()) createLable(word.trim());
        });
    }

    restoreSettings();
    // reloadWords() reads the (now restored) panel, applies MAX_SPEED / rotation,
    // persists the settings, and performs the initial word load.
    reloadWords();
});
