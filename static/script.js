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

    // Mobile browsers fire `resize` continuously as the URL bar shows/hides
    // during scrolling. Rebuilding the canvas buffer + walls + repositioning
    // every body on each of those events is what makes scrolling stutter, so
    // debounce until the size settles before doing the expensive rebuild.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resizeTimer = null;
            handleResize();
        }, 200);
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

    const MIN_FONT_SIZE = 16;

    const loadWords = (topic = 'TOP', edition = 'JP', count = 50, frictionAir = 0.001, restitution = 1, excluded_words = default_excluded_words, maxFontSize = 80, minFontSize = MIN_FONT_SIZE) => {
        // Clamp the min to a sane floor, then keep the max strictly above it so
        // the size scale never inverts and produces zero/negative font sizes.
        const minSize = Math.max(1, minFontSize);
        const maxSize = Math.max(maxFontSize, minSize + 1);
        const excludedList = Array.isArray(excluded_words) ? excluded_words : String(excluded_words).split(',');
        const excludedSet = new Set(excludedList.map(s => s.trim().toLowerCase()).filter(Boolean));

        fetch(`/api/news?topic=${encodeURIComponent(topic)}&edition=${encodeURIComponent(edition)}&limit=${count}`)
            .then(res => {
                if (!res.ok) {
                    const err = new Error(`HTTP ${res.status}`);
                    err.status = res.status;
                    throw err;
                }
                return res.json();
            })
            .then(raw => {
                const { words: allWords, articles } = adaptResponse(raw);
                const words = allWords.filter(w => !excludedSet.has(w.word.toLowerCase()));

                const maxFreq = words.length ? Math.max(...words.map(w => w.freq)) : 0;
                const minFreq = words.length ? Math.min(...words.map(w => w.freq)) : 0;
                const freqRange = (maxFreq - minFreq) || 1;

                words.forEach(w => {
                    const size = minSize + ((w.freq - minFreq) / freqRange) * (maxSize - minSize);
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
                        window.open(article.url, '_blank', 'noopener,noreferrer');
                    });

                    // Build the card with DOM APIs and textContent instead of a
                    // template string + innerHTML: article.title/description come
                    // from Google News RSS and are html.unescape'd server-side, so
                    // they can contain markup that innerHTML would execute (XSS).
                    const card = document.createElement('article');
                    card.className = 'card';

                    const header = document.createElement('div');
                    header.className = 'card__header';
                    const title = document.createElement('p');
                    title.className = 'card__title';
                    title.textContent = article.title;
                    header.appendChild(title);

                    const body = document.createElement('div');
                    body.className = 'card__body';
                    const text = document.createElement('p');
                    text.className = 'card__text';
                    text.textContent = article.description;
                    body.appendChild(text);

                    card.appendChild(header);
                    card.appendChild(body);
                    cardWrapper.appendChild(card);
                    newsContainer.appendChild(cardWrapper);
                });
            })
            .catch((err) => {
                const newsContainer = document.getElementById('news-container');
                newsContainer.innerHTML = '';
                const msg = document.createElement('p');
                msg.className = 'news-error';
                msg.textContent = 'ニュースの取得に失敗しました。時間をおいて再読み込みしてください。';
                newsContainer.appendChild(msg);

                // Also float a few red error words on the canvas so the failure
                // is visible even when the user hasn't scrolled to Articles.
                // No word/article_ids props -> selectAtPoint ignores them (not
                // clickable); World.clear on Reload removes them like any body.
                const errorWords = ['Failed', 'Error', '取得失敗'];
                if (err && err.status) errorWords.push(String(err.status));

                const size = 40;
                errorWords.forEach(word => {
                    const texture = createWordTexture(word, size, '#da1e28');
                    const ctx = document.createElement('canvas').getContext('2d');
                    ctx.font = `600 ${size}px 'IBM Plex Sans'`;
                    const width = ctx.measureText(word).width;

                    const body = Bodies.rectangle(
                        Math.random() * (window.innerWidth - 100) + 50,
                        Math.random() * (window.innerHeight - 100) + 50,
                        width,
                        size,
                        {
                            render: { sprite: { texture, xScale: 1, yScale: 1 } },
                            restitution: 1,
                            frictionAir: 0.001
                        }
                    );
                    body.defaultInertia = body.inertia;
                    applyRotation(body);
                    Body.setVelocity(body, {
                        x: (Math.random() - 0.5) * 2,
                        y: (Math.random() - 0.5) * 2
                    });
                    World.add(engine.world, body);
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

        reorderArticles();
    };

    // Float highlighted article cards to the top; otherwise fall back to the
    // original (article-id) order. Called after every selection change.
    // Uses the FLIP technique: snapshot positions before the DOM reorder, then
    // animate each card from its old position to its new one.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reorderArticles = () => {
        const container = document.getElementById('news-container');
        const cards = Array.from(container.querySelectorAll('.card__wrapper'));

        const firstRects = new Map();
        if (!reduceMotion.matches) {
            cards.forEach(card => firstRects.set(card, card.getBoundingClientRect()));
        }

        cards.sort((a, b) => {
            const ah = a.classList.contains('highlight') ? 0 : 1;
            const bh = b.classList.contains('highlight') ? 0 : 1;
            if (ah !== bh) return ah - bh;
            return Number(a.dataset.articleId) - Number(b.dataset.articleId);
        });
        // appendChild moves existing nodes, so this reorders in place.
        cards.forEach(card => container.appendChild(card));

        firstRects.forEach((first, card) => {
            const last = card.getBoundingClientRect();
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            if (dx || dy) {
                card.animate(
                    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
                    { duration: 400, easing: 'cubic-bezier(0.2, 0, 0.2, 1)' }
                );
            }
        });
    };

    Events.on(mouseConstraint, 'mousedown', (event) => {
        selectAtPoint(event.mouse.position);
    });

    // --- Touch interaction -------------------------------------------------
    // Default touches (empty canvas) stay on the browser's fast, passive scroll
    // path. We only take over the gesture when the finger lands on a word:
    //   - drag  -> the physics body follows the finger, then is "thrown" on lift
    //   - tap    -> select the word and highlight its articles
    //   - tap on empty space -> clear the selection
    // The (non-passive) move listener is attached ONLY for the duration of a
    // drag, so when the user is scrolling there is no non-passive touchmove
    // handler to slow it down.
    const canvasPoint = (touch) => {
        const rect = render.canvas.getBoundingClientRect();
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    let touchStart = null;              // for tap detection
    let dragBody = null;
    let dragOffset = { x: 0, y: 0 };    // finger position relative to body center
    let dragPrev = { x: 0, y: 0 };      // previous target, for throw velocity
    let dragVelocity = { x: 0, y: 0 };

    const onTouchDragMove = (event) => {
        if (!dragBody || event.touches.length !== 1) return;
        event.preventDefault();         // hold the page still while dragging
        const point = canvasPoint(event.touches[0]);
        const target = { x: point.x - dragOffset.x, y: point.y - dragOffset.y };
        dragVelocity = { x: target.x - dragPrev.x, y: target.y - dragPrev.y };
        dragPrev = target;
        Body.setPosition(dragBody, target);
        Body.setVelocity(dragBody, { x: 0, y: 0 });
    };

    const stopTouchDrag = () => {
        render.canvas.removeEventListener('touchmove', onTouchDragMove);
        dragBody = null;
        touchStart = null;
    };

    render.canvas.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1) { stopTouchDrag(); return; }
        const touch = event.touches[0];
        touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
        const point = canvasPoint(touch);
        const hit = Matter.Query.point(engine.world.bodies.filter(b => !b.isStatic), point);
        if (hit.length > 0) {
            dragBody = hit[0];
            dragOffset = { x: point.x - dragBody.position.x, y: point.y - dragBody.position.y };
            dragPrev = { x: dragBody.position.x, y: dragBody.position.y };
            dragVelocity = { x: 0, y: 0 };
            event.preventDefault();     // claim the gesture: no page scroll
            render.canvas.addEventListener('touchmove', onTouchDragMove, { passive: false });
        } else {
            dragBody = null;            // empty space -> leave scrolling to the browser
        }
    }, { passive: false });

    render.canvas.addEventListener('touchend', (event) => {
        render.canvas.removeEventListener('touchmove', onTouchDragMove);
        const touch = event.changedTouches[0];

        if (dragBody) {
            // Throw the word with the finger's final velocity (clamped so a
            // fast flick can't exceed the simulation's speed cap).
            const clamp = (v) => Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
            Body.setVelocity(dragBody, { x: clamp(dragVelocity.x), y: clamp(dragVelocity.y) });
        }

        // A gesture that barely moved is a tap: select the word under it, or
        // clear the selection when it landed on empty space.
        if (touchStart && touch) {
            const moved = Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y);
            const elapsed = Date.now() - touchStart.time;
            if (moved < 10 && elapsed < 400) {
                selectAtPoint(canvasPoint(touch));
            }
        }

        dragBody = null;
        touchStart = null;
    }, { passive: false });

    render.canvas.addEventListener('touchcancel', stopTouchDrag);

    // Pause physics + rendering while the canvas is scrolled out of view, so
    // reading the Articles section stays smooth and doesn't burn battery.
    // Hoisted out of the IntersectionObserver block so the keydown handler can
    // read it (word key-controls are disabled while the canvas is off-screen).
    // Defaults to true; on browsers without IntersectionObserver it stays true.
    let simRunning = true;
    if ('IntersectionObserver' in window) {
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
        // Lock the page behind the sidebar so touch scrolling stays inside the
        // panel instead of leaking to the page underneath.
        document.body.style.overflow = isOpen ? 'hidden' : '';
    };

    const reloadWords = () => {
        const topic = document.getElementById('category-select').value;
        const edition = document.getElementById('edition-select').value;
        const count = parseInt(document.getElementById('word-count').value);
        const maxFontSize = parseFloat(document.getElementById('max-font-size').value);
        const minFontSize = parseFloat(document.getElementById('min-font-size').value);
        // Air Resistance is shown on a friendly 0–50 integer scale; Matter's
        // frictionAir wants the tiny real value, so scale it back down.
        const frictionAir = parseFloat(document.getElementById('friction-air').value) / 1000;
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
        loadWords(topic, edition, count, frictionAir, restitution, excluded_words, maxFontSize, minFontSize);
        World.add(engine.world, mouseConstraint);

        // Reveal the freshly-loaded words: close the sidebar if it's open. (On the
        // initial page-load call the panel isn't open, so this is a no-op then.)
        const nav = document.getElementById('nav-menu');
        if (nav.classList.contains('active')) {
            toggleMenu(document.querySelector('.hamburger'));
        }
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
            maxFontSize: document.getElementById('max-font-size').value,
            minFontSize: document.getElementById('min-font-size').value,
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
        setValue('max-font-size', data.maxFontSize);
        setValue('min-font-size', data.minFontSize);
        // Migrate settings saved under the old actual-unit air resistance
        // (e.g. 0.001) onto the new 0–50 integer scale.
        let frictionAirValue = data.frictionAir;
        if (frictionAirValue != null && parseFloat(frictionAirValue) > 0 && parseFloat(frictionAirValue) < 1) {
            frictionAirValue = Math.round(parseFloat(frictionAirValue) * 1000);
        }
        setValue('friction-air', frictionAirValue);
        setValue('restitution', data.restitution);
        setValue('max-speed', data.maxSpeed);
        document.getElementById('rotation-toggle').checked = !!data.rotation;
        (data.excludedWords || []).forEach(word => {
            if (word && word.trim()) createLable(word.trim());
        });
        syncSettingDisplays();
    }

    // Slider ↔ editable value-box pairs. The slider is the source of truth; the
    // box mirrors it and can also be typed into to drive the slider.
    const SETTING_PAIRS = [
        { slider: 'word-count',    box: 'word-count-value' },
        { slider: 'min-font-size', box: 'min-font-size-value' },
        { slider: 'max-font-size', box: 'max-font-size-value' },
        { slider: 'friction-air',  box: 'friction-air-value' },
        { slider: 'restitution',   box: 'restitution-value' },
        { slider: 'max-speed',     box: 'max-speed-value' },
    ];

    // Paint the blue segment between the two font-size thumbs.
    function updateFontFill() {
        const range = document.getElementById('font-size-range');
        const minEl = document.getElementById('min-font-size');
        const maxEl = document.getElementById('max-font-size');
        const lo = parseFloat(minEl.min);
        const hi = parseFloat(minEl.max);
        const pct = v => ((parseFloat(v) - lo) / (hi - lo)) * 100;
        range.style.setProperty('--range-min', pct(minEl.value) + '%');
        range.style.setProperty('--range-max', pct(maxEl.value) + '%');
    }

    // Normalize everything: stop the font thumbs from crossing, then mirror each
    // slider's value into its box and repaint the font fill.
    function syncSettingDisplays() {
        const minEl = document.getElementById('min-font-size');
        const maxEl = document.getElementById('max-font-size');
        const minBox = document.getElementById('min-font-size-value');
        if (parseInt(minEl.value, 10) > parseInt(maxEl.value, 10)) {
            // Push the other thumb along with whichever one the user is driving.
            if (document.activeElement === minEl || document.activeElement === minBox) {
                maxEl.value = minEl.value;
            } else {
                minEl.value = maxEl.value;
            }
        }
        SETTING_PAIRS.forEach(({ slider, box }) => {
            document.getElementById(box).value = document.getElementById(slider).value;
        });
        updateFontFill();
    }

    SETTING_PAIRS.forEach(({ slider: sId, box: bId }) => {
        const slider = document.getElementById(sId);
        const box = document.getElementById(bId);
        slider.addEventListener('input', syncSettingDisplays);
        // While typing, drive the slider live (clamped) without reformatting the
        // box; on commit (blur/Enter) run a full normalize.
        box.addEventListener('input', () => {
            const v = parseFloat(box.value);
            if (isNaN(v)) return;
            const lo = parseFloat(slider.min);
            const hi = parseFloat(slider.max);
            slider.value = Math.min(hi, Math.max(lo, v));
            updateFontFill();
        });
        box.addEventListener('change', syncSettingDisplays);
    });

    // Initialize the boxes and font fill from the HTML defaults; restoreSettings
    // (below) re-runs this if it loads saved values.
    syncSettingDisplays();

    // --- Keyboard word controls --------------------------------------------
    // WASD nudge every word one direction, F boosts (along its velocity, or a
    // random direction when nearly still), R re-scatters all words. Velocity is
    // added, never overwritten, so the beforeUpdate MAX_SPEED clamp still bounds
    // everything. One application per physical keydown (repeats are ignored).
    const KEY_IMPULSE = 3;      // WASD / F の1回あたりの加算速度
    const STILL_EPS = 0.1;      // F: この速さ未満なら「静止」とみなしランダム方向

    const wordBodies = () => engine.world.bodies.filter(b => !b.isStatic);

    const addVelocity = (body, dx, dy) => {
        Body.setVelocity(body, {
            x: body.velocity.x + dx,
            y: body.velocity.y + dy
        });
    };

    const DIRECTIONS = {
        w: { x: 0, y: -1 },
        a: { x: -1, y: 0 },
        s: { x: 0, y: 1 },
        d: { x: 1, y: 0 },
    };

    document.addEventListener('keydown', (event) => {
        // Ignore OS key-repeat (physical presses only), browser shortcuts
        // (Ctrl/Cmd/Alt), typing in inputs, and when the canvas is off-screen.
        if (event.repeat) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const t = event.target;
        if (t instanceof HTMLElement &&
            (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (!simRunning) return;

        const key = event.key.toLowerCase();

        if (DIRECTIONS[key]) {
            // WASD: 一方向インパルス
            const dir = DIRECTIONS[key];
            wordBodies().forEach(body => {
                addVelocity(body, dir.x * KEY_IMPULSE, dir.y * KEY_IMPULSE);
            });
            event.preventDefault();
        } else if (key === 'f') {
            // F: 動いていれば速度方向、静止していればランダム方向
            wordBodies().forEach(body => {
                const vx = body.velocity.x, vy = body.velocity.y;
                const speed = Math.hypot(vx, vy);
                let ux, uy;
                if (speed >= STILL_EPS) {
                    ux = vx / speed;
                    uy = vy / speed;
                } else {
                    const theta = Math.random() * Math.PI * 2;
                    ux = Math.cos(theta);
                    uy = Math.sin(theta);
                }
                addVelocity(body, ux * KEY_IMPULSE, uy * KEY_IMPULSE);
            });
            event.preventDefault();
        } else if (key === 'r') {
            // R: 位置・速度のリセット（API再取得はしない）
            const margin = 50;
            wordBodies().forEach(body => {
                Body.setPosition(body, {
                    x: Math.random() * (window.innerWidth - margin * 2) + margin,
                    y: Math.random() * (window.innerHeight - margin * 2) + margin
                });
                Body.setVelocity(body, {
                    x: (Math.random() - 0.5) * 2,
                    y: (Math.random() - 0.5) * 2
                });
                Body.setAngularVelocity(body, 0);
            });
            event.preventDefault();
        }
    });

    restoreSettings();
    // reloadWords() reads the (now restored) panel, applies MAX_SPEED / rotation,
    // persists the settings, and performs the initial word load.
    reloadWords();
});
