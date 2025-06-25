import requests
from collections import Counter
import re

from flask import Flask, jsonify, render_template, request


USE_DUMMY = True
NEWS_API_KEY = 'YOUR_NEWS_API_KEY'


if USE_DUMMY:
    import json
    with open('test.json', 'r', encoding='utf-8') as f:
        dummy_data = json.load(f)

app = Flask(__name__)

def fetch_words(category, count):
    if USE_DUMMY:
        articles = dummy_data.get('articles', [])
    else:
        url = f'https://newsapi.org/v2/top-headlines'
        headers = {'X-Api-Key': NEWS_API_KEY}
        params = {
            'category': category,
            'pageSize': 100
        }
        res = requests.get(url, headers=headers, params=params)
        articles = res.json().get('articles', [])
    text = ' '.join(article['title'] + ' ' + (article['description'] or '') for article in articles)
    words = re.findall(r'\b\w+\b', text.lower())
    freq = Counter(words)
    common = freq.most_common(count)
    return {
        'words': [{'word': w, 'freq': f} for w, f in common if len(w) > 2],
        'articles': [{
            'title': article['title'],
            'description': article['description'] or '',
            'url': article['url'],
            'image': article['urlToImage'] or 'static/noimage.png'
        } for article in articles]
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/words')
def words():
    category = request.args.get('category', 'general')
    count = int(request.args.get('count', 50))
    return jsonify(fetch_words(category=category, count=count))


if __name__ == "__main__":
    app.run(debug=True)
