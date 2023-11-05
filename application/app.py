from flask import Flask, render_template, request, session, redirect, url_for
from flask_session import Session
from application import func
import os

app = Flask(__name__)
app.secret_key = os.urandom(24)
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)


@app.route("/login", methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        client_id = request.form['client_id']
        client_secret = request.form['client_secret']
        session['client_id'] = client_id
        session['client_secret'] = client_secret
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route("/", methods=['GET', 'POST'])
def index():
    client_id = session.get('client_id')
    client_secret = session.get('client_secret')

    if client_id is None or client_secret is None:
        return redirect(url_for('login'))  # Om client_id eller client_secret saknas, omdirigera till inloggningssidan

    # Hämtar funktionen från func och skickar det vidare till index.html för att skapa en dropdown med flera länder
    data_form = func.countrycode_form()
    genres_form = func.genres_form()

    context = {
        'title': 'Home',
        'data_form': data_form,
        'genres_form': genres_form
    }

    return render_template('index.html', **context)


@app.route("/top10", methods=['POST'])
def top10():
    """
    Listar en artists top10 låtar just nu
    """
    artist_name = request.form["formArtist"]
    country_code = request.form["countrycode"]
    artist_data = func.get_top10(artist_name, country_code)

    context = {
        'data': artist_data,
        'title': 'Top 10',
        'artist_name': artist_name
    }

    return render_template('top10.html', **context)


@app.route("/recommendations", methods=['POST'])
def rec():
    """
    Denna route hämtar rekommenderade låtar via spotifys API, låter dig även lyssna på en preview (om det finns).
    """
    genre_artist_name = request.form["recommendationArtist"]
    genre = request.form["formGenres"]
    genre_data = func.get_recommendations(genre_artist_name, genre)

    # Med en dictionary plockar jag ut det jag vill skicka som arg till recommendations.html i return för att förkorta return
    # Källa: https://youtu.be/tqZxama6tiE?t=118
    context = {
        'genre_data': genre_data,
        'title': 'Recommendations',
        'genre_artist_name': genre_artist_name,
        'genre': genre
    }

    return render_template('recommendations.html', **context)


@app.route("/new")
def new():
    """
    Denna route hämtar nya album via spotifys API.
    """

    return render_template('new.html', title="New releases")


@app.errorhandler(404)
def page_not_found(e):
    """
    Hanterar errorkod 404.
    """
    return render_template('404.html', title="404 Error")


@app.errorhandler(405)
def method_not_allowed(e):
    """
    Hanterar errorkod 405.
    """
    return render_template('404.html', title="405 Error")
