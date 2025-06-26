import requests
from collections import Counter
import re

from flask import Flask, jsonify, render_template, request


USE_DUMMY = True
NEWS_API_KEY = 'YOUR_NEWS_API_KEY'

STOP_WORDS_SET = {
    '#Articles': ['a', 'an', 'the'],
    '#Conjunctions': ['and', 'or', 'but', 'so', 'if', 'because', 'while', 'since', 'until', 'than', 'as', 'that', 'whether'],
    '#Prepositions': ['in', 'on', 'at', 'of', 'to', 'for', 'with', 'by', 'from', 'about', 'above', 'across', 'after', 'against', 'around', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond', 'down', 'during', 'into', 'like', 'near', 'off', 'out', 'over', 'through', 'under', 'up', 'upon'],
    '#Pronouns': ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves', 'what', 'which', 'who', 'whom', 'whose', 'this', 'that', 'these', 'those', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor'],
    '#Be-verbs': ['is', 'am', 'are', 'was', 'were', 'be', 'being', 'been'],
    '#Auxiliary Verbs': ['have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'will', 'would','shall', 'should', 'can', 'could', 'may', 'might', 'must'],
    '#Common Adverbs & Others': ['not', 'very', 'just', 'also', 'too', 'so', 'only', 'here', 'there', 'when', 'where', 'why', 'how', 'again', 'then', 'once', 'further', 'now', 'always', 'never']
}

if USE_DUMMY:
    import json
    with open('test.json', 'r', encoding='utf-8') as f:
        dummy_data = json.load(f)


app = Flask(__name__)

def fetch_words(category, count, excluded_words):
    if USE_DUMMY:
        articles_data = dummy_data.get('articles', [])
    else:
        url = f'https://newsapi.org/v2/top-headlines'
        headers = {'X-Api-Key': NEWS_API_KEY}
        params = {
            'category': category,
            'pageSize': 100
        }
        res = requests.get(url, headers=headers, params=params)
        articles_data = res.json().get('articles', [])

    articles = []
    for i, article in enumerate(articles_data):
        article['id'] = i
        articles.append(article)

    word_to_articles = {}
    full_text = ''
    for article in articles:
        text = article['title'].rsplit(" - ", 1)[0] + ' ' + (article['description'] or '')
        words_in_article = set(re.findall(r'\b\w+\b', text.lower()))
        for word in words_in_article:
            if word not in word_to_articles:
                word_to_articles[word] = []
            word_to_articles[word].append(article['id'])
        full_text += text + ' '

    words = re.findall(r'\b\w+\b', full_text.lower())
    freq = Counter(words)
    freq = Counter({w: f for w, f in freq.items() if w not in excluded_words})
    common = freq.most_common(count)

    return {
        'words': [{'word': w, 'freq': f, 'article_ids': word_to_articles.get(w, [])} for w, f in common if len(w) > 1],
        'articles': [{
            'id': article['id'],
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
    excluded_words_str = request.args.get('excluded', '')
    excluded_words = []
    for w in excluded_words_str.split(','):
        w = w.strip()
        if w == '': continue
        elif w in STOP_WORDS_SET:
            excluded_words.extend(STOP_WORDS_SET[w])
        else:
            excluded_words.append(w.lower())

    return jsonify(fetch_words(category=category, count=count, excluded_words=excluded_words))


if __name__ == "__main__":
    app.run(debug=True)
