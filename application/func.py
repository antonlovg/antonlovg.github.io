import base64
import requests
import json
import pandas as pd
import urllib.request
import ssl
from flask import session


def get_token():
    """
    Skapar en token med hjälp av api-nyckalr client_id och client_secret
    Denna token är en bearer till övrig kod som Spotify behöver vid varje hämtning av API
    Hämtar detta token och gör om till string samt tilldelar till token och returnerar det
    Med hjälp av: https://www.youtube.com/watch?v=WAmEZBEeNmg (28/10-2023)
    """

    # Hämtar dessa värden från en fil spot_info.py som inte skickas till github via .gitignore
    client_id = session.get('client_id')
    client_secret = session.get('client_secret')

    # Med hjälp av client_id och client_secret kan man ta fram token som behövs i övrig kod
    auth_string = f"{client_id}:{client_secret}"
    auth_bytes = auth_string.encode("utf-8")
    auth_base64 = base64.b64encode(auth_bytes).decode("utf-8")

    url = "https://accounts.spotify.com/api/token"
    headers = {
        "Authorization": f"Basic {auth_base64}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {"grant_type": "client_credentials"}

    result = requests.post(url, headers=headers, data=data)
    json_result = result.json()
    token = json_result["access_token"]
    return token


def search_for_id(token, artist_name):
    """
    Då artister inte sparas i klartext behöver vi ta fram ID för den artist vi söker fram och spara ID:t
    Spotify har en search-funktion där man kan söka efter items, och vi är just nu bara intresserade av artist-id.
    Arg vi hämtar är artist_name som användaren skriver i formulär under index.html samt token från get_token()
    https://developer.spotify.com/documentation/web-api/reference/search
    """

    url = "https://api.spotify.com/v1/search"
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "q": artist_name,
        "type": "artist",
        "limit": 1
    }

    result = requests.get(url, headers=headers, params=params)

    json_result = result.json()
    artists = json_result.get("artists")
    items = artists.get("items")

    if not items:
        return None

    return items[0]['id']


def get_songs_by_artist(token, artist_id, country_code):
    """
    Här hämtar vi top 10 låtar från en artist vi söker fram
    Vi tar även med country_code som vi hämtar från en annan API då artisten kan vara olika populär i olika länder.
    https://developer.spotify.com/documentation/web-api/reference/get-an-artists-top-tracks
    """

    url = f"https://api.spotify.com/v1/artists/{artist_id}/top-tracks?country={country_code}"
    headers = {"Authorization": f"Bearer {token}"}
    result = requests.get(url, headers=headers)
    json_result = result.json()
    return json_result


def get_top10(artist_name, country_code):
    """
    Här kombinerar vi allt och skapar en pandas-dataframe med information vi fått fram.
    """

    token = get_token()
    # Ersätter namnet på artisten (genre_artist_name) med id istället med hjälp av funktionen search_for_id
    artist_id = search_for_id(token, artist_name)
    json_result = get_songs_by_artist(token, artist_id, country_code)

    tracks = json_result.get("tracks")
    df = pd.DataFrame(tracks)

    if not tracks:
        return None

    table_data = df.to_html(columns=["name", "popularity"], classes="custom-table text-outline", justify="left",
                            index=False, escape=False).replace('border="1"', 'border="0"')

    return table_data


def get_recommendations(genre_artist_name, genre):
    """
    Sätter ihop delar för att få fram rekommendationer baserat på vilka alternativ man väljer
    Den ska även ta fram länk till Spotify men också en "preview"-player som finns i HTML5 (https://www.w3schools.com/html/html5_audio.asp).
    Tog hjälp av stackoverflow för att få till det:
    https://stackoverflow.com/questions/61913315/format-a-pandas-object-column

    """
    token = get_token()
    # Ersätter namnet på artisten (genre_artist_name) med id istället med hjälp av funktionen search_for_id
    artist_id = search_for_id(token, genre_artist_name)
    genre_url = f"https://api.spotify.com/v1/recommendations?limit=10&seed_artists={artist_id}&seed_genres={genre}"
    headers = {"Authorization": f"Bearer {token}"}

    result = requests.get(genre_url, headers=headers)
    json_result = result.json()

    tracks = json_result.get('tracks', [])

    data_list = []
    for track in tracks:
        album = track['album']
        artists = track['artists']
        data = {
            'Artist': artists[0]['name'],
            'Song': track['name'],
            'External URL': f'<a href="{album["external_urls"]["spotify"]}" class="btn btn-dark" target="_blank">Listen on Spotify</a>',
            'Preview URL': track.get('preview_url', '')
        }
        data_list.append(data)

    df = pd.DataFrame(data_list)

    df['Preview URL'] = df['Preview URL'].apply(format_preview)

    # Tar bort border från pandas med replace med hjälp av: https://stackoverflow.com/questions/30531374/remove-border-from-html-table-created-via-pandas
    table_data = df.to_html(classes="custom-table text-outline", justify="left", index=False, escape=False,
                            render_links=True).replace('border="1"', 'border="0"')

    return table_data


def format_preview(preview_url):
    """
    Skapar en player då vi har en länk till mp3 i pandas under get_recommendations() samt felhantering ifall preview saknas
    """
    if pd.notna(preview_url):
        return f'<audio controls><source src="{preview_url}" type="audio/mpeg">Your browser does not support the audio element.</audio>'
    else:
        return 'There is no preview available for this song :('


# -- Koder för dropdowns -- #

def genres_form():
    """
    Hämtar alla genres från Spotifys API och returnerar dessa till genres_form då vi ska använda dessa i en dropdown med Jinja2
    """

    token = get_token()
    genres_form_url = "https://api.spotify.com/v1/recommendations/available-genre-seeds"
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(genres_form_url, headers=headers)
    genres_form = response.json()

    return genres_form


def countrycode_form():
    """
    Likt genres_form, hämtar alla countrycodes och returnerar dessa till data_form som vi sedan loopar i index.html med Jinja2
    """
    context = ssl._create_unverified_context()
    data_form_url = "https://date.nager.at/api/v3/AvailableCountries"
    json_data = urllib.request.urlopen(data_form_url, context=context).read()
    data_form = json.loads(json_data)

    return data_form


# -- Error -- #
def error():
    return error
