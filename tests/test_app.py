import pytest
from application.app import app
from flask.testing import FlaskClient

"""
Testar lite olika statuskoder och errors, har tagit hjälp av tidigare föreläsningar men även:
https://pytest-with-eric.com/introduction/pytest-assert-exception/
"""


@pytest.fixture
def client():
    """
    Skapar en testklient för flask så vi kan testa våra funtioner
    """
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


def test_index_route(client):
    """
    Testar så index ger 200
    """
    response = client.get('/')
    assert response.status_code == 200


def test_top10(client):
    """
    Testar /top10 om man angett rätt i formuläret
    """
    response = client.post('/top10', data={'formArtist': 'Artist', 'countrycode': 'SE'})
    assert response.status_code == 200


def test_top10_error(client: FlaskClient):
    """
    Testar ifall man skriver fel i formuläret så blir det KeyError
    """
    with pytest.raises(KeyError):
        client.post('/top10', data={'formArtist': 'NaN', 'countrycode': 1})


def test_recommendations(client):
    """
    Testar så rekommenderade låtar ger ok
    """
    response = client.get('/recommendations')
    assert response.status_code == 200


def test_new(client):
    """
    Testar så new ger ok
    """
    response = client.get('/new')
    assert response.status_code == 200


# Om sidan saknas så borde vi få 404, testar för det
def test_404_error(client):
    response = client.get('/error')
    assert response.status_code == 404
