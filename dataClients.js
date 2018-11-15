const rp = require('request-promise');

const searchLocation = (lat, lng, songkickApi) => {
  const params = {
    url: `http://api.songkick.com/api/3.0/search/locations.json?location=geo:${lat},${lng}&apikey=${songkickApi}`,
    method: 'GET',
    json: true
  };

  return rp(params);
};

const searchUpcomingEvents = (metroId, songkickApi) => {
  const params = {
    url: `http://api.songkick.com/api/3.0/metro_areas/${metroId}/calendar.json?apikey=${songkickApi}`,
    method: 'GET',
    json: true
  };
  return rp(params);
};

const getArtistsTopTracks = (artistId, token) => {
  const params = {
    url: `https://api.spotify.com/v1/artists/${artistId}/top-tracks?country=US`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token} `,
      Accept: 'application/json',
      Connection: 'Keep-Alive'
    },
    json: true
  };
  return rp(params);
};

const createSpotifyPlaylist = (playlistName, userId, token) => {
  const params = {
    url: `https://api.spotify.com/v1/users/${userId}/playlists`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token} `,
      Accept: 'application/json',
      Connection: 'Keep-Alive'
    },
    body: {
      name: playlistName,
      description: 'New playlist description',
      public: false
    },
    json: true

  };
  return rp(params);
};

const addTrackToPlaylist = (userId, playlistId, uris, token) => {
  const params = {
    url: `https://api.spotify.com/v1/users/${userId}/playlists/${playlistId}/tracks?uris=${uris}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token} `,
      Accept: 'application/json',
      Connection: 'Keep-Alive'
    },
    json: true

  };
  return rp(params);
};

module.exports = {
  searchLocation,
  searchUpcomingEvents,
  getArtistsTopTracks,
  createSpotifyPlaylist,
  addTrackToPlaylist
};
