# Word-Float

**Word Float**は、最新ニュース記事から単語の出現頻度を抽出し、物理エンジンを使ってインタラクティブに可視化するWebアプリケーションです。

単語は出現頻度が高いほど大きく表示され、物理演算によって画面内をふわふわと漂います。単語をクリックすると関連ニュースが表示され、現代の情報の流れを直感的に体験できます。

![main-visual](docs/images/WordFloat_01.gif)


## 特徴

- **動的な単語の可視化**: ニュース記事で頻繁に使われる単語を、その頻度に応じて異なるサイズで表示します。
- **物理ベースのアニメーション**: 単語（オブジェクト）は互いに衝突したり、壁に跳ね返ったりします。
- **インタラクティブな記事連携**: Canvas上の単語をクリックすると、その単語が含まれるニュース記事が画面下部にハイライト表示されます。
- **カスタマイズ可能な設定**:
    - ニュースカテゴリ: 7つのカテゴリ（ビジネス、エンタメ、科学など）から選択できます。
    - 単語数: 表示する単語の数を調整できます。
    - 物理パラメータ: 空気抵抗や反発係数を変更し、オブジェクトの動きをカスタマイズできます。
    - 除外単語: 分析から除外したい単語を自由に追加・削除できます。


## 技術スタック

- **バックエンド**: Python, Flask
- **フロントエンド**: JavaScript, HTML, CSS
- **物理エンジン**: Matter.js
- **データ取得**: [NewsAPI](https://newsapi.org/) (APIキーなしでもダミーデータで動作します)


## セットアップ & 実行方法

### 1. リポジトリをクローン
```bash
git clone https://github.com/SabaCan0141/Word-Float.git
cd Word-Float
```

### 2. Python仮想環境の作成と有効化
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. 依存ライブラリのインストール
requests と Flask が必要です。

```Bash
pip install Flask requests
```

### 4. News APIキーの設定（任意）
このアプリケーションは、APIキーがなくてもダミーデータ (dummy.json) を使って完全に動作します。

実際の最新ニュースを取得したい場合は、[NewsAPI](https://newsapi.org/) で無料のAPIキーを取得し、app.pyの以下の部分を書き換えてください。

```python
# app.py

# USE_DUMMYをFalseに設定
USE_DUMMY = False
# 取得したAPIキーを設定
NEWS_API_KEY = 'YOUR_NEWS_API_KEY'
```

### 5. アプリケーションの実行
```bash
python app.py
```

### 6. ブラウザでアクセス
Webブラウザで http://127.0.0.1:5000 を開いてください。


## 使い方
1. 単語の操作: Canvas内に表示されている単語は、マウスでドラッグして動かせます。

    ![interaction-demo](docs/images/WordFloat_02.gif)

2. 関連記事の表示: 単語をクリックすると、画面下の「Articles」セクションに関連記事がハイライトされます。記事カードをクリックすると、元のニュースサイトが新しいタブで開きます。

    ![Setting-demo](docs/images/WordFloat_03.gif)

3. 設定の変更: 画面右上のハンバーガーメニューから設定パネルを開けます。値を変更した後は「Reload」ボタンを押すと、Canvasに反映されます。

    ![Setting-demo](docs/images/WordFloat_04.gif)


## ファイル構成
```
Word-Float/
├─ app.py              # Flaskバックエンドのメインファイル
├─ dummy.json          # News APIの代わりに使用するダミーデータ
├─ static/
│  ├─ script.js        # フロントエンドのロジック、Matter.jsの処理
│  ├─ style.css        # スタイルシート
│  └─ noimage.png      # 未設定時のサムネイル
└─ templates/
   └─ index.html       # メインのHTMLファイル
```
