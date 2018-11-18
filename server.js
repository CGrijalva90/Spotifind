const express = require('express');
const app = express();
const path = require('path');
const config = require('./config');
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
const SpotifyClient = require('./spotifyApi');
const NodeGeocoder = require('node-geocoder');

const options = {
  provider: 'google',

  // Optional depending on the providers
  httpAdapter: 'https', // Default
  apiKey: config.GEOCODER_API, // for Mapquest, OpenCage, Google Premier
  formatter: null // 'gpx', 'string', ...
};

const geocoder = NodeGeocoder(options);

const clientId = config.SPOTIFY_CLIENT_ID;
const clientSecret = config.SPOTIFY_SECRET_ID;
const redirectUri = 'http://localhost:4000/callback';
const songkickApi = config.SONGKICK_API;
const PORT = process.env.PORT || 4000;


app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(cookieParser());
app.use(morgan('dev'));
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
  const { playlistName } = req.body;

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
  const upcomingEvents = await Clients.searchUpcomingEvents(
    metroId,
    songkickApi
  );

  // Filter out 'festivals' from event list
  const filteredEvents = upcomingEvents.resultsPage.results.event.filter(
    event => event.type !== 'Festival'
  );

  // Retrieve array of artist names to search for in Spotify
  const artistNames = filteredEvents.map(
    event => event.performance[0].displayName
  );

  console.log(artistNames);

  // Retrieve artists information
  const artistsPromises = artistNames.map(async artist => {
    const artists = await spotifyApi.searchArtists(artist);
    return artists;
  });

  const artistData = await Promise.all(artistsPromises);

  // Retrieve artist IDs to reach Spotify API's and grab track information
  const artistIds = [];
  artistData.forEach(artist => {
    if (artist.body.artists.items[0]) {
      artistIds.push(artist.body.artists.items[0].id);
    } else {
      return 'No ID found!';
    }
    return artistIds;
  });

  const filteredArtists = artistIds.filter(artist => artist !== 'No ID found');

  const trackPromises = filteredArtists.map(async artistId => {
    const tracks = await spotifyApi.getArtistTopTracks(artistId, 'US');
    return tracks;
  });

  const tracksData = await Promise.all(trackPromises);

  const trackUris = { uris: [] };
  tracksData.forEach(data => {
    if (data.body.tracks[0] && data.body.tracks[1] === undefined) {
      trackUris.uris.push(data.body.tracks[0].uri);
    } else if (data.body.tracks[0] && data.body.tracks[1]) {
      trackUris.uris.push(data.body.tracks[1].uri);
    } else {
      return 'No track uri found!';
    }
    return trackUris;
  });

  // Create empty Spotify playlist
  const playlist = await Clients.createSpotifyPlaylist(
    playlistName,
    SPOTIFY_ID,
    SPOTIFY_TOKEN
  );

  // Add tracks to created playlist
  const playlistCreated = await spotifyApi.addTracksToPlaylist(
    playlist.id,
    trackUris.uris
  );

  console.log('\x1b[33m%s\x1b[0m', 'playlist successfully created!');

  res.send({ data: playlist });
  return playlistCreated;
});

app.listen(PORT, () => {
  console.log(`Server is now listening on port: ${PORT}`);
});
