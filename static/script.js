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
    background: '#f0f0f0',
    wireframes: false
  }
});

Render.run(render);
Runner.run(Runner.create(), engine);

let MAX_SPEED = 50;

function createWalls() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const thickness = 100;
  World.add(engine.world, [
    Bodies.rectangle(w / 2, -thickness / 2, w, thickness, { isStatic: true }),
    Bodies.rectangle(w / 2, h + thickness / 2, w, thickness, { isStatic: true }),
    Bodies.rectangle(-thickness / 2, h / 2, thickness, h, { isStatic: true }),
    Bodies.rectangle(w + thickness / 2, h / 2, thickness, h, { isStatic: true })
  ]);
}

createWalls();

function loadWords(category = 'general', count = 50, frictionAir = 0.001, restitution = 1) {
  fetch(`/words?category=${category}&count=${count}`)
    .then(res => res.json())
    .then(data => {
      const words = data.words;
      const articles = data.articles;
      console.log(articles);

      const maxFreq = Math.max(...words.map(w => w.freq));

      words.forEach(w => {
        const size = 20 + (w.freq / maxFreq) * 80;

        const canvasText = document.createElement('canvas');
        const ctx = canvasText.getContext('2d');
        ctx.font = `${size}px sans-serif`;
        const width = ctx.measureText(w.word).width;
        canvasText.width = width;
        canvasText.height = size;
        ctx.font = `${size}px sans-serif`;
        ctx.fillStyle = '#333';
        ctx.fillText(w.word, 0, size * 0.8);

        const body = Bodies.rectangle(
          Math.random() * window.innerWidth,
          Math.random() * window.innerHeight,
          width,
          size,
          {
            render: {
              sprite: {
                texture: canvasText.toDataURL(),
                xScale: 1,
                yScale: 1
              }
            },
            restitution: restitution,
            frictionAir: frictionAir
          }
        );

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
        cardWrapper.addEventListener('click', () => {
          window.open(article.url, '_blank');
        });
        const card = document.createElement('article');
        card.className = 'card';

        const cardHeader = document.createElement('div');
        cardHeader.className = 'card__header';
        const cardTitle = document.createElement('p');
        cardTitle.className = 'card__title';
        cardTitle.innerText = article.title;
        cardHeader.appendChild(cardTitle);
        const cardThumbnail = document.createElement('figure');
        cardThumbnail.className = 'card__thumbnail'
        const cardImage = document.createElement('img');
        cardImage.className = 'card__image';
        cardImage.src = article.image;
        cardThumbnail.appendChild(cardImage);
        cardHeader.appendChild(cardThumbnail);
        card.appendChild(cardHeader);

        const cardBody = document.createElement('div');
        cardBody.className = 'card__body';
        const cardText = document.createElement('p');
        cardText.className = 'card__text';
        cardText.innerText = article.description;
        cardBody.appendChild(cardText);
        card.appendChild(cardBody);

        cardWrapper.appendChild(card);
        newsContainer.appendChild(cardWrapper);
      });
    });
}

loadWords();

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

function toggleMenu(button) {
  const nav = document.getElementById('nav-menu');
  nav.classList.toggle('active');
  button.classList.toggle('active');
}

document.getElementById('word-count').addEventListener('input', e => {
  document.getElementById('count-value').innerText = e.target.value;
});

function reloadWords() {
  const category = document.getElementById('category-select').value;
  const count = parseInt(document.getElementById('word-count').value);
  const frictionAir = parseFloat(document.getElementById('friction-air').value);
  const restitution = parseFloat(document.getElementById('restitution').value);
  const maxSpeed = parseFloat(document.getElementById('max-speed').value);

  MAX_SPEED = maxSpeed;

  World.clear(engine.world, false);
  createWalls();
  loadWords(category, count, frictionAir, restitution);
  World.add(engine.world, mouseConstraint);
}
