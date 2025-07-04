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
    Runner.run(Runner.create(), engine);

    let MAX_SPEED = 30;
    let selectedBody = null;

    const createWalls = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const thickness = 100;
        World.add(engine.world, [
            Bodies.rectangle(w / 2, -thickness / 2, w, thickness, { isStatic: true }),
            Bodies.rectangle(w / 2, h + thickness / 2, w, thickness, { isStatic: true }),
            Bodies.rectangle(-thickness / 2, h / 2, thickness, h, { isStatic: true }),
            Bodies.rectangle(w + thickness / 2, h / 2, thickness, h, { isStatic: true })
        ]);
    };

    createWalls();

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

    const loadWords = (category = 'general', count = 50, frictionAir = 0.001, restitution = 1, excluded_words = default_excluded_words) => {
        fetch(`/words?category=${category}&count=${count}&excluded=${encodeURIComponent(excluded_words)}`)
            .then(res => res.json())
            .then(data => {
                const { words, articles } = data;
                const maxFreq = Math.max(...words.map(w => w.freq));
                const minFreq = Math.min(...words.map(w => w.freq));

                words.forEach(w => {
                    const size = 16 + ((w.freq - minFreq) / (maxFreq - minFreq)) * 64;
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
                            <figure class="card__thumbnail">
                                <img class="card__image" src="${article.image}" alt="">
                            </figure>
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

    Events.on(mouseConstraint, 'mousedown', (event) => {
        const mousePosition = event.mouse.position;
        const bodies = Matter.Query.point(engine.world.bodies, mousePosition);

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
    });

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
        nav.classList.toggle('active');
        button.classList.toggle('active');
    };

    const reloadWords = () => {
        const category = document.getElementById('category-select').value;
        const count = parseInt(document.getElementById('word-count').value);
        const frictionAir = parseFloat(document.getElementById('friction-air').value);
        const restitution = parseFloat(document.getElementById('restitution').value);
        const maxSpeed = parseFloat(document.getElementById('max-speed').value);
        const excluded_words = Array.from(document.querySelectorAll('.excluded-words-text')).map(element => element.innerText).join(',');

        MAX_SPEED = maxSpeed;
        selectedBody = null;

        World.clear(engine.world, false);
        createWalls();
        loadWords(category, count, frictionAir, restitution, excluded_words);
        World.add(engine.world, mouseConstraint);
    };

    document.querySelector('.hamburger').addEventListener('click', function() {
        toggleMenu(this);
    });

    document.getElementById('reload-button').addEventListener('click', reloadWords);

    document.querySelector('canvas').addEventListener('wheel', (event) => {}, { passive: true });

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

    const default_excluded_words = [
        '#Articles', '#Conjunctions', '#Prepositions', '#Pronouns', '#Be-verbs', '#Auxiliary Verbs', '#Common Adverbs & Others'
    ];
    default_excluded_words.forEach(w => createLable(w));

    loadWords();
});