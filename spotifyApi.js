const NodeGeocoder = require('node-geocoder');
const Spotify = require('spotify-web-api-node');
const Clients = require('./dataClients');

class SpotifyClient {
  constructor() {
    this.SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
    this.SPOTIFY_SECRET_ID = process.env.SPOTIFY_SECRET_ID;
    this.SONGKICK_API = process.env.SONGKICK_API;
    this.GEOCODER_API = process.env.GEOCODER_API;
    this.SPOTIFY_TOKEN = '';
    this.REDIRECT_URI = 'http://localhost:4000/callback';
    this.STATE_KEY = 'spotify_auth_state';
  }

  spotifyNodeWrap() {
    const options = {
      id: this.SPOTIFY_CLIENT_ID,
      secret: this.SPOTIFY_SECRET_ID,
      redirectUri: this.REDIRECT_URI
    };
    const spotifyApi = new Spotify(options);
    return spotifyApi;
  }

  NodeGeocoder() {
    const options = {
      provider: 'google',

      // Optional depending on the providers
      httpAdapter: 'https', // Default
      apiKey: this.GEOCODER_API, // for Mapquest, OpenCage, Google Premier
      formatter: null // 'gpx', 'string', ...
    };
    const geocoder = NodeGeocoder(options);

    return geocoder();
  }

  spotifyAuth(req, res) {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'playlist-read-private',
      'playlist-modify-private',
      'playlist-modify-public'
    ];

    // generate random string to be used as state
    const generateRandomString = N =>
      (Math.random().toString(36) + Array(N).join('0')).slice(2, N + 2);

    const state = generateRandomString(16);

    const spotifyApi = this.spotifyNodeWrap();
    const authURL = spotifyApi.createAuthorizeURL(scopes, state);
    res.redirect(authURL);
  }

  // Logic to create authroization is here:
  callback(req, res) {
    const { code, state } = req.query;
    const storedState = req.cookies ? req.cookies[this.STATE_KEY] : null;
    let SPOTIFY_ID = '';
    let SPOTIFY_TOKEN = '';

    if (state === null || state !== storedState) {
      res.redirect('/#/error/state mismatch');
    } else {
      res.clearCookie(this.STATE_KEY);

      this.spotifyApi
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
  }

  async results(req, res) {
    // Call spotifyAuth (which calls spotifynodewrapper)

    const { address } = req.body;
    const { playlistName } = req.body;
    const spotifyApi = this.spotifyNodeWrap();
    // Parse address to lat and lng in order to search location with Sonkick
    const geocoder = new this.NodeGeocoder();
    const geoLocation = await geocoder.geocode(
      address,
      (err, results) => results
    );

    const lat = geoLocation[0].latitude;
    const lng = geoLocation[0].longitude;

    const location = await Clients.searchLocation(lat, lng, this.SONGKICK_API);
    const metroId = location.resultsPage.results.location[0].metroArea.id;

    // Search upcoming events
    const upcomingEvents = await Clients.searchUpcomingEvents(
      metroId,
      this.SONGKICK_API
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

    const filteredArtists = artistIds.filter(
      artist => artist !== 'No ID found'
    );

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
    const spotifyId = this.SPOTIFY_ID;
    const spotifyToken = this.SPOTIFY_TOKEN;
    const playlist = await Clients.createSpotifyPlaylist(
      playlistName,
      spotifyId,
      spotifyToken
    );

    // Add tracks to created playlist
    const playlistCreated = await spotifyApi.addTracksToPlaylist(
      playlist.id,
      trackUris.uris
    );

    console.log('\x1b[33m%s\x1b[0m', 'playlist successfully created!');

    res.send({ data: playlist });
    return playlistCreated;
  }
}

module.exports = SpotifyClient;
