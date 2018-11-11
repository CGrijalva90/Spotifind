const express = require('express');
const app = express();
const path = require('path');
const Spotify = require('spotify-web-api-node');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cookieParser = require('cookie-parser');
const _ = require('lodash');
const Geocodio = require('geocodio');
const morgan = require('morgan');
const Clients = require('./dataClients');
let SPOTIFY_ID = '';
let SPOTIFY_TOKEN = '';

const NodeGeocoder = require('node-geocoder');

const options = {
  provider: 'google',

  // Optional depending on the providers
  httpAdapter: 'https', // Default
  apiKey: 'AIzaSyA4SEKGigIW3WvOq-MkTeoqjy7cVV3UySs', // for Mapquest, OpenCage, Google Premier
  formatter: null // 'gpx', 'string', ...
};

const geocoder = NodeGeocoder(options);

const clientId = '12c1b2ead72e464bad8430c7abe54c31';
const clientSecret = '2eadc6a80c4842b3acacdb1860918981';
const redirectUri = 'http://localhost:4000/callback';
const songkickApi = '8AxaC9ePaMwJqgW3';
const PORT = process.env.PORT || 4000;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '/public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const scopes = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public'
];

const STATE_KEY = 'spotify_auth_state';

// generate random string to be used as state
const generateRandomString = N =>
  (Math.random().toString(36) + Array(N).join('0')).slice(2, N + 2);

const spotifyApi = new Spotify({
  clientId,
  clientSecret,
  redirectUri
});

app.get('/', (req, res) => {
  res.render('login');
});

app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  res.cookie(STATE_KEY, state);
  console.log(spotifyApi.createAuthorizeURL(scopes, state));
  res.redirect(spotifyApi.createAuthorizeURL(scopes, state));
});

app.get('/callback', (req, res) => {
  const { code, state } = req.query;
  const storedState = req.cookies ? req.cookies[STATE_KEY] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#/error/state mismatch');
  } else {
    res.clearCookie(STATE_KEY);

    spotifyApi
      .authorizationCodeGrant(code)
      .then(data => {
        const expiresIn = data.body.expires_in;
        const accessToken = data.body.access_token;
        const refreshToken = data.body.refresh_token;

        // Set the access token on the API object to use it in later calls
        SPOTIFY_TOKEN = accessToken;
        spotifyApi.setAccessToken(accessToken);
        spotifyApi.setRefreshToken(refreshToken);

        spotifyApi.getMe().then(({ body }) => {
          SPOTIFY_ID = body.id;
        });

        res.redirect('/search');
      })
      .catch(err => {
        res.redirect('/#/error/invalid token');
      });
  }
});

// Form for address input
app.get('/search', (req, res) => {
  res.render('searchForm');
});

app.post('/results', async (req, res) => {
  const { address } = req.body;
  // console.log(req.body.address);
  // console.log(req.body.playlistName);

  // Parse address to lat and lng in order to search location with Sonkick
  const geoLocation = await geocoder.geocode(
    address,
    (err, results) => results
  );
  const lat = geoLocation[0].latitude;
  const lng = geoLocation[0].longitude;

  const location = await Clients.searchLocation(lat, lng, songkickApi);
  const metroId = location.resultsPage.results.location[0].metroArea.id;

  // Search upcoming events
  const upcomingEvents = await Clients.searchUpcomingEvents(metroId, songkickApi);

  // Filter out 'festivals' from event list
  const filteredEvents = upcomingEvents.resultsPage.results.event.filter(event => event.type !== 'Festival');
  const artistNames = filteredEvents.map(event => event.performance[0].displayName);
  console.log(artistNames);
  res.send(filteredEvents);
});

app.listen(PORT, () => {
  console.log(`Server is now listening on port: ${PORT}`);
});
